from typing import Optional

from pydantic import BaseModel, Field


def _mask(value: str) -> str:
    """Маскировка секретов: показывает первые 4 и последние 4 символа."""
    if len(value) <= 8:
        return "****" if value else ""
    return f"{value[:4]}...{value[-4:]}"


_SECRET_FIELDS = frozenset({"telegram_bot_token", "openai_api_key", "tg_api_hash"})


class SettingsResponse(BaseModel):
    access_token_expire_minutes: int
    refresh_token_expire_days: int
    telegram_bot_token: str
    agent_image: str
    browser_image: str
    openai_api_key: str
    http_proxy: str
    timezone: str
    tg_api_id: int
    tg_api_hash: str
    use_kubernetes: bool
    k8s_namespace: str
    agent_port_start: int
    agent_port_end: int

    @classmethod
    def from_snapshot(cls, snapshot: object) -> "SettingsResponse":
        """Создать response из MutableSettingsSnapshot, маскируя секреты."""
        from .config import MutableSettingsSnapshot

        assert isinstance(snapshot, MutableSettingsSnapshot)
        data: dict[str, object] = {}
        for field_name in cls.model_fields:
            value = getattr(snapshot, field_name)
            if field_name in _SECRET_FIELDS and isinstance(value, str):
                value = _mask(value)
            data[field_name] = value
        return cls(**data)


class SettingsUpdate(BaseModel):
    """Partial update — все поля Optional."""

    access_token_expire_minutes: Optional[int] = Field(default=None, ge=1, le=10080)
    refresh_token_expire_days: Optional[int] = Field(default=None, ge=1, le=365)
    telegram_bot_token: Optional[str] = None
    agent_image: Optional[str] = Field(default=None, min_length=1)
    browser_image: Optional[str] = Field(default=None, min_length=1)
    openai_api_key: Optional[str] = None
    http_proxy: Optional[str] = None
    timezone: Optional[str] = Field(default=None, min_length=1)
    tg_api_id: Optional[int] = Field(default=None, ge=0)
    tg_api_hash: Optional[str] = None
    use_kubernetes: Optional[bool] = None
    k8s_namespace: Optional[str] = Field(default=None, min_length=1)
    agent_port_start: Optional[int] = Field(default=None, ge=1024, le=65535)
    agent_port_end: Optional[int] = Field(default=None, ge=1024, le=65535)
