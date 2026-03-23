from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import require_admin
from ..auth.models import User
from ..database import get_db
from . import manager
from .versions import get_versions

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


@router.get("/versions/{component}")
async def list_versions(
    component: str,
    _user: User = require_admin,
) -> dict:
    """Список доступных версий (jobsy или jobs) с PR описаниями."""
    status = await manager.check_all()
    if component == "jobsy":
        current_digest = status.orchestrator.current_digest
    elif component == "jobs":
        current_digest = status.agent.current_digest
    else:
        return {"versions": []}
    versions = await get_versions(component, current_digest)
    return {"versions": [asdict(v) for v in versions]}


@router.post("/platform")
async def update_platform(
    _user: User = require_admin,
) -> dict:
    """Обновить orchestrator + frontend (rolling restart)."""
    updated = await manager.update_platform()
    return {"updated": updated}
