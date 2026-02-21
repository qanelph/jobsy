# Orchestrator Backend

FastAPI backend для управления Jobs агентами.

## Структура

```
orchestrator/
├── src/
│   ├── main.py              # FastAPI app
│   ├── config.py            # Settings
│   ├── database.py          # PostgreSQL async
│   ├── agents/
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── spawner.py       # Docker spawning
│   │   ├── k8s_spawner.py   # Kubernetes spawning
│   │   ├── manager.py       # Lifecycle management
│   │   └── routes.py        # REST API endpoints
│   ├── auth/
│   │   ├── jwt.py           # JWT tokens
│   │   ├── telegram_login.py
│   │   └── routes.py        # Auth endpoints
│   └── utils/
│       ├── docker_client.py
│       ├── k8s_client.py
│       └── port_manager.py
├── Dockerfile
├── requirements.txt
└── docker-compose.yml
```

## API Endpoints

### Agents
- `POST /agents` - Создать агента
- `GET /agents` - Список агентов
- `GET /agents/{id}` - Получить агента
- `PATCH /agents/{id}` - Обновить агента
- `POST /agents/{id}/start` - Запустить
- `POST /agents/{id}/stop` - Остановить
- `POST /agents/{id}/restart` - Перезапустить
- `DELETE /agents/{id}` - Удалить

### Auth
- `POST /auth/telegram` - Telegram Login
- `POST /auth/refresh` - Refresh token

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start server
uvicorn src.main:app --reload
```

## Docker Compose

```bash
docker-compose up -d
```

Включает:
- orchestrator (FastAPI)
- postgres (БД)
- frontend (Next.js)
