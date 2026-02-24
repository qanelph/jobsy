import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from .models import Agent, AgentStatus, GlobalConfig
from ..claude_auth.manager import ClaudeAuthManager
from ..utils.docker_client import DockerClient
from ..utils.port_manager import PortManager

logger = logging.getLogger(__name__)


class AgentSpawner:
    """Создание и управление Docker контейнерами агентов (agent + browser pair)"""

    def __init__(self) -> None:
        self.docker_client = DockerClient()
        self.auth_manager = ClaudeAuthManager()

    async def spawn(self, agent: Agent, db: AsyncSession) -> None:
        """
        Создать и запустить Docker контейнеры для агента:
        1. Docker network
        2. Browser sidecar
        3. Agent container
        4. Claude credentials (OAuth или API key)
        """
        # telegram_bot_token опционален — агент может работать только через WebSocket

        # Определяем credentials: глобальные OAuth/API key или per-agent
        global_api_key, credentials_json = await self.auth_manager.get_agent_credentials(db)
        agent_api_key = global_api_key or agent.claude_api_key

        if not agent_api_key and not credentials_json:
            raise ValueError(
                "Не настроена авторизация Claude: нет ни OAuth, ни глобального API key, ни per-agent ключа"
            )

        # Выделяем порт
        port = await PortManager.allocate_port(db)
        agent.port = port

        # Merge global + local env vars (local overrides global)
        global_config = await db.get(GlobalConfig, 1)
        global_env: dict[str, str] = json.loads(global_config.env_vars or "{}") if global_config else {}
        local_env: dict[str, str] = json.loads(agent.env_vars or "{}")
        extra_env = {**global_env, **local_env}

        # 1. Создаём network
        network = self.docker_client.create_network(agent.id)
        network_name = network.name

        # 2. Создаём browser sidecar (если включён)
        if agent.browser_enabled:
            browser_container = self.docker_client.create_browser_container(
                agent_id=agent.id,
                network_name=network_name,
            )
            agent.browser_container_id = browser_container.id
        else:
            agent.browser_container_id = None

        # 3. Создаём agent container (без ANTHROPIC_API_KEY если OAuth)
        container_api_key = agent_api_key if not credentials_json else None
        agent_container = self.docker_client.create_agent_container(
            agent_id=agent.id,
            network_name=network_name,
            telegram_bot_token=agent.telegram_bot_token,
            telegram_user_id=agent.telegram_user_id,
            port=port,
            claude_api_key=container_api_key,
            custom_instructions=agent.custom_instructions,
            browser_enabled=agent.browser_enabled,
            extra_env=extra_env,
        )
        agent.container_id = agent_container.id

        # 4. Если OAuth — записать .credentials.json в контейнер
        if credentials_json:
            self.docker_client.write_credentials_to_container(
                agent_container.id, credentials_json
            )
            logger.info("Written OAuth credentials to agent %s", agent.id)

        # Подключаем агента к сети оркестратора для proxy-доступа к HTTP API
        self.docker_client.connect_to_orchestrator_network(agent_container.id)

        agent.status = AgentStatus.RUNNING
        await db.commit()

    async def stop(self, agent: Agent) -> None:
        """Остановить оба контейнера: agent, затем browser"""
        if agent.container_id:
            self.docker_client.stop_container(agent.container_id)
        if agent.browser_container_id:
            self.docker_client.stop_container(agent.browser_container_id)

        agent.status = AgentStatus.STOPPED

    async def start(self, agent: Agent) -> None:
        """Запустить оба контейнера: browser, затем agent"""
        if agent.browser_container_id:
            self.docker_client.start_container(agent.browser_container_id)
        if agent.container_id:
            self.docker_client.start_container(agent.container_id)

        agent.status = AgentStatus.RUNNING

    async def respawn(self, agent: Agent, db: AsyncSession) -> None:
        """Пересоздать контейнеры с актуальными env vars (для применения настроек)"""
        # Останавливаем и удаляем старые контейнеры
        if agent.container_id:
            self.docker_client.stop_container(agent.container_id)
            self.docker_client.remove_container(agent.container_id)
        if agent.browser_container_id:
            self.docker_client.stop_container(agent.browser_container_id)
            self.docker_client.remove_container(agent.browser_container_id)

        # Удаляем network
        network_name = f"jobs-agent-{agent.id}-net"
        self.docker_client.remove_network(network_name)

        # Освобождаем порт
        if agent.port:
            await PortManager.release_port(agent.port)

        # Пересоздаём всё заново
        agent.status = AgentStatus.CREATING
        await db.commit()
        await self.spawn(agent, db)

    async def remove(self, agent: Agent, delete_data: bool = False) -> None:
        """
        Удалить контейнеры и network.
        Volumes НЕ удаляются — данные сохраняются.
        """
        # Stop
        if agent.container_id:
            self.docker_client.stop_container(agent.container_id)
        if agent.browser_container_id:
            self.docker_client.stop_container(agent.browser_container_id)

        # Remove containers
        if agent.container_id:
            self.docker_client.remove_container(agent.container_id)
        if agent.browser_container_id:
            self.docker_client.remove_container(agent.browser_container_id)

        # Remove network
        network_name = f"jobs-agent-{agent.id}-net"
        self.docker_client.remove_network(network_name)

        # Update agent state
        agent.status = AgentStatus.DELETED
        agent.container_id = None
        agent.browser_container_id = None

        if agent.port:
            await PortManager.release_port(agent.port)
            agent.port = None

    async def check_status(self, agent: Agent) -> Optional[str]:
        """Проверить реальный статус контейнера агента"""
        if not agent.container_id:
            return None

        return self.docker_client.get_container_status(agent.container_id)
