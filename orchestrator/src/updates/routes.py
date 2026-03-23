from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import require_admin
from ..auth.models import User
from ..database import get_db
from . import manager

router = APIRouter(prefix="/updates", tags=["updates"])


@router.get("/check")
async def check_updates(
    _user: User = require_admin,
) -> dict:
    """Проверить наличие обновлений для агентов, оркестратора и фронтенда."""
    status = await manager.check_all()
    return asdict(status)


@router.post("/agents")
async def update_agents(
    db: AsyncSession = Depends(get_db),
    _user: User = require_admin,
) -> dict:
    """Обновить образ всех running агентов (rolling restart)."""
    updated = await manager.update_agents(db)
    return {"updated": updated}


@router.post("/platform")
async def update_platform(
    _user: User = require_admin,
) -> dict:
    """Обновить orchestrator + frontend (rolling restart)."""
    updated = await manager.update_platform()
    return {"updated": updated}
