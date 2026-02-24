import logging
from typing import Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ClaudeCredential
from ..agents.models import Agent, AgentStatus
from ..config import settings

logger = logging.getLogger(__name__)


class CredentialDistributorProtocol(Protocol):
    """Интерфейс для раздачи credentials в агенты."""

    async def distribute_to_all_agents(self, db: AsyncSession, credential: ClaudeCredential) -> int: ...


class CredentialDistributor:
    """Раздаёт credentials в агенты через HTTP push (POST /credentials).

    Работает одинаково для Docker и K8s — разница только в hostname агента.
    """

    @staticmethod
    def build_credentials_json(credential: ClaudeCredential) -> dict:
        """Формирует содержимое .credentials.json для записи в контейнер.

        Claude Code ожидает обёртку claudeAiOauth вокруг токенов.
        """
        return {
            "claudeAiOauth": {
                "accessToken": credential.access_token,
                "refreshToken": credential.refresh_token,
                "expiresAt": credential.expires_at,
                "scopes": [
                    "user:profile",
                    "user:inference",
                    "user:sessions:claude_code",
                    "user:mcp_servers",
                ],
            }
        }

    def _agent_host(self, agent: Agent) -> str:
        """Hostname агента в Docker-сети."""
        return f"jobs-agent-{agent.id}"

    async def _push_credentials(
        self,
        client: httpx.AsyncClient,
        host: str,
        credentials_json: dict,
    ) -> bool:
        """Отправить credentials агенту через HTTP POST."""
        url = f"http://{host}:8080/credentials"
        headers = {"Authorization": f"Bearer {settings.jwt_secret_key}"}
        resp = await client.post(url, json={"credentials": credentials_json}, headers=headers)
        return resp.status_code == 200

    async def distribute_to_all_agents(self, db: AsyncSession, credential: ClaudeCredential) -> int:
        """Push credentials во все running агенты. Возвращает количество успешных."""
        result = await db.execute(
            select(Agent).where(Agent.status == AgentStatus.RUNNING)
        )
        agents = result.scalars().all()

        credentials_json = self.build_credentials_json(credential)
        count = 0

        async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
            for agent in agents:
                host = self._agent_host(agent)
                try:
                    ok = await self._push_credentials(client, host, credentials_json)
                except (httpx.ConnectError, httpx.TimeoutException) as exc:
                    logger.warning("Failed to push credentials to agent %s (%s): %s", agent.id, agent.name, exc)
                    continue

                if ok:
                    count += 1
                    logger.info("Pushed credentials to agent %s (%s)", agent.id, agent.name)
                else:
                    logger.warning("Agent %s (%s) rejected credentials push", agent.id, agent.name)

        return count


class K8sCredentialDistributor(CredentialDistributor):
    """K8s-вариант: hostname — через Service."""

    def _agent_host(self, agent: Agent) -> str:
        return f"agent-{agent.id}-svc"
