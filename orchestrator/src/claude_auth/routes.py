from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from .distributor import CredentialDistributor
from .manager import ClaudeAuthManager
from .schemas import (
    OAuthStartResponse,
    OAuthCallbackRequest,
    ApiKeyRequest,
    ClaudeAuthStatusResponse,
    CredentialsPullResponse,
    DistributeResponse,
)

router = APIRouter(prefix="/claude-auth", tags=["claude-auth"])

_manager = ClaudeAuthManager()


@router.get("/status", response_model=ClaudeAuthStatusResponse)
async def get_status(db: AsyncSession = Depends(get_db)) -> ClaudeAuthStatusResponse:
    return await _manager.get_status(db)


@router.post("/oauth/start", response_model=OAuthStartResponse)
async def oauth_start() -> OAuthStartResponse:
    return _manager.start_oauth_flow()


@router.post("/oauth/callback", response_model=ClaudeAuthStatusResponse)
async def oauth_callback(
    body: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db),
) -> ClaudeAuthStatusResponse:
    try:
        return await _manager.complete_oauth_flow(body.code, body.state, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/apikey", response_model=ClaudeAuthStatusResponse)
async def set_api_key(
    body: ApiKeyRequest,
    db: AsyncSession = Depends(get_db),
) -> ClaudeAuthStatusResponse:
    return await _manager.set_api_key(body.api_key, db)


@router.delete("", status_code=204)
async def clear_credentials(db: AsyncSession = Depends(get_db)) -> Response:
    await _manager.clear_credentials(db)
    return Response(status_code=204)


@router.get("/credentials", response_model=CredentialsPullResponse)
async def pull_credentials(
    authorization: str = Header(),
    db: AsyncSession = Depends(get_db),
) -> CredentialsPullResponse:
    """Агент дёргает при старте или при 401 — получает свежие credentials.

    Автоматически рефрешит токен, если он истёк или скоро истечёт.
    """
    expected = f"Bearer {settings.jwt_secret_key}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid token")

    await _manager.refresh_if_needed(db)

    credential = await _manager._get_credential(db)
    if not credential or not credential.access_token:
        return CredentialsPullResponse()

    return CredentialsPullResponse(
        credentials=CredentialDistributor.build_credentials_json(credential),
    )


@router.post("/distribute", response_model=DistributeResponse)
async def distribute_credentials(db: AsyncSession = Depends(get_db)) -> DistributeResponse:
    """Принудительно раздать credentials во все running агенты."""
    credential = await _manager._get_credential(db)
    if not credential:
        return DistributeResponse(distributed_to=0)

    count = await _manager.distributor.distribute_to_all_agents(db, credential)
    return DistributeResponse(distributed_to=count)
