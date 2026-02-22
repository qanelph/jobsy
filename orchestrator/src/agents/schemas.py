from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict

from .models import AgentStatus


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    telegram_user_id: int = Field(..., gt=0)
    custom_instructions: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    claude_api_key: Optional[str] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    custom_instructions: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    claude_api_key: Optional[str] = None
    is_active: Optional[bool] = None


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
    total_sessions: int
    active_sessions: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_heartbeat: Optional[datetime]


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int
