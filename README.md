# Jobsy Platform

Веб-платформа для управления множественными Jobs агентами.

## Архитектура

```
jobsy/
├── orchestrator/     # Backend FastAPI - управление агентами
├── frontend/         # Next.js Dashboard - веб-интерфейс
└── k8s/             # Kubernetes манифесты
```

## Компоненты

### Orchestrator (Backend)
- FastAPI async приложение
- PostgreSQL для хранения конфигураций агентов
- Docker API / Kubernetes API для spawning агентов
- JWT аутентификация + Telegram Login Widget
- REST API для управления агентами

### Frontend (Next.js)
- Dashboard для управления агентами
- Создание/остановка/удаление агентов
- Настройка Telegram credentials (Telethon + Bot API)
- Управление браузером для каждого агента

### K8s
- Шаблоны Deployment для orchestrator, frontend, postgres
- Динамическое создание агентов в K8s
- Ingress с wildcard роутингом для агентов

## Docker Hub

Публичные образы: [hub.docker.com/u/jobsyk](https://hub.docker.com/u/jobsyk)

| Образ | Описание |
|-------|----------|
| `jobsyk/jobsy-orchestrator` | Backend API (FastAPI) |
| `jobsyk/jobsy-frontend` | Dashboard (Next.js) |
| `jobsyk/jobs-agent` | AI-агент |
| `jobsyk/jobs-browser` | Browser sidecar (Chromium + noVNC) |

## Deployment

### Docker Compose (локальная разработка)
```bash
cd orchestrator
docker-compose up -d
```

### Kubernetes (production)
```bash
# Настроить переменные
export ENV_NAME=prod
export PLATFORM_DOMAIN=your-domain.example.com
export CONTAINER_REGISTRY=jobsyk
export IMAGE_TAG=latest

# Отрендерить и применить манифесты
cd k8s && ./render.sh
kubectl apply -f render/ -n jobs
```

## Возможности

✅ Создание множественных Jobs агентов
✅ Поддержка Telethon и Telegram Bot API одновременно
✅ Опциональный браузер для каждого агента
✅ Кастомный системный промпт для каждого агента
✅ JWT + Telegram аутентификация
✅ RBAC (admin/user роли)

## Связь с проектом Jobs

Orchestrator спавнит агентов из образа `jobsyk/jobs-agent:latest` (исходники: `/Users/qanelph/Code/jobs`).
Каждый агент получает свою изолированную среду с собственными credentials и данными.
