from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Agent, AgentStatus
from ..utils.docker_client import DockerClient
from ..utils.port_manager import PortManager


class AgentSpawner:
    """Создание и управление Docker контейнерами агентов (agent + browser pair)"""

    def __init__(self) -> None:
        self.docker_client = DockerClient()

    async def spawn(self, agent: Agent, db: AsyncSession) -> None:
        """
        Создать и запустить Docker контейнеры для агента:
        1. Docker network
        2. Browser sidecar
        3. Agent container
        """
        if not agent.telegram_bot_token:
            raise ValueError("telegram_bot_token обязателен для создания агента")
        if not agent.claude_api_key:
            raise ValueError("claude_api_key обязателен для создания агента")

        # Выделяем порт
        port = await PortManager.allocate_port(db)
        agent.port = port

        # 1. Создаём network
        network = self.docker_client.create_network(agent.id)
        network_name = network.name

        # 2. Создаём browser sidecar
        browser_container = self.docker_client.create_browser_container(
            agent_id=agent.id,
            network_name=network_name,
        )
        agent.browser_container_id = browser_container.id

        # 3. Создаём agent container
        agent_container = self.docker_client.create_agent_container(
            agent_id=agent.id,
            network_name=network_name,
            telegram_bot_token=agent.telegram_bot_token,
            claude_api_key=agent.claude_api_key,
            telegram_user_id=agent.telegram_user_id,
            custom_instructions=agent.custom_instructions,
        )
        agent.container_id = agent_container.id

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

    async def remove(self, agent: Agent) -> None:
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
