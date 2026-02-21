"""
Kubernetes spawner для агентов
TODO: Будет реализовано в задаче #5
"""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Agent


class K8sSpawner:
    """Создание и управление Kubernetes pods агентов"""

    async def spawn(self, agent: Agent, db: AsyncSession) -> None:
        """Создать pod для агента"""
        raise NotImplementedError("K8s spawner will be implemented in task #5")

    async def stop(self, agent: Agent) -> None:
        """Остановить pod агента"""
        raise NotImplementedError("K8s spawner will be implemented in task #5")

    async def start(self, agent: Agent) -> None:
        """Запустить pod агента"""
        raise NotImplementedError("K8s spawner will be implemented in task #5")

    async def remove(self, agent: Agent) -> None:
        """Удалить pod агента"""
        raise NotImplementedError("K8s spawner will be implemented in task #5")

    async def check_status(self, agent: Agent) -> Optional[str]:
        """Проверить статус pod"""
        raise NotImplementedError("K8s spawner will be implemented in task #5")
