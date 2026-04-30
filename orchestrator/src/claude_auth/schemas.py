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


class CredentialsPullResponse(BaseModel):
    credentials: Optional[dict] = None


class UsageWindow(BaseModel):
    utilization: float        # 0..100
    resets_at: str            # ISO 8601


class ExtraUsage(BaseModel):
    is_enabled: bool
    used_credits: float       # USD
    monthly_limit: float      # USD


class UsageResponse(BaseModel):
    five_hour: Optional[UsageWindow] = None
    seven_day: Optional[UsageWindow] = None
    seven_day_opus: Optional[UsageWindow] = None
    seven_day_sonnet: Optional[UsageWindow] = None
    extra_usage: Optional[ExtraUsage] = None
