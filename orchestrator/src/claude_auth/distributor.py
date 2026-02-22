import io
import json
import tarfile
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ClaudeCredential
from ..agents.models import Agent, AgentStatus
from ..utils.docker_client import DockerClient

logger = logging.getLogger(__name__)


class CredentialDistributor:
    """Раздаёт credentials в Docker контейнеры агентов."""

    def __init__(self, docker_client: DockerClient) -> None:
        self.docker = docker_client

    def build_credentials_json(self, credential: ClaudeCredential) -> dict:
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

    def write_credentials_to_container(self, container_id: str, credentials: dict) -> bool:
        """Пишет .credentials.json в контейнер через put_archive."""
        container = self.docker.get_container(container_id)
        if not container:
            return False

        content = json.dumps(credentials, indent=2).encode("utf-8")
        tar_buf = io.BytesIO()
        with tarfile.open(fileobj=tar_buf, mode="w") as tar:
            info = tarfile.TarInfo(name=".credentials.json")
            info.size = len(content)
            info.uid = 1000  # jobs user
            info.gid = 1000
            tar.addfile(info, io.BytesIO(content))
        tar_buf.seek(0)

        container.put_archive("/home/jobs/.claude", tar_buf)
        return True

    async def distribute_to_all_agents(self, db: AsyncSession, credential: ClaudeCredential) -> int:
        """Пишет credentials во все running агенты. Возвращает количество."""
        result = await db.execute(
            select(Agent).where(Agent.status == AgentStatus.RUNNING)
        )
        agents = result.scalars().all()

        credentials_json = self.build_credentials_json(credential)
        count = 0

        for agent in agents:
            if not agent.container_id:
                continue
            ok = self.write_credentials_to_container(agent.container_id, credentials_json)
            if ok:
                count += 1
                logger.info("Distributed credentials to agent %s (%s)", agent.id, agent.name)
            else:
                logger.warning("Failed to distribute credentials to agent %s (%s)", agent.id, agent.name)

        return count
