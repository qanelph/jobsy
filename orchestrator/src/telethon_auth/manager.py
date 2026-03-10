import asyncio
import logging
from dataclasses import dataclass, field

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession

from ..config import settings
from .schemas import TelethonAuthPhase, TelethonAuthStatus, QrStartResponse, TelethonSessionInfo
from .session_writer import create_session_writer

logger = logging.getLogger(__name__)

QR_TIMEOUT_SEC = 30
QR_MAX_ATTEMPTS = 6  # 6 * 30s = 3 min


@dataclass
class ActiveQrFlow:
    agent_id: int
    client: TelegramClient
    qr_login: object  # telethon QrLogin
    phase: TelethonAuthPhase = TelethonAuthPhase.QR_PENDING
    qr_url: str = ""
    error: str | None = None
    phone: str | None = None
    username: str | None = None
    first_name: str | None = None
    session_string: str | None = None
    task: asyncio.Task | None = field(default=None, repr=False)


class TelethonAuthManager:
    """Управление QR-авторизацией Telethon.
    Паттерн: in-memory _flows dict, polling статуса (как Claude OAuth).
    """

    def __init__(self) -> None:
        self._flows: dict[int, ActiveQrFlow] = {}
        self._session_writer = create_session_writer()

    async def start_qr_flow(self, agent_id: int) -> QrStartResponse:
        """Запустить QR-flow: создать Telethon client, получить первый QR."""
        # Отменить предыдущий flow если есть
        await self._cancel_flow(agent_id)

        api_id = settings.tg_api_id
        api_hash = settings.tg_api_hash
        if not api_id or not api_hash:
            raise ValueError("TG_API_ID и TG_API_HASH не настроены в глобальных настройках")

        client = TelegramClient(
            StringSession(), api_id, api_hash,
            device_model="arm64",
            system_version="23.5.0",
            app_version="1.36.0",
        )
        await client.connect()

        qr_login = await client.qr_login()

        flow = ActiveQrFlow(
            agent_id=agent_id,
            client=client,
            qr_login=qr_login,
            qr_url=qr_login.url,
        )
        self._flows[agent_id] = flow

        # Запустить фоновую задачу ожидания скана
        flow.task = asyncio.create_task(self._wait_for_scan(flow))

        return QrStartResponse(
            qr_url=qr_login.url,
            expires_in=QR_TIMEOUT_SEC,
        )

    def get_status(self, agent_id: int) -> TelethonAuthStatus:
        """Текущий статус QR-flow для агента."""
        flow = self._flows.get(agent_id)
        if not flow:
            return TelethonAuthStatus(phase=TelethonAuthPhase.IDLE)

        return TelethonAuthStatus(
            phase=flow.phase,
            qr_url=flow.qr_url if flow.phase == TelethonAuthPhase.QR_PENDING else None,
            error=flow.error,
            phone=flow.phone,
            username=flow.username,
            first_name=flow.first_name,
        )

    async def confirm_and_save(self, agent_id: int) -> TelethonSessionInfo:
        """Подтвердить успешный flow, записать session в volume агента."""
        flow = self._flows.get(agent_id)
        if not flow or flow.phase != TelethonAuthPhase.SUCCESS:
            raise ValueError("Нет успешного flow для подтверждения")

        session_bytes = flow.session_string.encode("utf-8") if flow.session_string else b""
        if not session_bytes:
            raise ValueError("Session string пуст")

        user_info = {
            "phone": flow.phone,
            "username": flow.username,
            "first_name": flow.first_name,
        }
        self._session_writer.write_to_volume(agent_id, session_bytes, user_info)

        info = TelethonSessionInfo(
            has_session=True,
            phone=flow.phone,
            username=flow.username,
            first_name=flow.first_name,
        )

        # Cleanup
        await self._disconnect_client(flow.client)
        self._flows.pop(agent_id, None)

        return info

    async def cancel_flow(self, agent_id: int) -> None:
        """Отменить текущий flow."""
        await self._cancel_flow(agent_id)

    def get_session_info(self, agent_id: int) -> TelethonSessionInfo:
        """Проверить наличие session файла и вернуть user info."""
        data = self._session_writer.get_session_info(agent_id)
        return TelethonSessionInfo(
            has_session=data.get("has_session", False),
            phone=data.get("phone"),
            username=data.get("username"),
            first_name=data.get("first_name"),
        )

    def delete_session(self, agent_id: int) -> TelethonSessionInfo:
        """Удалить session файл из volume агента."""
        self._session_writer.delete_session(agent_id)
        return TelethonSessionInfo(has_session=False)

    # --- Internal ---

    async def _wait_for_scan(self, flow: ActiveQrFlow) -> None:
        """Фоновая задача: ждём скан QR, обновляем phase."""
        try:
            for attempt in range(QR_MAX_ATTEMPTS):
                try:
                    await asyncio.wait_for(flow.qr_login.wait(QR_TIMEOUT_SEC), timeout=QR_TIMEOUT_SEC + 5)
                    # Успешная авторизация
                    me = await flow.client.get_me()
                    flow.phase = TelethonAuthPhase.SUCCESS
                    flow.phone = me.phone
                    flow.username = me.username
                    flow.first_name = me.first_name
                    flow.session_string = flow.client.session.save()
                    logger.info("Telethon QR auth success for agent %d: @%s", flow.agent_id, me.username)
                    return
                except asyncio.TimeoutError:
                    # QR истёк, обновляем
                    if attempt < QR_MAX_ATTEMPTS - 1:
                        try:
                            await flow.qr_login.recreate()
                            flow.qr_url = flow.qr_login.url
                            logger.debug("Refreshed QR for agent %d (attempt %d)", flow.agent_id, attempt + 1)
                        except Exception as e:
                            logger.error("Failed to recreate QR: %s", e)
                            flow.phase = TelethonAuthPhase.ERROR
                            flow.error = f"Ошибка обновления QR: {e}"
                            return
                except SessionPasswordNeededError:
                    flow.phase = TelethonAuthPhase.ERROR
                    flow.error = "Аккаунт защищён облачным паролем (2FA). QR-логин не поддерживается для таких аккаунтов."
                    logger.warning("2FA required for agent %d", flow.agent_id)
                    return

            # Все попытки исчерпаны
            flow.phase = TelethonAuthPhase.EXPIRED
            logger.info("QR flow expired for agent %d", flow.agent_id)

        except asyncio.CancelledError:
            logger.debug("QR flow cancelled for agent %d", flow.agent_id)
        except Exception as e:
            flow.phase = TelethonAuthPhase.ERROR
            flow.error = str(e)
            logger.error("QR flow error for agent %d: %s", flow.agent_id, e)
        finally:
            if flow.phase not in (TelethonAuthPhase.SUCCESS,):
                await self._disconnect_client(flow.client)

    async def _cancel_flow(self, agent_id: int) -> None:
        """Отменить flow и отключить клиент."""
        flow = self._flows.pop(agent_id, None)
        if not flow:
            return
        if flow.task and not flow.task.done():
            flow.task.cancel()
            try:
                await flow.task
            except asyncio.CancelledError:
                pass
        await self._disconnect_client(flow.client)

    @staticmethod
    async def _disconnect_client(client: TelegramClient) -> None:
        try:
            await client.disconnect()
        except Exception:
            pass
