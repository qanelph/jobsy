import docker
from docker.models.containers import Container
from docker.models.networks import Network
from typing import Optional

from ..config import settings


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
        telegram_bot_token: str,
        claude_api_key: str,
        telegram_user_id: int,
        custom_instructions: Optional[str] = None,
    ) -> Container:
        """Создать и запустить контейнер агента с правильными env vars и volumes"""
        container_name = f"jobs-agent-{agent_id}"

        environment: dict[str, str] = {
            "TG_BOT_TOKEN": telegram_bot_token,
            "ANTHROPIC_API_KEY": claude_api_key,
            "TG_USER_ID": str(telegram_user_id),
            "TG_API_ID": str(settings.tg_api_id),
            "TG_API_HASH": settings.tg_api_hash,
            "OPENAI_API_KEY": settings.openai_api_key,
            "HTTP_PROXY": settings.http_proxy,
            "TZ": settings.timezone,
            "BROWSER_CDP_URL": "http://browser:9223",
        }

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
