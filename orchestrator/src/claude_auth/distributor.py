import base64
import io
import json
import tarfile
import logging
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ClaudeCredential
from ..agents.models import Agent, AgentStatus

logger = logging.getLogger(__name__)


class CredentialDistributorProtocol(Protocol):
    """Интерфейс для раздачи credentials в агенты."""

    async def distribute_to_all_agents(self, db: AsyncSession, credential: ClaudeCredential) -> int: ...


class CredentialDistributor:
    """Раздаёт credentials в Docker контейнеры агентов."""

    def __init__(self) -> None:
        from ..utils.docker_client import DockerClient
        self.docker = DockerClient()

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


class K8sCredentialDistributor:
    """Раздаёт credentials в K8s Secrets агентов."""

    def __init__(self) -> None:
        from kubernetes import client, config as k8s_config
        from ..config import settings

        k8s_config.load_incluster_config()
        self.core_v1 = client.CoreV1Api()
        self.namespace = settings.k8s_namespace

    def _secret_name(self, agent_id: int) -> str:
        return f"agent-{agent_id}-claude-creds"

    def _update_secret(self, agent_id: int, credentials_json: dict) -> bool:
        """Обновить K8s Secret с новыми credentials."""
        from kubernetes import client

        secret_name = self._secret_name(agent_id)
        content = json.dumps(credentials_json, indent=2)
        encoded = base64.b64encode(content.encode()).decode()

        try:
            self.core_v1.read_namespaced_secret(name=secret_name, namespace=self.namespace)
            self.core_v1.patch_namespaced_secret(
                name=secret_name,
                namespace=self.namespace,
                body={"data": {".credentials.json": encoded}},
            )
            return True
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.warning("Secret %s not found, skipping", secret_name)
                return False
            raise

    async def distribute_to_all_agents(self, db: AsyncSession, credential: ClaudeCredential) -> int:
        """Обновляет K8s Secrets для всех running агентов."""
        result = await db.execute(
            select(Agent).where(Agent.status == AgentStatus.RUNNING)
        )
        agents = result.scalars().all()

        credentials_json = CredentialDistributor.build_credentials_json(credential)
        count = 0

        for agent in agents:
            if not agent.container_id:
                continue
            ok = self._update_secret(agent.id, credentials_json)
            if ok:
                count += 1
                logger.info("K8s: updated credentials secret for agent %s (%s)", agent.id, agent.name)
            else:
                logger.warning("K8s: failed to update credentials for agent %s (%s)", agent.id, agent.name)

        return count
