from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Agent, AgentStatus
from ..utils.docker_client import DockerClient
from ..utils.port_manager import PortManager


class AgentSpawner:
    """Создание и управление Docker контейнерами агентов"""

    def __init__(self) -> None:
        self.docker_client = DockerClient()

    async def spawn(self, agent: Agent, db: AsyncSession) -> None:
        """
        Создать и запустить Docker контейнер для агента

        Args:
            agent: Экземпляр агента из БД
            db: Асинхронная сессия БД
        """
        # Проверяем обязательные поля
        if not agent.telegram_bot_token:
            raise ValueError("telegram_bot_token обязателен для создания агента")
        if not agent.claude_api_key:
            raise ValueError("claude_api_key обязателен для создания агента")

        # Выделяем порт
        port = await PortManager.allocate_port(db)
        agent.port = port

        # Создаём контейнер
        container_name = f"phl-jobs-agent-{agent.id}"

        container = self.docker_client.create_container(
            name=container_name,
            port=port,
            telegram_bot_token=agent.telegram_bot_token,
            claude_api_key=agent.claude_api_key,
            custom_instructions=agent.custom_instructions
        )

        # Обновляем агента
        agent.container_id = container.id
        agent.status = AgentStatus.RUNNING

        await db.commit()

    async def stop(self, agent: Agent) -> None:
        """Остановить контейнер агента"""
        if not agent.container_id:
            raise ValueError("У агента нет container_id")

        self.docker_client.stop_container(agent.container_id)
        agent.status = AgentStatus.STOPPED

    async def start(self, agent: Agent) -> None:
        """Запустить контейнер агента"""
        if not agent.container_id:
            raise ValueError("У агента нет container_id")

        self.docker_client.start_container(agent.container_id)
        agent.status = AgentStatus.RUNNING

    async def remove(self, agent: Agent) -> None:
        """Удалить контейнер агента"""
        if not agent.container_id:
            return

        self.docker_client.remove_container(agent.container_id)
        agent.status = AgentStatus.DELETED
        agent.container_id = None

        if agent.port:
            await PortManager.release_port(agent.port)
            agent.port = None

    async def check_status(self, agent: Agent) -> Optional[str]:
        """Проверить реальный статус контейнера"""
        if not agent.container_id:
            return None

        return self.docker_client.get_container_status(agent.container_id)
