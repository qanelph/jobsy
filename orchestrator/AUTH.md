# Система аутентификации PHL Jobsy

## Обзор

Система аутентификации использует JWT токены (access + refresh) и Telegram Login Widget для входа пользователей.

## Компоненты

### 1. Модели (`src/auth/models.py`)

- **User** - Пользователь системы
  - `telegram_id` - ID из Telegram (уникальный)
  - `username`, `first_name`, `last_name`, `photo_url` - данные из Telegram
  - `role` - роль пользователя (admin, user, viewer)
  - `created_at`, `updated_at` - временные метки

- **RefreshToken** - Refresh токены
  - `user_id` - ID пользователя
  - `token` - сам токен
  - `expires_at` - время истечения
  - `created_at` - время создания

- **UserRole** - Роли пользователей
  - `ADMIN` - полный доступ
  - `USER` - стандартный доступ
  - `VIEWER` - только просмотр

### 2. JWT токены (`src/auth/jwt.py`)

#### Access Token
- Время жизни: 30 минут (настраивается)
- Содержит: user_id, telegram_id, role
- Используется для авторизации API запросов

#### Refresh Token
- Время жизни: 7 дней (настраивается)
- Сохраняется в БД
- Используется для получения нового access token

### 3. Telegram Login (`src/auth/telegram_login.py`)

Валидация данных Telegram Login Widget:
1. Проверка актуальности (не старше 24 часов)
2. Формирование data_check_string
3. Вычисление HMAC-SHA256 с секретом бота
4. Сравнение с переданным hash

### 4. API Endpoints (`src/auth/routes.py`)

#### POST `/auth/telegram`
Вход через Telegram Login Widget

**Request:**
```json
{
  "id": 123456789,
  "first_name": "John",
  "username": "john_doe",
  "last_name": "Doe",
  "photo_url": "https://...",
  "auth_date": 1234567890,
  "hash": "abc123..."
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

#### POST `/auth/refresh`
Обновление access token

**Request:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

#### POST `/auth/logout`
Выход из системы (удаление refresh token)

**Request:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

#### GET `/auth/me`
Получение информации о текущем пользователе

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "id": 1,
  "telegram_id": 123456789,
  "username": "john_doe",
  "first_name": "John",
  "last_name": "Doe",
  "photo_url": "https://...",
  "role": "user",
  "created_at": "2026-02-20T17:40:00Z"
}
```

### 5. Защита endpoints (`src/auth/dependencies.py`)

#### Базовая авторизация
```python
from auth import get_current_active_user

@router.get("/protected")
async def protected_endpoint(
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    return {"user": current_user.username}
```

#### RBAC (Role-Based Access Control)
```python
from auth import require_role, UserRole

# Только для админов
@router.delete("/agents/{id}")
async def delete_agent(
    agent_id: int,
    current_user: Annotated[User, Depends(require_role(UserRole.ADMIN))]
):
    ...

# Для админов и пользователей
@router.post("/agents")
async def create_agent(
    data: AgentCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.ADMIN, UserRole.USER))]
):
    ...
```

#### Готовые dependencies
```python
from auth import require_admin, require_user, require_any

# Только админы
@router.delete("/agents/{id}")
async def delete_agent(current_user: Annotated[User, require_admin]):
    ...

# Админы и пользователи
@router.post("/agents")
async def create_agent(current_user: Annotated[User, require_user]):
    ...

# Любая авторизованная роль
@router.get("/agents")
async def list_agents(current_user: Annotated[User, require_any]):
    ...
```

## Настройка

### 1. Переменные окружения

Создайте файл `.env`:
```bash
cp .env.example .env
```

Заполните:
```env
# JWT
JWT_SECRET_KEY=<generate-with-openssl-rand-hex-32>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Telegram
TELEGRAM_BOT_TOKEN=<your-bot-token-from-botfather>
TELEGRAM_BOT_USERNAME=<your-bot-username>
```

### 2. Создание Telegram бота

1. Откройте [@BotFather](https://t.me/botfather) в Telegram
2. Создайте нового бота: `/newbot`
3. Сохраните токен в `TELEGRAM_BOT_TOKEN`
4. Сохраните username бота в `TELEGRAM_BOT_USERNAME`

### 3. Миграции БД

```bash
# Применить миграции
alembic upgrade head

# Создать новую миграцию
alembic revision --autogenerate -m "description"
```

## Интеграция с Frontend

### Telegram Login Widget

```html
<script async src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login="your_bot_username"
        data-size="large"
        data-onauth="onTelegramAuth(user)"
        data-request-access="write">
</script>

<script>
function onTelegramAuth(user) {
  // Отправка данных на backend
  fetch('/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  })
  .then(r => r.json())
  .then(data => {
    // Сохранение токенов
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
  });
}
</script>
```

### Использование токенов

```javascript
// Запрос с авторизацией
async function fetchProtected() {
  const token = localStorage.getItem('access_token');

  const response = await fetch('/agents', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    // Обновление токена
    await refreshToken();
    // Повторить запрос
    return fetchProtected();
  }

  return response.json();
}

// Обновление access token
async function refreshToken() {
  const refresh = localStorage.getItem('refresh_token');

  const response = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh })
  });

  if (response.ok) {
    const data = await response.json();
    localStorage.setItem('access_token', data.access_token);
  } else {
    // Перенаправление на страницу входа
    window.location.href = '/login';
  }
}
```

## Безопасность

### Рекомендации

1. **JWT Secret Key**
   - Генерируйте случайный ключ: `openssl rand -hex 32`
   - Никогда не коммитьте в git
   - Используйте разные ключи для dev/prod

2. **HTTPS**
   - Используйте только HTTPS в production
   - Токены передаются в заголовках

3. **Refresh Token Rotation**
   - При каждом refresh выпускайте новый refresh token
   - Старый токен инвалидируйте

4. **Rate Limiting**
   - Ограничьте количество попыток входа
   - Используйте slowapi или nginx rate limiting

5. **CORS**
   - Настройте конкретные домены в production
   - Не используйте `allow_origins=["*"]`

6. **Token Storage**
   - Frontend: localStorage или httpOnly cookies
   - Cookies предпочтительнее для защиты от XSS

## Примеры использования

### Создание первого админа

```python
from sqlalchemy.ext.asyncio import AsyncSession
from auth.models import User, UserRole
from auth.repository import UserRepository
from auth.schemas import TelegramAuthData

async def create_admin(db: AsyncSession, telegram_id: int):
    repo = UserRepository(db)

    # Создание фейковых данных для теста
    telegram_data = TelegramAuthData(
        id=telegram_id,
        first_name="Admin",
        auth_date=int(datetime.now(UTC).timestamp()),
        hash="fake-hash-for-manual-creation"
    )

    user = await repo.create(telegram_data, role=UserRole.ADMIN)
    return user
```

### Защита всех routes в роутере

```python
from fastapi import APIRouter, Depends
from auth import require_admin, get_current_active_user

# Все endpoints требуют авторизацию
router = APIRouter(
    prefix="/agents",
    tags=["Agents"],
    dependencies=[Depends(get_current_active_user)]
)

# Дополнительно только для админов
@router.delete("/{id}", dependencies=[require_admin])
async def delete_agent(agent_id: int):
    ...
```

## Тестирование

### Ручное тестирование

```bash
# 1. Получение токена (используйте реальные данные от Telegram)
curl -X POST http://localhost:8000/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123456789,
    "first_name": "Test",
    "auth_date": 1234567890,
    "hash": "..."
  }'

# 2. Использование access token
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer <access_token>"

# 3. Обновление токена
curl -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'
```

### Unit тесты

```python
import pytest
from auth.jwt import create_access_token, verify_access_token
from auth.models import UserRole

def test_jwt_creation_and_verification():
    token = create_access_token(1, 123456, UserRole.USER)
    payload = verify_access_token(token)

    assert payload is not None
    assert payload.sub == 1
    assert payload.telegram_id == 123456
    assert payload.role == UserRole.USER
```
