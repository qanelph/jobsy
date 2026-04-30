"""Авто-починка агентов, залипших в transitional-статусах.

Если оркестратор крашится во время spawn/stop, агент остаётся в БД с
status=CREATING/STOPPING навсегда — except в manager.create_agent ловит
только Exception, а CancelledError мимо. На следующем старте мы
переводим зависших в ERROR, чтобы UI показал кнопку start.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Agent, AgentStatus

logger = logging.getLogger(__name__)

STUCK_TRANSITION_THRESHOLD = timedelta(minutes=10)


async def reset_stuck_agents(db: AsyncSession) -> int:
    """Переводит CREATING/STOPPING старше threshold в ERROR. Возвращает кол-во."""
    threshold = datetime.now(timezone.utc) - STUCK_TRANSITION_THRESHOLD

    result = await db.execute(
        select(Agent.id, Agent.name, Agent.status, Agent.updated_at).where(
            Agent.status.in_([AgentStatus.CREATING, AgentStatus.STOPPING]),
            Agent.updated_at < threshold,
        )
    )
    rows = result.all()
    if not rows:
        return 0

    for row in rows:
        logger.warning(
            "Reset stuck agent: id=%s name=%s status=%s updated_at=%s",
            row.id, row.name, row.status.value, row.updated_at,
        )

    await db.execute(
        update(Agent)
        .where(
            Agent.status.in_([AgentStatus.CREATING, AgentStatus.STOPPING]),
            Agent.updated_at < threshold,
        )
        .values(status=AgentStatus.ERROR)
    )
    await db.commit()
    return len(rows)
