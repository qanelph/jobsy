import docker
from docker.models.containers import Container
from typing import Optional

from ..config import settings


class DockerClient:
    """Клиент для работы с Docker API"""

    def __init__(self) -> None:
        self.client = docker.DockerClient(base_url=settings.docker_base_url)

    def create_container(
        self,
        name: str,
        port: int,
        telegram_bot_token: str,
        claude_api_key: str,
        custom_instructions: Optional[str] = None
    ) -> Container:
        """Создать и запустить контейнер агента"""
        environment = {
            "TELEGRAM_BOT_TOKEN": telegram_bot_token,
            "CLAUDE_API_KEY": claude_api_key,
            "BOT_API_PORT": str(port),
        }

        if custom_instructions:
            environment["CUSTOM_INSTRUCTIONS"] = custom_instructions

        container = self.client.containers.run(
            image=settings.agent_image,
            name=name,
            environment=environment,
            ports={f"{port}/tcp": port},
            detach=True,
            restart_policy={"Name": "unless-stopped"}
        )

        return container

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
