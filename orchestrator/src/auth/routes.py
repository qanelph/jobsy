from typing import Annotated
from datetime import datetime, UTC
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from .schemas import (
    LoginRequest,
    TelegramAuthData,
    TokenPair,
    AccessToken,
    RefreshTokenRequest,
    UserResponse,
    SetPasswordRequest,
)
from .telegram_login import verify_telegram_auth
from .jwt import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)
from .password import hash_password, verify_password
from .repository import UserRepository, RefreshTokenRepository
from .dependencies import get_current_active_user
from .models import User


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenPair)
async def login(
    credentials: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    """
    JWT аутентификация через email + password.

    При первом запуске создаётся admin пользователь с дефолтным паролем admin123.
    После установки пароля через /set-password, дефолтный пароль перестаёт работать.
    """
    user_repo = UserRepository(db)

    # Ищем пользователя по email
    if credentials.email == "admin@jobsy.dev":
        user = await user_repo.get_by_telegram_id(1)  # фейковый telegram_id для admin

        # Если пользователь не существует, создаём с дефолтным паролем
        if not user:
            from .models import UserRole
            user = User(
                telegram_id=1,
                email="admin@jobsy.dev",
                username="admin",
                first_name="Admin",
                role=UserRole.ADMIN,
                must_change_password=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        # Проверяем пароль
        # Если у пользователя уже установлен password_hash, проверяем его
        if user.password_hash:
            if not verify_password(credentials.password, user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Неверный email или пароль"
                )
        else:
            # Если password_hash нет, разрешаем только дефолтный пароль
            if credentials.password != "admin123":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Неверный email или пароль"
                )

        # Генерируем токены
        access_token = create_access_token(user.id, user.telegram_id, user.role)
        refresh_token, expires_at = create_refresh_token(user.id, user.telegram_id, user.role)

        # Сохраняем refresh token
        refresh_repo = RefreshTokenRepository(db)
        await refresh_repo.create(user.id, refresh_token, expires_at)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_change_password=user.must_change_password
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверный email или пароль"
    )


@router.post("/telegram", response_model=TokenPair)
async def telegram_login(
    auth_data: TelegramAuthData,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    """
    Аутентификация через Telegram Login Widget.

    Процесс:
    1. Валидирует данные от Telegram
    2. Создает или обновляет пользователя в БД
    3. Генерирует пару токенов (access + refresh)
    4. Сохраняет refresh token в БД
    """

    # Валидация данных от Telegram
    if not verify_telegram_auth(auth_data):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Telegram authentication data",
        )

    user_repo = UserRepository(db)

    # Получение или создание пользователя
    user = await user_repo.get_by_telegram_id(auth_data.id)

    if user:
        # Обновление данных существующего пользователя
        user = await user_repo.update_from_telegram(user, auth_data)
    else:
        # Создание нового пользователя
        user = await user_repo.create(auth_data)

    # Генерация токенов
    access_token = create_access_token(user.id, user.telegram_id, user.role)
    refresh_token_str, expires_at = create_refresh_token(user.id, user.telegram_id, user.role)

    # Сохранение refresh token в БД
    token_repo = RefreshTokenRepository(db)
    await token_repo.create(user.id, refresh_token_str, expires_at)

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token_str,
    )


@router.post("/refresh", response_model=AccessToken)
async def refresh_access_token(
    request: RefreshTokenRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccessToken:
    """
    Обновление access token с помощью refresh token.

    Процесс:
    1. Валидирует refresh token
    2. Проверяет наличие токена в БД
    3. Проверяет срок действия
    4. Генерирует новый access token
    """

    # Валидация refresh token
    payload = verify_refresh_token(request.refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Проверка наличия токена в БД
    token_repo = RefreshTokenRepository(db)
    stored_token = await token_repo.get_by_token(request.refresh_token)

    if not stored_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found",
        )

    # Проверка срока действия
    if stored_token.expires_at < datetime.now(UTC):
        await token_repo.delete_by_token(request.refresh_token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    # Получение пользователя
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(payload.sub)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Генерация нового access token
    access_token = create_access_token(user.id, user.telegram_id, user.role)

    return AccessToken(access_token=access_token)


@router.post("/logout")
async def logout(
    request: RefreshTokenRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """
    Выход из системы - удаляет refresh token.
    """
    token_repo = RefreshTokenRepository(db)
    await token_repo.delete_by_token(request.refresh_token)

    return {"message": "Logged out successfully"}


@router.post("/set-password")
async def set_password(
    request: SetPasswordRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """
    Установка нового пароля пользователем.
    Требуется при первом входе (must_change_password=True).
    """
    # Хешируем новый пароль
    hashed_password = hash_password(request.new_password)

    # Обновляем пользователя
    current_user.password_hash = hashed_password
    current_user.must_change_password = False

    await db.commit()

    return {"message": "Пароль успешно установлен"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> UserResponse:
    """
    Получение информации о текущем пользователе.
    Требует валидный access token.
    """
    return UserResponse.model_validate(current_user)
