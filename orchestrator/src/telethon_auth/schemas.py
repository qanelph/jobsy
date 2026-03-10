from enum import Enum

from pydantic import BaseModel


class TelethonAuthPhase(str, Enum):
    IDLE = "idle"
    QR_PENDING = "qr_pending"
    SUCCESS = "success"
    ERROR = "error"
    EXPIRED = "expired"


class QrStartResponse(BaseModel):
    qr_url: str
    expires_in: int


class TelethonAuthStatus(BaseModel):
    phase: TelethonAuthPhase
    qr_url: str | None = None
    error: str | None = None
    phone: str | None = None
    username: str | None = None
    first_name: str | None = None


class TelethonSessionInfo(BaseModel):
    has_session: bool
    phone: str | None = None
    username: str | None = None
    first_name: str | None = None
