# Backend Orchestrator - Реализация

## Реализованные компоненты

### 1. Database Models (SQLAlchemy async)
**Файл**: `/Users/qanelph/Code/jobsy/orchestrator/src/agents/models.py`

- `AgentStatus` — Enum для статусов агента (creating, running, stopped, error, deleted)
- `Agent` — Модель агента с полями:
  - Базовая информация: id, name, telegram_user_id
  - Статус и конфигурация: status, container_id, port
  - Кастомизация: custom_instructions, telegram_bot_token, claude_api_key
  - Метрики: total_sessions, active_sessions
  - Timestamps: created_at, updated_at, last_heartbeat

### 2. Pydantic Schemas
**Файл**: `/Users/qanelph/Code/jobsy/orchestrator/src/agents/schemas.py`

- `AgentCreate` — Схема для создания агента
- `AgentUpdate` — Схема для обновления агента
- `AgentResponse` — Схема ответа API
- `AgentListResponse` — Схема списка агентов с пагинацией

### 3. AgentSpawner для Docker
**Файлы**:
- `/Users/qanelph/Code/jobsy/orchestrator/src/agents/spawner.py` — Основной spawner
- `/Users/qanelph/Code/jobsy/orchestrator/src/utils/docker_client.py` — Docker client wrapper
- `/Users/qanelph/Code/jobsy/orchestrator/src/utils/port_manager.py` — Управление портами

**Функциональность**:
- Создание Docker контейнеров для агентов
- Автоматическое выделение портов (8100-8200)
- Управление жизненным циклом контейнеров (start, stop, remove)

### 4. AgentManager
**Файл**: `/Users/qanelph/Code/jobsy/orchestrator/src/agents/manager.py`

**Методы**:
- `create_agent()` — Создание агента и запуск контейнера
- `get_agent()` — Получение агента по ID
- `list_agents()` — Список агентов с фильтрацией и пагинацией
- `update_agent()` — Обновление данных агента
- `start_agent()` — Запуск остановленного агента
- `stop_agent()` — Остановка агента
- `restart_agent()` — Перезапуск агента
- `delete_agent()` — Удаление агента и контейнера

### 5. REST API Endpoints
**Файл**: `/Users/qanelph/Code/jobsy/orchestrator/src/agents/routes.py`

**Endpoints**:
- `POST /agents` — Создать агента
- `GET /agents` — Список агентов (с фильтрацией по telegram_user_id)
- `GET /agents/{id}` — Получить агента
- `PATCH /agents/{id}` — Обновить агента
- `POST /agents/{id}/start` — Запустить
- `POST /agents/{id}/stop` — Остановить
- `POST /agents/{id}/restart` — Перезапустить
- `DELETE /agents/{id}` — Удалить

### 6. FastAPI Application
**Файл**: `/Users/qanelph/Code/jobsy/orchestrator/src/main.py`

**Особенности**:
- Async lifespan для инициализации БД при старте
- CORS middleware
- Health check endpoint
- Интеграция с auth модулем (реализован в задаче #3)

### 7. Configuration
**Файлы**:
- `/Users/qanelph/Code/jobsy/orchestrator/src/config.py` — Pydantic Settings
- `/Users/qanelph/Code/jobsy/orchestrator/.env.example` — Пример конфигурации

**Настройки**:
- Database URL
- JWT конфигурация
- Docker настройки
- Kubernetes флаги (для будущего)
- Диапазон портов для агентов

### 8. Docker Setup
**Файлы**:
- `/Users/qanelph/Code/jobsy/orchestrator/Dockerfile`
- `/Users/qanelph/Code/jobsy/orchestrator/docker-compose.yml`
- `/Users/qanelph/Code/jobsy/orchestrator/requirements.txt`

**Docker Compose включает**:
- PostgreSQL 16
- Orchestrator API
- Healthcheck для postgres
- Volume для данных БД
- Проброс Docker socket для spawning

## Архитектурные решения

### 1. Pythonic подход
- Использование dataclasses через SQLAlchemy Mapped
- Type hints везде
- Pydantic для валидации вместо raw dict

### 2. Async везде
- AsyncSession для БД
- Async методы в manager/spawner
- AsyncGenerator для lifespan

### 3. Чистая архитектура
- Разделение на слои: models, schemas, manager, routes
- Dependency injection через FastAPI Depends
- Утилиты вынесены в отдельный модуль

### 4. Безопасность
- Secrets не логируются
- CORS настраивается
- JWT из отдельного модуля (auth)

## Интеграция с другими модулями

### Auth модуль (задача #3)
- JWT authentication через dependencies
- Telegram login для пользователей
- Защита endpoints через Depends(get_current_user)

### K8s модуль (задача #5)
- Заглушка k8s_spawner.py для будущей реализации
- Флаг USE_KUBERNETES в config

## Как запустить

### Development
```bash
cd /Users/qanelph/Code/jobsy/orchestrator

# Создать .env из примера
cp .env.example .env

# Установить зависимости
pip install -r requirements.txt

# Запустить БД
docker-compose up -d postgres

# Запустить API
uvicorn src.main:app --reload
```

### Production (Docker Compose)
```bash
cd /Users/qanelph/Code/jobsy/orchestrator

# Создать .env с продакшен настройками
cp .env.example .env
nano .env  # отредактировать

# Запустить всё
docker-compose up -d
```

## API Documentation

После запуска доступна на:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Следующие шаги

1. Интеграция с Frontend (задача #4)
2. Добавление Kubernetes spawner (задача #5)
3. Модификация jobs проекта для Bot API (задача #6)
