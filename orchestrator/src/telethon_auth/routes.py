from fastapi import APIRouter, HTTPException

from ..auth.dependencies import require_admin
from ..auth.models import User
from .manager import TelethonAuthManager
from .schemas import QrStartResponse, TelethonAuthStatus, TelethonSessionInfo

router = APIRouter(prefix="/agents/{agent_id}/telethon", tags=["telethon-auth"])

_manager = TelethonAuthManager()


@router.post("/qr/start", response_model=QrStartResponse)
async def qr_start(agent_id: int, _user: User = require_admin) -> QrStartResponse:
    """Начать QR-авторизацию Telethon для агента."""
    try:
        return await _manager.start_qr_flow(agent_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/qr/status", response_model=TelethonAuthStatus)
async def qr_status(agent_id: int, _user: User = require_admin) -> TelethonAuthStatus:
    """Polling статуса QR-авторизации."""
    return _manager.get_status(agent_id)


@router.post("/qr/confirm", response_model=TelethonSessionInfo)
async def qr_confirm(agent_id: int, _user: User = require_admin) -> TelethonSessionInfo:
    """Подтвердить и сохранить session после успешного скана."""
    try:
        return await _manager.confirm_and_save(agent_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/session", response_model=TelethonSessionInfo)
async def get_session(agent_id: int, _user: User = require_admin) -> TelethonSessionInfo:
    """Проверить наличие Telethon session у агента."""
    return _manager.get_session_info(agent_id)


@router.delete("/session", response_model=TelethonSessionInfo)
async def delete_session(agent_id: int, _user: User = require_admin) -> TelethonSessionInfo:
    """Удалить Telethon session у агента."""
    return _manager.delete_session(agent_id)
