import time
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ClaudeCredential, AuthMode
from .schemas import ClaudeAuthStatusResponse, OAuthStartResponse
from .oauth import ClaudeOAuthClient
from .distributor import CredentialDistributor, CredentialDistributorProtocol, K8sCredentialDistributor
from ..config import settings

logger = logging.getLogger(__name__)

# Рефрешим за 30 минут до экспайра
REFRESH_BUFFER_MS = 30 * 60 * 1000


class ClaudeAuthManager:
    def __init__(self) -> None:
        self.oauth_client = ClaudeOAuthClient()
        if settings.deployment_type == "k8s":
            self.distributor: CredentialDistributorProtocol | None = K8sCredentialDistributor()
        else:
            self.distributor = CredentialDistributor()

    async def _get_credential(self, db: AsyncSession) -> Optional[ClaudeCredential]:
        result = await db.execute(select(ClaudeCredential).where(ClaudeCredential.id == 1))
        return result.scalar_one_or_none()

    async def _upsert_credential(self, db: AsyncSession, **kwargs) -> ClaudeCredential:
        credential = await self._get_credential(db)
        if credential:
            for key, value in kwargs.items():
                setattr(credential, key, value)
        else:
            credential = ClaudeCredential(id=1, **kwargs)
            db.add(credential)
        await db.commit()
        await db.refresh(credential)
        return credential

    def _is_expired(self, credential: ClaudeCredential) -> bool:
        if credential.auth_mode != AuthMode.OAUTH:
            return False
        if not credential.expires_at:
            return True
        return credential.expires_at < int(time.time() * 1000)

    def _needs_refresh(self, credential: ClaudeCredential) -> bool:
        if credential.auth_mode != AuthMode.OAUTH:
            return False
        if not credential.expires_at:
            return True
        return credential.expires_at < int(time.time() * 1000) + REFRESH_BUFFER_MS

    async def get_status(self, db: AsyncSession) -> ClaudeAuthStatusResponse:
        credential = await self._get_credential(db)
        if not credential:
            return ClaudeAuthStatusResponse(configured=False)

        return ClaudeAuthStatusResponse(
            configured=True,
            auth_mode=credential.auth_mode.value,
            account_email=credential.account_email,
            organization_name=credential.organization_name,
            expires_at=credential.expires_at,
            is_expired=self._is_expired(credential),
        )

    def start_oauth_flow(self) -> OAuthStartResponse:
        authorize_url, state = self.oauth_client.start_flow()
        return OAuthStartResponse(authorize_url=authorize_url, state=state)

    async def complete_oauth_flow(
        self, code: str, state: str, db: AsyncSession
    ) -> ClaudeAuthStatusResponse:
        tokens = await self.oauth_client.exchange_code(code, state)

        account = tokens.get("account") or {}
        organization = tokens.get("organization") or {}

        credential = await self._upsert_credential(
            db,
            auth_mode=AuthMode.OAUTH,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_at=tokens["expires_at"],
            api_key=None,
            account_email=account.get("email_address"),
            organization_name=organization.get("name"),
        )

        # Раздаём во все running агенты
        if self.distributor:
            count = await self.distributor.distribute_to_all_agents(db, credential)
            logger.info("OAuth complete, distributed to %d agents", count)

        return await self.get_status(db)

    async def set_api_key(self, api_key: str, db: AsyncSession) -> ClaudeAuthStatusResponse:
        await self._upsert_credential(
            db,
            auth_mode=AuthMode.API_KEY,
            api_key=api_key,
            access_token=None,
            refresh_token=None,
            expires_at=None,
        )
        return await self.get_status(db)

    async def clear_credentials(self, db: AsyncSession) -> None:
        credential = await self._get_credential(db)
        if credential:
            await db.delete(credential)
            await db.commit()

    async def refresh_if_needed(self, db: AsyncSession) -> bool:
        """Проверяет экспайр и рефрешит если нужно. Возвращает True если рефрешнул."""
        credential = await self._get_credential(db)
        if not credential or credential.auth_mode != AuthMode.OAUTH:
            return False

        if not self._needs_refresh(credential):
            return False

        if not credential.refresh_token:
            logger.warning("OAuth credential has no refresh_token, cannot refresh")
            return False

        tokens = await self.oauth_client.refresh_tokens(credential.refresh_token)

        credential.access_token = tokens["access_token"]
        credential.refresh_token = tokens["refresh_token"]
        credential.expires_at = tokens["expires_at"]
        await db.commit()

        logger.info("OAuth tokens refreshed, new expires_at=%d", tokens["expires_at"])
        return True

    async def get_agent_credentials(
        self, db: AsyncSession
    ) -> tuple[Optional[str], Optional[dict]]:
        """
        Возвращает (api_key, credentials_json).
        - OAuth mode: (None, {...})
        - API key mode: ("sk-ant-...", None)
        - Не настроено: (None, None)
        """
        credential = await self._get_credential(db)
        if not credential:
            return None, None

        if credential.auth_mode == AuthMode.API_KEY and credential.api_key:
            return credential.api_key, None

        if credential.auth_mode == AuthMode.OAUTH and credential.access_token:
            credentials_json = CredentialDistributor.build_credentials_json(credential)
            return None, credentials_json

        return None, None
