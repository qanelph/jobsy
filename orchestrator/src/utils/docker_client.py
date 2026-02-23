import io
import json
import logging
import tarfile

import docker
from docker.models.containers import Container
from docker.models.networks import Network
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)


class DockerClient:
    """Клиент для работы с Docker API"""

    def __init__(self) -> None:
        self.client = docker.DockerClient(base_url=settings.docker_base_url)

    # --- Networks ---

    def create_network(self, agent_id: int) -> Network:
        """Создать Docker network для пары agent+browser"""
        network_name = f"jobs-agent-{agent_id}-net"
        return self.client.networks.create(network_name, driver="bridge")

    def remove_network(self, network_name: str) -> None:
        """Удалить Docker network"""
        try:
            network = self.client.networks.get(network_name)
            network.remove()
        except docker.errors.NotFound:
            pass

    # --- Browser container ---

    def create_browser_container(self, agent_id: int, network_name: str) -> Container:
        """Создать и запустить browser sidecar контейнер"""
        container_name = f"jobs-browser-{agent_id}"

        environment: dict[str, str] = {
            "HTTP_PROXY": settings.http_proxy,
        }

        container = self.client.containers.run(
            image=settings.browser_image,
            name=container_name,
            network=network_name,
            environment=environment,
            shm_size="2g",
            detach=True,
            restart_policy={"Name": "unless-stopped"},
        )

        # Подключить с alias "browser" для DNS-резолва
        network = self.client.networks.get(network_name)
        network.disconnect(container)
        network.connect(container, aliases=["browser"])

        return container

    # --- Agent container ---

    def create_agent_container(
        self,
        agent_id: int,
        network_name: str,
        telegram_bot_token: Optional[str],
        telegram_user_id: int,
        port: int,
        claude_api_key: Optional[str] = None,
        custom_instructions: Optional[str] = None,
        browser_enabled: bool = True,
        extra_env: Optional[dict[str, str]] = None,
    ) -> Container:
        """Создать и запустить контейнер агента с правильными env vars и volumes"""
        container_name = f"jobs-agent-{agent_id}"

        environment: dict[str, str] = {
            "TG_USER_ID": str(telegram_user_id),
            "OPENAI_API_KEY": settings.openai_api_key,
            "HTTP_PROXY": settings.http_proxy,
            "TZ": settings.timezone,
            "JWT_SECRET_KEY": settings.jwt_secret_key,
            "SKIP_SETUP": "1",
        }

        if browser_enabled:
            environment["BROWSER_CDP_URL"] = "http://browser:9223"

        # Per-agent environment variables
        if extra_env:
            environment.update(extra_env)

        # Bot API (aiogram) — только токен
        if telegram_bot_token:
            environment["TG_BOT_TOKEN"] = telegram_bot_token

        # Telethon — API credentials
        if settings.tg_api_id and settings.tg_api_hash:
            environment["TG_API_ID"] = str(settings.tg_api_id)
            environment["TG_API_HASH"] = settings.tg_api_hash

        if claude_api_key:
            environment["ANTHROPIC_API_KEY"] = claude_api_key

        if custom_instructions:
            environment["CUSTOM_INSTRUCTIONS"] = custom_instructions

        volumes: dict[str, dict[str, str]] = {
            f"jobs-agent-{agent_id}-data": {"bind": "/data", "mode": "rw"},
            f"jobs-agent-{agent_id}-workspace": {"bind": "/workspace", "mode": "rw"},
            f"jobs-agent-{agent_id}-claude": {"bind": "/home/jobs/.claude", "mode": "rw"},
        }

        container = self.client.containers.run(
            image=settings.agent_image,
            name=container_name,
            network=network_name,
            environment=environment,
            volumes=volumes,
            ports={"8080/tcp": port},
            detach=True,
            restart_policy={"Name": "unless-stopped"},
        )

        return container

    # --- Generic container operations ---

    def get_container(self, container_id: str) -> Optional[Container]:
        """Получить контейнер по ID"""
        try:
            return self.client.containers.get(container_id)
        except docker.errors.NotFound:
            return None

    def stop_container(self, container_id: str) -> None:
        """Остановить контейнер"""
        container = self.get_container(container_id)
        if container:
            container.stop()

    def start_container(self, container_id: str) -> None:
        """Запустить контейнер"""
        container = self.get_container(container_id)
        if container:
            container.start()

    def remove_container(self, container_id: str) -> None:
        """Удалить контейнер"""
        container = self.get_container(container_id)
        if container:
            container.remove(force=True)

    def get_container_status(self, container_id: str) -> Optional[str]:
        """Получить статус контейнера"""
        container = self.get_container(container_id)
        if container:
            container.reload()
            return container.status
        return None

    def connect_to_orchestrator_network(self, container_id: str) -> None:
        """Подключить контейнер к сети оркестратора для proxy-доступа."""
        network_name = "orchestrator_default"
        try:
            network = self.client.networks.get(network_name)
            network.connect(container_id)
        except docker.errors.APIError as e:
            # Уже подключён или сеть не найдена — не фатально
            logger.warning("Could not connect to %s: %s", network_name, e)

    def write_credentials_to_container(self, container_id: str, credentials: dict) -> bool:
        """Записать .credentials.json в контейнер через put_archive"""
        container = self.get_container(container_id)
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
