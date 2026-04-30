"""Авто-починка агентов, залипших в transitional-статусах.

Если оркестратор крашится во время spawn/stop, агент остаётся в БД с
status=CREATING/STOPPING навсегда — except в manager.create_agent ловит
только Exception, а CancelledError мимо. На следующем старте мы
переводим зависших в ERROR, чтобы UI показал кнопку start.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from .models import Agent, AgentStatus

logger = logging.getLogger(__name__)

STUCK_TRANSITION_THRESHOLD = timedelta(minutes=10)


async def reset_stuck_agents(db: AsyncSession) -> int:
    """Переводит CREATING/STOPPING старше threshold в ERROR. Возвращает кол-во.

    Атомарный UPDATE с RETURNING — между SELECT и UPDATE не образуется
    окно, где живой агент мог бы перейти в RUNNING и быть ложно сброшен
    параллельной репликой оркестратора.
    """
    threshold = datetime.now(timezone.utc) - STUCK_TRANSITION_THRESHOLD

    stmt = (
        update(Agent)
        .where(
            Agent.status.in_([AgentStatus.CREATING, AgentStatus.STOPPING]),
            Agent.updated_at < threshold,
        )
        .values(status=AgentStatus.ERROR, updated_at=func.now())
        .returning(Agent.id, Agent.name)
    )
    result = await db.execute(stmt)
    rows = result.all()
    await db.commit()

    for row in rows:
        logger.warning("Reset stuck agent to ERROR: id=%s name=%s", row.id, row.name)

    return len(rows)
