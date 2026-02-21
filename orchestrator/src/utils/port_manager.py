from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..agents.models import Agent
from ..config import settings


class PortManager:
    """Управление портами для агентов"""

    @staticmethod
    async def allocate_port(db: AsyncSession) -> int:
        """Выделить свободный порт для нового агента"""
        # Получаем все занятые порты
        result = await db.execute(
            select(Agent.port).where(Agent.port.isnot(None))
        )
        used_ports = {row[0] for row in result.all()}

        # Ищем свободный порт в диапазоне
        for port in range(settings.agent_port_start, settings.agent_port_end):
            if port not in used_ports:
                return port

        raise ValueError("Нет свободных портов в диапазоне")

    @staticmethod
    async def release_port(port: int) -> None:
        """Освободить порт (пока просто заглушка)"""
        pass
