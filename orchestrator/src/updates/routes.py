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
        current_sha = status.orchestrator.current_sha
    elif component == "jobs":
        current_sha = status.agent.current_sha
    elif component == "browser":
        current_sha = status.browser.current_sha
    else:
        return {"versions": []}
    versions = await get_versions(component, current_sha)
    return {"versions": [asdict(v) for v in versions]}


@router.get("/rollout")
async def rollout_status(
    db: AsyncSession = Depends(get_db),
    _user: User = require_admin,
) -> dict:
    """Статус rollout для каждого агента (running/updating/error)."""
    statuses = await manager.get_agent_rollout_status(db)
    return {"agents": statuses}


@router.post("/platform")
async def update_platform(
    _user: User = require_admin,
) -> dict:
    """Обновить orchestrator + frontend (rolling restart)."""
    updated = await manager.update_platform()
    return {"updated": updated}
