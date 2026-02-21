from datetime import datetime
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from .models import User, RefreshToken, UserRole
from .schemas import TelegramAuthData


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_telegram_id(self, telegram_id: int) -> User | None:
        """Получить пользователя по telegram_id"""
        result = await self.db.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: int) -> User | None:
        """Получить пользователя по ID"""
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def create(self, telegram_data: TelegramAuthData, role: UserRole = UserRole.USER) -> User:
        """Создать нового пользователя из данных Telegram"""
        user = User(
            telegram_id=telegram_data.id,
            username=telegram_data.username,
            first_name=telegram_data.first_name,
            last_name=telegram_data.last_name,
            photo_url=telegram_data.photo_url,
            role=role,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def update_from_telegram(self, user: User, telegram_data: TelegramAuthData) -> User:
        """Обновить данные пользователя из Telegram"""
        user.username = telegram_data.username
        user.first_name = telegram_data.first_name
        user.last_name = telegram_data.last_name
        user.photo_url = telegram_data.photo_url
        await self.db.commit()
        await self.db.refresh(user)
        return user


class RefreshTokenRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, user_id: int, token: str, expires_at: datetime) -> RefreshToken:
        """Создать refresh token"""
        refresh_token = RefreshToken(
            user_id=user_id,
            token=token,
            expires_at=expires_at,
        )
        self.db.add(refresh_token)
        await self.db.commit()
        await self.db.refresh(refresh_token)
        return refresh_token

    async def get_by_token(self, token: str) -> RefreshToken | None:
        """Получить refresh token"""
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token == token)
        )
        return result.scalar_one_or_none()

    async def delete_by_token(self, token: str) -> None:
        """Удалить refresh token"""
        await self.db.execute(
            delete(RefreshToken).where(RefreshToken.token == token)
        )
        await self.db.commit()

    async def delete_expired(self) -> None:
        """Удалить все истекшие токены"""
        await self.db.execute(
            delete(RefreshToken).where(RefreshToken.expires_at < datetime.utcnow())
        )
        await self.db.commit()

    async def delete_user_tokens(self, user_id: int) -> None:
        """Удалить все токены пользователя"""
        await self.db.execute(
            delete(RefreshToken).where(RefreshToken.user_id == user_id)
        )
        await self.db.commit()
