import json
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from .models import Agent, AgentStatus
from .schemas import AgentCreate, AgentUpdate, AgentResponse, AgentListResponse
from ..config import settings


class AgentManager:
    """Управление жизненным циклом агентов"""

    def __init__(self) -> None:
        if settings.deployment_type == "k8s":
            from .k8s_spawner import K8sSpawner
            self.spawner = K8sSpawner()
        else:
            from .spawner import AgentSpawner
            self.spawner = AgentSpawner()

    async def create_agent(self, data: AgentCreate, db: AsyncSession) -> AgentResponse:
        """Создать нового агента и запустить контейнер"""
        # Проверяем уникальность имени
        existing = await db.execute(
            select(Agent).where(Agent.name == data.name)
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Агент с именем '{data.name}' уже существует")

        # Создаём агента
        agent = Agent(
            name=data.name,
            telegram_user_id=data.telegram_user_id,
            custom_instructions=data.custom_instructions,
            telegram_bot_token=data.telegram_bot_token,
            claude_api_key=data.claude_api_key,
            browser_enabled=data.browser_enabled,
            env_vars=json.dumps(data.env_vars) if data.env_vars else None,
            status=AgentStatus.CREATING
        )

        db.add(agent)
        await db.commit()
        await db.refresh(agent)

        # Запускаем контейнер
        try:
            await self.spawner.spawn(agent, db)
            await db.refresh(agent)
        except Exception as e:
            agent.status = AgentStatus.ERROR
            await db.commit()
            raise ValueError(f"Ошибка при создании контейнера: {str(e)}")

        return AgentResponse.model_validate(agent)

    async def get_agent(self, agent_id: int, db: AsyncSession) -> Optional[AgentResponse]:
        """Получить агента по ID"""
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return None

        return AgentResponse.model_validate(agent)

    async def list_agents(
        self,
        telegram_user_id: Optional[int],
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100
    ) -> AgentListResponse:
        """Получить список агентов с фильтрацией"""
        query = select(Agent)

        if telegram_user_id:
            query = query.where(Agent.telegram_user_id == telegram_user_id)

        query = query.where(Agent.status != AgentStatus.DELETED)

        # Получаем общее количество
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        # Получаем агентов с пагинацией
        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        agents = result.scalars().all()

        return AgentListResponse(
            agents=[AgentResponse.model_validate(agent) for agent in agents],
            total=total
        )

    async def update_agent(
        self,
        agent_id: int,
        data: AgentUpdate,
        db: AsyncSession
    ) -> Optional[AgentResponse]:
        """Обновить агента"""
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return None

        # Обновляем только переданные поля
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field == 'env_vars':
                setattr(agent, field, json.dumps(value) if value else None)
            else:
                setattr(agent, field, value)

        await db.commit()
        await db.refresh(agent)

        return AgentResponse.model_validate(agent)

    async def start_agent(self, agent_id: int, db: AsyncSession) -> Optional[AgentResponse]:
        """Запустить агента"""
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return None

        if agent.status not in (AgentStatus.STOPPED, AgentStatus.ERROR):
            raise ValueError(f"Агент должен быть в статусе STOPPED или ERROR, текущий: {agent.status}")

        if agent.status == AgentStatus.ERROR:
            # Агент в ошибке — deployment может не существовать, пересоздаём
            await self.spawner.respawn(agent, db)
        else:
            await self.spawner.start(agent)
            await db.commit()

        await db.refresh(agent)

        return AgentResponse.model_validate(agent)

    async def stop_agent(self, agent_id: int, db: AsyncSession) -> Optional[AgentResponse]:
        """Остановить агента"""
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return None

        if agent.status != AgentStatus.RUNNING:
            raise ValueError(f"Агент должен быть в статусе RUNNING, текущий: {agent.status}")

        await self.spawner.stop(agent)
        await db.commit()
        await db.refresh(agent)

        return AgentResponse.model_validate(agent)

    async def restart_agent(self, agent_id: int, db: AsyncSession) -> Optional[AgentResponse]:
        """Перезапустить агента (пересоздание контейнеров с актуальными настройками)"""
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return None

        await self.spawner.respawn(agent, db)
        await db.refresh(agent)

        return AgentResponse.model_validate(agent)

    async def delete_agent(self, agent_id: int, db: AsyncSession) -> bool:
        """Удалить агента и его контейнер"""
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return False

        await self.spawner.remove(agent)
        await db.commit()

        return True
