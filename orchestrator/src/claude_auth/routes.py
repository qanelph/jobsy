import logging

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import require_admin
from ..auth.models import User
from ..config import settings
from ..database import get_db
from .distributor import CredentialDistributor
from .manager import ClaudeAuthManager
from .models import AuthMode
from .schemas import (
    OAuthStartResponse,
    OAuthCallbackRequest,
    ApiKeyRequest,
    ClaudeAuthStatusResponse,
    CredentialsPullResponse,
    DistributeResponse,
    UsageResponse,
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

    try:
        await _manager.refresh_if_needed(db)
    except Exception:
        logging.getLogger(__name__).warning("Token refresh failed in pull_credentials", exc_info=True)

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


@router.get("/usage", response_model=UsageResponse | None)
async def get_oauth_usage(
    db: AsyncSession = Depends(get_db),
    _user: User = require_admin,
) -> UsageResponse | None:
    """Прогресс по OAuth-лимитам Anthropic. None — если не OAuth или токен невалиден."""
    cred = await _manager._get_credential(db)
    if not cred or cred.auth_mode != AuthMode.OAUTH or not cred.access_token:
        return None

    try:
        await _manager.refresh_if_needed(db)
    except Exception:
        logging.getLogger(__name__).warning("Token refresh failed in get_oauth_usage", exc_info=True)

    cred = await _manager._get_credential(db)
    if not cred or not cred.access_token:
        return None

    headers = {
        "Authorization": f"Bearer {cred.access_token}",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-code/2.0.31",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
            r = await client.get(
                "https://api.anthropic.com/api/oauth/usage",
                headers=headers,
            )
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError) as exc:
        logging.getLogger(__name__).warning("OAuth usage fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="Anthropic OAuth API недоступен")

    if r.status_code in (401, 403):
        return None
    if r.status_code >= 400:
        logging.getLogger(__name__).warning(
            "OAuth usage non-2xx: status=%s body=%s", r.status_code, r.text[:200]
        )
        raise HTTPException(status_code=502, detail=f"Anthropic API: {r.status_code}")

    try:
        return UsageResponse(**r.json())
    except (ValueError, ValidationError) as exc:
        # ValueError ловит json.JSONDecodeError; ValidationError — Pydantic v2.
        logging.getLogger(__name__).warning("OAuth usage parse failed: %s", exc)
        return None
