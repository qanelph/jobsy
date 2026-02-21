"""
Примеры защищенных endpoints с использованием auth системы.
Используйте эти примеры для интеграции авторизации в agents routes.
"""

from typing import Annotated
from fastapi import APIRouter, Depends
from auth import (
    get_current_active_user,
    require_role,
    require_admin,
    require_user,
    require_any,
    User,
    UserRole,
)


router = APIRouter(prefix="/example", tags=["Examples"])


# Пример 1: Базовая авторизация - любой авторизованный пользователь
@router.get("/profile")
async def get_profile(
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> dict:
    """Доступно всем авторизованным пользователям"""
    return {
        "id": current_user.id,
        "telegram_id": current_user.telegram_id,
        "username": current_user.username,
        "role": current_user.role.value,
    }


# Пример 2: Только для админов
@router.delete("/admin-only/{item_id}")
async def admin_only_endpoint(
    item_id: int,
    current_user: Annotated[User, Depends(require_role(UserRole.ADMIN))]
) -> dict:
    """Доступно только админам"""
    return {
        "message": f"Admin {current_user.username} deleted item {item_id}"
    }


# Пример 3: Для админов и пользователей (не viewers)
@router.post("/create-item")
async def create_item(
    current_user: Annotated[User, Depends(require_role(UserRole.ADMIN, UserRole.USER))]
) -> dict:
    """Доступно админам и пользователям"""
    return {
        "message": f"User {current_user.username} created item",
        "user_role": current_user.role.value,
    }


# Пример 4: Использование готовых dependencies
@router.get("/list-items")
async def list_items(
    current_user: Annotated[User, require_any]
) -> dict:
    """Доступно всем авторизованным (включая viewers)"""
    return {"items": [], "requested_by": current_user.username}


@router.post("/create-advanced")
async def create_advanced(
    current_user: Annotated[User, require_user]
) -> dict:
    """Доступно админам и пользователям (не viewers)"""
    return {"status": "created"}


@router.delete("/delete-advanced/{item_id}")
async def delete_advanced(
    item_id: int,
    current_user: Annotated[User, require_admin]
) -> dict:
    """Только для админов"""
    return {"status": "deleted", "item_id": item_id}


# Пример 5: Защита целого роутера
protected_router = APIRouter(
    prefix="/protected",
    tags=["Protected"],
    dependencies=[Depends(get_current_active_user)]  # Все endpoints требуют авторизацию
)


@protected_router.get("/data")
async def get_protected_data() -> dict:
    """Все endpoints в этом роутере требуют авторизацию"""
    return {"data": "sensitive"}


@protected_router.post("/action", dependencies=[require_admin])  # Дополнительно только админы
async def protected_admin_action() -> dict:
    """Требует авторизацию + роль админа"""
    return {"status": "done"}


# Пример 6: Условная логика на основе роли
@router.get("/items/{item_id}")
async def get_item(
    item_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> dict:
    """Разные данные в зависимости от роли"""
    base_data = {
        "id": item_id,
        "name": "Item Name",
    }

    # Админы видят дополнительные данные
    if current_user.role == UserRole.ADMIN:
        base_data["sensitive_info"] = "admin-only data"
        base_data["user_id"] = 123

    # Viewers не видят действия
    if current_user.role == UserRole.VIEWER:
        base_data["actions"] = []
    else:
        base_data["actions"] = ["edit", "delete"]

    return base_data


# Пример 7: Проверка владения ресурсом
@router.delete("/my-items/{item_id}")
async def delete_my_item(
    item_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> dict:
    """Пользователь может удалить только свои items, админ - любые"""

    # Получение item из БД (псевдокод)
    # item = await get_item_from_db(item_id)

    # Проверка владения (псевдокод)
    # if item.user_id != current_user.id and current_user.role != UserRole.ADMIN:
    #     raise HTTPException(status_code=403, detail="Not authorized")

    return {"status": "deleted", "item_id": item_id}
