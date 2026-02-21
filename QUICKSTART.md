# 🚀 Quick Start Guide

Быстрый старт для запуска Jobsy Platform.

## Предварительные требования

- Docker + Docker Compose
- Node.js 18+ (для frontend разработки)
- Python 3.12+ (для orchestrator разработки)

## Шаг 1: Запуск платформы (Docker Compose)

```bash
cd /Users/qanelph/Code/jobsy/orchestrator

# Создать .env файл
cat > .env << 'ENVFILE'
# Database
DATABASE_URL=postgresql://postgres:postgres@db:5432/orchestrator

# JWT
JWT_SECRET_KEY=your-secret-key-change-in-production
JWT_ALGORITHM=HS256

# Telegram Bot (для Login Widget)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_BOT_USERNAME=YourBotUsername

# Deployment
DEPLOYMENT_TYPE=docker
ENVFILE

# Запустить все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps
```

Сервисы будут доступны:
- **Frontend**: http://localhost:3000
- **Orchestrator API**: http://localhost:8000
- **PostgreSQL**: localhost:5432

## Шаг 2: Первый вход

1. Откройте http://localhost:3000
2. Вы будете перенаправлены на /auth/login
3. Нажмите кнопку "Login with Telegram"
4. Авторизуйтесь через Telegram
5. Вы будете перенаправлены на Dashboard

## Шаг 3: Создание первого агента

1. На Dashboard нажмите "Создать агента"
2. Заполните форму:
   - **Имя**: `alice-agent`
   - **Display Name**: `Alice Assistant`
   - **Telethon credentials** (если нужен):
     - API ID: `12345`
     - API Hash: `your-hash`
     - User ID: `123456`
   - **Bot API token** (опционально): `789012:XYZ...`
   - **Браузер**: включить/выключить
   - **Системный промпт**: 
     ```
     Ты — личный AI-ассистент Alice.
     Помогай с задачами, отвечай на вопросы.
     ```
   - **Environment variables**: 
     ```json
     {
       "ANTHROPIC_API_KEY": "sk-...",
       "HTTP_PROXY": "http://proxy:8080"
     }
     ```
3. Нажмите "Создать агента"

Orchestrator создаст Docker контейнеры для агента:
- `alice-agent-jobs` — основной контейнер
- `alice-agent-browser` — браузер (если включен)

## Шаг 4: Управление агентом

На Dashboard вы увидите карточку агента с кнопками:
- **▶️ Start** — запустить агента
- **⏸ Stop** — остановить агента
- **🔄 Restart** — перезапустить
- **🗑 Delete** — удалить агента

Статусы агента:
- 🟢 **running** — работает
- 🔴 **stopped** — остановлен
- 🟡 **starting** — запускается
- 🔴 **error** — ошибка

## Шаг 5: Подключение к агенту

### Через Telegram (Telethon)

Если указали Telethon credentials:
1. Найдите агента в Telegram (если настроили session)
2. Напишите сообщение
3. Агент ответит через Claude

### Через Telegram (Bot API)

Если указали Bot API token:
1. Найдите бота через @username
2. Напишите `/start`
3. Пишите сообщения — агент ответит

### Через веб-интерфейс (будущее)

В будущем добавим веб-чат прямо в Dashboard.

## Troubleshooting

### Агент не запускается

Проверьте логи:
```bash
docker logs alice-agent-jobs
docker logs alice-agent-browser
```

### Ошибка "Port already in use"

Orchestrator автоматически выделяет порты из диапазона 8100-8200.
Если все порты заняты, удалите ненужные агенты.

### Telegram session невалиден

Для Telethon нужна авторизация при первом запуске:
```bash
docker exec -it alice-agent-jobs python3 -m src.setup
```

## Следующие шаги

- [📖 Полная документация](README.md)
- [🔐 Настройка аутентификации](orchestrator/README.md#authentication)
- [☸️ Деплой в Kubernetes](k8s/README.md)
- [🤖 Bot API vs Telethon](../jobs/docs/BOT_API.md)

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:3000
```

### Orchestrator

```bash
cd orchestrator
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload
# http://localhost:8000
```

## Production Deployment

См. [k8s/README.md](k8s/README.md) для деплоя в Kubernetes.
