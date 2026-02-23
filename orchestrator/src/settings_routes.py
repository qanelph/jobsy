from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .auth.dependencies import require_admin, require_any
from .auth.models import User
from .config import settings
from .config_manager import ConfigManager
from .config_schemas import SettingsResponse, SettingsUpdate
from .database import get_db

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def get_settings(
    _user: User = require_any,
) -> SettingsResponse:
    """Получить текущие настройки (секреты замаскированы)."""
    return SettingsResponse.from_snapshot(settings.get_mutable_snapshot())


@router.patch("", response_model=SettingsResponse)
async def update_settings(
    data: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = require_admin,
) -> SettingsResponse:
    """Обновить настройки (partial update, только admin)."""
    snapshot = await ConfigManager.update(db, data)
    return SettingsResponse.from_snapshot(snapshot)


@router.post("/reset", response_model=SettingsResponse)
async def reset_settings(
    db: AsyncSession = Depends(get_db),
    _user: User = require_admin,
) -> SettingsResponse:
    """Сбросить настройки к .env дефолтам (только admin)."""
    snapshot = await ConfigManager.reset(db)
    return SettingsResponse.from_snapshot(snapshot)
