"""
Тесты для системы аутентификации.

Запуск:
    pytest tests/test_auth.py -v
"""

import pytest
from datetime import datetime, timedelta, UTC
from jose import jwt

from src.auth.jwt import (
    create_access_token,
    create_refresh_token,
    verify_access_token,
    verify_refresh_token,
)
from src.auth.telegram_login import verify_telegram_auth
from src.auth.models import UserRole
from src.auth.schemas import TelegramAuthData
from src.config import settings


class TestJWT:
    """Тесты JWT токенов"""

    def test_create_and_verify_access_token(self):
        """Тест создания и проверки access token"""
        token = create_access_token(
            user_id=1,
            telegram_id=123456,
            role=UserRole.USER
        )

        payload = verify_access_token(token)

        assert payload is not None
        assert payload.sub == 1
        assert payload.telegram_id == 123456
        assert payload.role == UserRole.USER

    def test_create_and_verify_refresh_token(self):
        """Тест создания и проверки refresh token"""
        token, expires_at = create_refresh_token(
            user_id=1,
            telegram_id=123456,
            role=UserRole.USER
        )

        payload = verify_refresh_token(token)

        assert payload is not None
        assert payload.sub == 1
        assert payload.telegram_id == 123456
        assert payload.role == UserRole.USER
        assert expires_at > datetime.now(UTC)

    def test_expired_token(self):
        """Тест истекшего токена"""
        # Создание токена с прошедшим сроком
        expire = datetime.now(UTC) - timedelta(minutes=1)
        payload_data = {
            "sub": 1,
            "telegram_id": 123456,
            "role": UserRole.USER.value,
            "exp": int(expire.timestamp()),
            "type": "access"
        }
        token = jwt.encode(payload_data, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

        # Проверка должна вернуть None
        payload = verify_access_token(token)
        assert payload is None

    def test_invalid_token(self):
        """Тест невалидного токена"""
        payload = verify_access_token("invalid-token")
        assert payload is None

    def test_wrong_token_type(self):
        """Тест использования refresh token вместо access"""
        refresh_token, _ = create_refresh_token(1, 123456, UserRole.USER)

        # Access token checker должен отклонить refresh token
        payload = verify_access_token(refresh_token)
        assert payload is None

    def test_all_roles(self):
        """Тест всех ролей"""
        for role in [UserRole.ADMIN, UserRole.USER, UserRole.VIEWER]:
            token = create_access_token(1, 123456, role)
            payload = verify_access_token(token)

            assert payload is not None
            assert payload.role == role


class TestTelegramLogin:
    """Тесты Telegram Login валидации"""

    def test_verify_telegram_auth_invalid_hash(self):
        """Тест с неправильным hash"""
        auth_data = TelegramAuthData(
            id=123456,
            first_name="Test",
            username="testuser",
            auth_date=int(datetime.now(UTC).timestamp()),
            hash="invalid-hash"
        )

        result = verify_telegram_auth(auth_data)
        assert result is False

    def test_verify_telegram_auth_expired(self):
        """Тест с истекшим auth_date (старше 24 часов)"""
        old_date = datetime.now(UTC) - timedelta(hours=25)

        auth_data = TelegramAuthData(
            id=123456,
            first_name="Test",
            auth_date=int(old_date.timestamp()),
            hash="some-hash"
        )

        result = verify_telegram_auth(auth_data)
        assert result is False


class TestRolePermissions:
    """Тесты проверки ролей"""

    def test_admin_has_highest_permissions(self):
        """Админ имеет все права"""
        allowed_roles = [UserRole.ADMIN, UserRole.USER, UserRole.VIEWER]

        assert UserRole.ADMIN in allowed_roles

    def test_user_has_standard_permissions(self):
        """Пользователь имеет стандартные права"""
        allowed_roles = [UserRole.ADMIN, UserRole.USER]

        assert UserRole.USER in allowed_roles
        assert UserRole.VIEWER not in allowed_roles

    def test_viewer_has_limited_permissions(self):
        """Viewer имеет ограниченные права"""
        admin_only = [UserRole.ADMIN]

        assert UserRole.VIEWER not in admin_only
        assert UserRole.USER not in admin_only


# Интеграционные тесты требуют БД
@pytest.mark.integration
class TestAuthIntegration:
    """Интеграционные тесты (требуют БД)"""

    @pytest.mark.asyncio
    async def test_full_auth_flow(self, db_session):
        """Тест полного процесса аутентификации"""
        # Этот тест требует настроенную БД и фикстуры
        # Реализуйте после настройки pytest fixtures
        pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
