from datetime import datetime
from pydantic import BaseModel, Field
from .models import UserRole


class LoginRequest(BaseModel):
    email: str
    password: str


class TelegramAuthData(BaseModel):
    id: int
    first_name: str
    username: str | None = None
    last_name: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


class SetPasswordRequest(BaseModel):
    new_password: str


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: int
    telegram_id: int
    email: str | None
    username: str | None
    first_name: str | None
    last_name: str | None
    photo_url: str | None
    must_change_password: bool
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True


class TokenPayload(BaseModel):
    sub: int  # user_id
    telegram_id: int
    role: UserRole
    exp: int
