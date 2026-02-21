# Frontend Dashboard

Next.js 15 веб-интерфейс для управления AI агентами через Telegram.

## Технологии

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui компоненты
- Zustand (управление состоянием)
- Axios (HTTP client с JWT interceptors)

## Структура проекта

```
frontend/
├── app/
│   ├── page.tsx                    # Главная страница (редирект)
│   ├── layout.tsx                  # Корневой layout
│   ├── globals.css                 # Глобальные стили
│   ├── agents/
│   │   ├── page.tsx                # Список агентов
│   │   ├── new/page.tsx            # Форма создания агента
│   │   └── [id]/page.tsx           # Детали и управление агентом
│   └── auth/
│       └── login/page.tsx          # Telegram Login Widget
├── components/
│   ├── agents/
│   │   ├── agent-card.tsx          # Карточка агента
│   │   ├── agent-form.tsx          # Форма создания/редактирования
│   │   └── agent-status-badge.tsx  # Badge статуса
│   └── ui/                         # shadcn/ui базовые компоненты
│       ├── button.tsx
│       ├── card.tsx
│       ├── badge.tsx
│       ├── input.tsx
│       ├── label.tsx
│       └── textarea.tsx
├── lib/
│   ├── api.ts                      # API client с JWT
│   ├── auth.ts                     # Управление токенами
│   └── utils.ts                    # Утилиты (cn, formatDate)
├── store/
│   └── agents.ts                   # Zustand store для агентов
├── types/
│   ├── agent.ts                    # Типы Agent, AgentStatus
│   └── auth.ts                     # Типы Auth, TelegramUser
├── middleware.ts                   # Route protection
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Функциональность

### Аутентификация
- Telegram Login Widget
- JWT токены в localStorage
- Автоматический refresh и redirect на /auth/login при 401
- Middleware защита приватных routes

### Управление агентами
- Список всех агентов с карточками
- Создание нового агента через форму
- Просмотр деталей агента
- Запуск/остановка агента
- Удаление агента
- Отображение статусов (idle, active, error, stopped)

### UI/UX
- Адаптивный дизайн
- Темная/светлая тема (CSS variables)
- Состояния загрузки
- Форматирование дат и времени
- Иконки Lucide React

## Установка и запуск

```bash
# Установка зависимостей
npm install

# Создать .env.local из примера
cp .env.example .env.local

# Запуск dev сервера
npm run dev

# Сборка production
npm run build
npm start
```

## Переменные окружения

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=jobsy_bot
```

## API интеграция

API client (`lib/api.ts`) взаимодействует с Backend Orchestrator:

- `POST /api/auth/telegram` - аутентификация через Telegram
- `GET /api/agents` - список агентов
- `GET /api/agents/:id` - детали агента
- `POST /api/agents` - создание агента
- `PATCH /api/agents/:id` - обновление агента
- `DELETE /api/agents/:id` - удаление агента
- `POST /api/agents/:id/start` - запуск агента
- `POST /api/agents/:id/stop` - остановка агента

Все запросы (кроме `/auth/telegram`) требуют JWT токен в заголовке `Authorization: Bearer <token>`.

## Zustand Store

Store управляет состоянием агентов:
- Кэширование списка агентов
- Автоматическое обновление после операций
- Обработка ошибок
- Loading states

## Стек компонентов

Используются shadcn/ui компоненты с полной кастомизацией через Tailwind CSS. Все компоненты написаны с TypeScript и следуют best practices React 19.
