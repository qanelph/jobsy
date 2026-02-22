from typing import Optional

from pydantic import BaseModel


class OAuthStartResponse(BaseModel):
    authorize_url: str
    state: str


class OAuthCallbackRequest(BaseModel):
    code: str
    state: str


class ApiKeyRequest(BaseModel):
    api_key: str


class ClaudeAuthStatusResponse(BaseModel):
    configured: bool
    auth_mode: Optional[str] = None  # "oauth" | "api_key"
    account_email: Optional[str] = None
    organization_name: Optional[str] = None
    expires_at: Optional[int] = None
    is_expired: bool = False


class DistributeResponse(BaseModel):
    distributed_to: int
