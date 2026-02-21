# Quick Start - Аутентификация

## 1. Настройка (5 минут)

### Создайте Telegram бота
```bash
# 1. Откройте @BotFather в Telegram
# 2. Отправьте: /newbot
# 3. Следуйте инструкциям
# 4. Сохраните токен и username
```

### Настройте переменные окружения
```bash
# Скопируйте пример
cp .env.example .env

# Сгенерируйте JWT secret
openssl rand -hex 32

# Отредактируйте .env
nano .env
```

Заполните:
```env
JWT_SECRET_KEY=<output-from-openssl-rand>
TELEGRAM_BOT_TOKEN=<your-bot-token>
TELEGRAM_BOT_USERNAME=<your-bot-username>
```

### Примените миграции
```bash
alembic upgrade head
```

## 2. Запуск сервера

```bash
# Установка зависимостей
pip install -r requirements.txt

# Запуск
uvicorn src.main:app --reload
```

API доступно на: http://localhost:8000

Документация: http://localhost:8000/docs

## 3. Тест авторизации

### Вариант A: Через Swagger UI

1. Откройте http://localhost:8000/docs
2. Найдите `POST /auth/telegram`
3. Нажмите "Try it out"
4. Вставьте данные от Telegram Login Widget
5. Скопируйте `access_token`
6. Нажмите "Authorize" вверху страницы
7. Вставьте токен: `Bearer <access_token>`
8. Теперь можете тестировать защищенные endpoints

### Вариант B: Frontend интеграция

Создайте файл `test_login.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Telegram Login Test</title>
</head>
<body>
    <h1>PHL Jobsy - Telegram Login</h1>

    <script async src="https://telegram.org/js/telegram-widget.js?22"
            data-telegram-login="YOUR_BOT_USERNAME"
            data-size="large"
            data-onauth="onTelegramAuth(user)"
            data-request-access="write">
    </script>

    <div id="result"></div>

    <script>
    function onTelegramAuth(user) {
        console.log('Telegram data:', user);

        fetch('http://localhost:8000/auth/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        })
        .then(r => r.json())
        .then(data => {
            console.log('Auth response:', data);
            document.getElementById('result').innerHTML = `
                <h2>Success!</h2>
                <p>Access Token: <code>${data.access_token}</code></p>
                <p>Refresh Token: <code>${data.refresh_token}</code></p>
            `;

            // Сохранение токенов
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);

            // Тест защищенного endpoint
            testProtectedEndpoint(data.access_token);
        })
        .catch(err => {
            console.error('Error:', err);
            document.getElementById('result').innerHTML = `
                <h2>Error</h2>
                <p>${err.message}</p>
            `;
        });
    }

    function testProtectedEndpoint(token) {
        fetch('http://localhost:8000/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(r => r.json())
        .then(data => {
            console.log('User info:', data);
            document.getElementById('result').innerHTML += `
                <h3>User Info</h3>
                <pre>${JSON.stringify(data, null, 2)}</pre>
            `;
        });
    }
    </script>
</body>
</html>
```

Замените `YOUR_BOT_USERNAME` и откройте файл в браузере.

## 4. Добавление авторизации в свои endpoints

### Простой пример

```python
from typing import Annotated
from fastapi import APIRouter, Depends
from auth import get_current_active_user, User

router = APIRouter()

@router.get("/my-endpoint")
async def my_endpoint(
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    return {
        "message": f"Hello, {current_user.username}!",
        "user_id": current_user.id,
        "role": current_user.role.value
    }
```

### С проверкой роли

```python
from auth import require_admin, require_user, User

# Только админы
@router.delete("/delete-all")
async def delete_all(current_user: Annotated[User, require_admin]):
    return {"status": "deleted"}

# Админы и пользователи
@router.post("/create")
async def create(current_user: Annotated[User, require_user]):
    return {"status": "created"}
```

### Защита всего роутера

```python
from fastapi import APIRouter, Depends
from auth import get_current_active_user

router = APIRouter(
    prefix="/api",
    dependencies=[Depends(get_current_active_user)]  # Все endpoints требуют авторизацию
)

@router.get("/data")
async def get_data():
    # Автоматически требует авторизацию
    return {"data": "protected"}
```

## 5. Создание первого админа

```python
# Запустите Python shell
python3

# Выполните код
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from datetime import datetime, UTC

from src.auth.models import User, UserRole
from src.auth.repository import UserRepository
from src.auth.schemas import TelegramAuthData
from src.config import settings

async def create_admin():
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        repo = UserRepository(session)

        # Замените на ваш Telegram ID
        telegram_data = TelegramAuthData(
            id=YOUR_TELEGRAM_ID,  # Получите из @userinfobot
            first_name="Admin",
            username="admin",
            auth_date=int(datetime.now(UTC).timestamp()),
            hash="manual-creation"
        )

        user = await repo.create(telegram_data, role=UserRole.ADMIN)
        print(f"Admin created: {user.id} - {user.username}")

asyncio.run(create_admin())
```

## 6. Полезные команды

```bash
# Проверка здоровья API
curl http://localhost:8000/health

# Получение информации о текущем пользователе
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Обновление access token
curl -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "YOUR_REFRESH_TOKEN"}'

# Выход (удаление refresh token)
curl -X POST http://localhost:8000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "YOUR_REFRESH_TOKEN"}'
```

## 7. Troubleshooting

### Ошибка: "Invalid Telegram authentication data"

Проверьте:
1. Правильность `TELEGRAM_BOT_TOKEN` в `.env`
2. Данные от виджета не старше 24 часов
3. Hash совпадает с вычисленным

### Ошибка: "Invalid or expired token"

Решение:
1. Используйте `/auth/refresh` для получения нового access token
2. Если refresh token истек - войдите заново через Telegram

### Ошибка: "Insufficient permissions"

Причина: роль пользователя не подходит для endpoint.

Решение: назначьте нужную роль в БД или используйте другой аккаунт.

## Готово!

Система аутентификации настроена. См. полную документацию в [AUTH.md](AUTH.md).
