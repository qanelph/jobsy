from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from .jwt import verify_access_token
from .models import User, UserRole
from .repository import UserRepository
from .schemas import TokenPayload


security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Dependency для получения текущего пользователя из JWT токена"""
    token = credentials.credentials

    # Проверка токена
    payload: TokenPayload | None = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Получение пользователя из БД
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(payload.sub)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Dependency для получения активного пользователя"""
    return current_user


def require_role(*allowed_roles: UserRole):
    """Декоратор для проверки роли пользователя"""
    async def role_checker(
        current_user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_checker


# Готовые dependencies для разных ролей
require_admin = Depends(require_role(UserRole.ADMIN))
require_user = Depends(require_role(UserRole.ADMIN, UserRole.USER))
require_any = Depends(get_current_active_user)
