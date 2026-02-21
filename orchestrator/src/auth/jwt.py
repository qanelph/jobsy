from datetime import datetime, timedelta, UTC
from jose import jwt, JWTError
from ..config import settings
from .models import UserRole
from .schemas import TokenPayload


def create_access_token(user_id: int, telegram_id: int, role: UserRole) -> str:
    """Создает JWT access token"""
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)

    payload = {
        "sub": str(user_id),  # JWT стандарт требует строку
        "telegram_id": telegram_id,
        "role": role.value,
        "exp": int(expire.timestamp()),
        "type": "access"
    }

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: int, telegram_id: int, role: UserRole) -> tuple[str, datetime]:
    """Создает JWT refresh token и возвращает токен + время истечения"""
    expire = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)

    payload = {
        "sub": str(user_id),  # JWT стандарт требует строку
        "telegram_id": telegram_id,
        "role": role.value,
        "exp": int(expire.timestamp()),
        "type": "refresh"
    }

    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expire


def decode_token(token: str) -> TokenPayload:
    """Декодирует и валидирует JWT token"""
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm]
    )

    return TokenPayload(
        sub=int(payload["sub"]),  # Конвертируем обратно в int
        telegram_id=payload["telegram_id"],
        role=UserRole(payload["role"]),
        exp=payload["exp"]
    )


def verify_access_token(token: str) -> TokenPayload | None:
    """Проверяет access token"""
    try:
        payload = decode_token(token)

        # Проверка типа токена
        raw_payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        if raw_payload.get("type") != "access":
            return None

        return payload
    except JWTError:
        return None


def verify_refresh_token(token: str) -> TokenPayload | None:
    """Проверяет refresh token"""
    try:
        payload = decode_token(token)

        # Проверка типа токена
        raw_payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        if raw_payload.get("type") != "refresh":
            return None

        return payload
    except JWTError:
        return None
