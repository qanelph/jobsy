import json
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator

from .models import AgentStatus


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    telegram_user_id: int = Field(..., gt=0)
    custom_instructions: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    claude_api_key: Optional[str] = None
    browser_enabled: bool = True
    env_vars: Optional[dict[str, str]] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    custom_instructions: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    claude_api_key: Optional[str] = None
    is_active: Optional[bool] = None
    browser_enabled: Optional[bool] = None
    env_vars: Optional[dict[str, str]] = None


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    telegram_user_id: int
    status: AgentStatus
    container_id: Optional[str]
    browser_container_id: Optional[str]
    port: Optional[int]
    custom_instructions: Optional[str]
    telegram_bot_token: Optional[str]
    browser_enabled: bool
    env_vars: Optional[dict[str, str]] = None
    total_sessions: int

    @field_validator('env_vars', mode='before')
    @classmethod
    def parse_env_vars(cls, v: str | dict | None) -> dict[str, str] | None:
        if v is None:
            return None
        if isinstance(v, str):
            return json.loads(v)
        return v
    active_sessions: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_heartbeat: Optional[datetime]


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int


class GlobalConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    env_vars: dict[str, str] = {}

    @field_validator('env_vars', mode='before')
    @classmethod
    def parse_env_vars(cls, v: str | dict | None) -> dict[str, str]:
        if v is None:
            return {}
        if isinstance(v, str):
            return json.loads(v)
        return v


class GlobalConfigUpdate(BaseModel):
    env_vars: dict[str, str]


class UsageSnapshotItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    taken_at: datetime
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    total_cost_usd: Optional[float]
    events_count: int


class AgentUsageResponse(BaseModel):
    agent_id: int
    period: str
    snapshots: list[UsageSnapshotItem]


class AgentUsageBucket(BaseModel):
    agent_id: int
    name: str
    snapshots: list[UsageSnapshotItem]


class UsageSummaryResponse(BaseModel):
    period: str
    agents: list[AgentUsageBucket]
