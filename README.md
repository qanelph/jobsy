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

## Deployment

### Docker Compose (локальная разработка)
```bash
cd orchestrator
docker-compose up -d
```

### Kubernetes (production)
```bash
kubectl apply -f k8s/render/ -n jobs
```

## Возможности

✅ Создание множественных Jobs агентов
✅ Поддержка Telethon и Telegram Bot API одновременно
✅ Опциональный браузер для каждого агента
✅ Кастомный системный промпт для каждого агента
✅ JWT + Telegram аутентификация
✅ RBAC (admin/user роли)

## Связь с проектом Jobs

Orchestrator использует Docker образы из `/Users/qanelph/Code/jobs`:
- `jobs:latest` - основной контейнер агента
- `jobs-browser:latest` - браузер с noVNC

Каждый агент получает свою изолированную среду с собственными credentials и данными.
