import hashlib
import hmac
from datetime import datetime, timedelta, UTC
from ..config import settings
from .schemas import TelegramAuthData


def verify_telegram_auth(auth_data: TelegramAuthData) -> bool:
    """
    Валидирует данные Telegram Login Widget.

    Алгоритм проверки:
    1. Проверяет, что auth_date не старше 24 часов
    2. Создает data_check_string из всех полей кроме hash
    3. Вычисляет secret_key = SHA256(bot_token)
    4. Вычисляет hash = HMAC-SHA256(data_check_string, secret_key)
    5. Сравнивает полученный hash с переданным
    """

    # Проверка актуальности (не старше 24 часов)
    auth_datetime = datetime.fromtimestamp(auth_data.auth_date, UTC)
    if datetime.now(UTC) - auth_datetime > timedelta(hours=24):
        return False

    # Создание data_check_string
    check_data = {
        "id": str(auth_data.id),
        "first_name": auth_data.first_name,
        "auth_date": str(auth_data.auth_date),
    }

    if auth_data.username:
        check_data["username"] = auth_data.username
    if auth_data.last_name:
        check_data["last_name"] = auth_data.last_name
    if auth_data.photo_url:
        check_data["photo_url"] = auth_data.photo_url

    # Сортировка и формирование строки
    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(check_data.items())
    )

    # Вычисление secret_key
    secret_key = hashlib.sha256(settings.telegram_bot_token.encode()).digest()

    # Вычисление hash
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256
    ).hexdigest()

    # Сравнение
    return hmac.compare_digest(computed_hash, auth_data.hash)
