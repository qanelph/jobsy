# Jobsy Platform

## Overview
Jobsy — платформа управления автономными AI-агентами (Jobs) в Docker-контейнерах. Включает веб-дашборд, REST API оркестратор и систему аутентификации через Telegram/JWT.

## Architecture

```
frontend/          — Next.js 15 (React 19, TypeScript, Tailwind, Zustand)
orchestrator/      — FastAPI (Python 3.11, SQLAlchemy 2.0, asyncpg)
k8s/               — Kubernetes манифесты (Yandex Cloud)
```

### Ports (dev)
- Frontend: `localhost:9002`
- Orchestrator API: `localhost:9001` (→ container :8000)
- PostgreSQL: `localhost:9000` (→ container :5432)
- Agent ports: `8100–8200` (динамическое выделение)

## Tech Stack

### Backend (orchestrator/)
- **Framework**: FastAPI 0.115 + Uvicorn
- **ORM**: SQLAlchemy 2.0 (async) + asyncpg
- **DB**: PostgreSQL 16
- **Auth**: JWT (PyJWT), Telegram Login Widget (HMAC-SHA256), bcrypt
- **Docker**: docker-py 7.1 для спавна агентов
- **Claude**: OAuth 2.0 (PKCE) с platform.claude.com + API key fallback

### Frontend (frontend/)
- **Framework**: Next.js 15 (App Router), React 19
- **State**: Zustand 5.0
- **HTTP**: Axios с interceptors (auto Bearer token, 401 redirect)
- **UI**: Tailwind CSS 3.4, Framer Motion, Radix UI, Lucide icons
- **Design**: Dark theme, glass-morphism
- **Chat**: WebSocket real-time стриминг к агентам

## Project Structure

### Orchestrator
```
orchestrator/src/
├── main.py              # FastAPI app, lifespan, CORS, routers
├── config.py            # Pydantic Settings (.env)
├── database.py          # Async SQLAlchemy engine, session, init_db()
├── agents/
│   ├── models.py        # Agent ORM (status enum: creating/running/stopped/error/deleted)
│   ├── schemas.py       # Pydantic request/response
│   ├── routes.py        # CRUD + start/stop/restart/delete endpoints
│   ├── manager.py       # Business logic (create/start/stop/delete agent)
│   ├── spawner.py       # Docker container lifecycle (network + browser sidecar + agent)
│   └── k8s_spawner.py   # Kubernetes spawner (stub, not implemented)
├── auth/
│   ├── models.py        # User, RefreshToken ORM
│   ├── schemas.py       # Auth Pydantic schemas
│   ├── routes.py        # login, telegram, refresh, logout, set-password, me
│   ├── jwt.py           # create/verify access & refresh tokens
│   ├── password.py      # bcrypt hash/verify
│   ├── telegram_login.py # HMAC-SHA256 Telegram widget verification
│   ├── dependencies.py  # get_current_user, require_role decorators
│   └── repository.py    # UserRepository, RefreshTokenRepository
├── claude_auth/
│   ├── models.py        # ClaudeCredential singleton (id=1)
│   ├── schemas.py       # OAuth status/callback schemas
│   ├── routes.py        # OAuth start/callback, API key set, distribute
│   ├── oauth.py         # PKCE OAuth flow with platform.claude.com
│   ├── manager.py       # Credential lifecycle + refresh_if_needed
│   ├── distributor.py   # Write .credentials.json to agent containers via tar
│   └── background.py    # Token refresh loop (every 30 min)
└── utils/
    ├── docker_client.py  # Docker API wrapper (networks, containers, volumes)
    └── port_manager.py   # Port allocation 8100-8200
```

### Frontend
```
frontend/
├── app/
│   ├── layout.tsx          # Root layout (Inter font, Cyrillic)
│   ├── page.tsx            # Redirect: auth → /auth/login, logged → /agents
│   ├── agents/
│   │   ├── page.tsx        # Agent grid dashboard
│   │   ├── new/page.tsx    # Create agent form
│   │   └── [id]/page.tsx   # Agent detail (tabs: Overview, Chat, Logs, Settings)
│   └── auth/
│       ├── login/page.tsx  # Email/password login (default: admin@jobsy.dev/admin123)
│       └── set-password/page.tsx
├── components/
│   ├── agents/             # agent-card, agent-form, agent-status-badge
│   ├── chat/agent-chat.tsx # WebSocket chat with streaming
│   ├── layout/             # app-layout, sidebar (collapsible)
│   └── ui/                 # button, card, input, textarea, badge, label, alert-dialog
├── hooks/use-agent-chat.ts # WebSocket hook (connect, stream, reconnect)
├── lib/
│   ├── api.ts              # Axios client + interceptors
│   ├── auth.ts             # Token storage (localStorage + cookies), JWT decode
│   └── utils.ts            # cn(), formatDate(), formatRelativeTime()
├── store/agents.ts         # Zustand store (agents CRUD + lifecycle)
├── types/
│   ├── agent.ts            # Agent, AgentStatus, Create/Update request
│   ├── auth.ts             # TelegramUser, AuthResponse, TokenPayload
│   └── chat.ts             # ChatMessage, ConnectionStatus, QueryStatus
└── middleware.ts           # Route protection (token check, redirect to login)
```

## Database Schema

4 таблицы (PostgreSQL 16, auto-created via SQLAlchemy metadata):

- **users** — telegram_id (unique), email, role (admin/user/viewer), password_hash
- **agents** — name (unique), status (enum), container_id, port, custom_instructions, claude_api_key, telegram_bot_token
- **refresh_tokens** — user_id, token (unique), expires_at
- **claude_credentials** — singleton (id=1), auth_mode (oauth/api_key), access/refresh tokens, api_key

## Key Business Flows

### Agent Spawn
1. POST /agents → AgentManager.create_agent()
2. Insert agent (status=CREATING) → AgentSpawner.spawn()
3. Get Claude credentials (OAuth or API key)
4. Allocate port (8100-8200)
5. Create Docker network (`jobs-agent-{id}-net`)
6. Start browser sidecar (shared memory 2GB, alias "browser")
7. Start agent container (env vars, volumes: data/workspace/.claude)
8. Write .credentials.json if OAuth mode
9. Update status → RUNNING

### Auth Flow
- Login: POST /auth/login → JWT access (30min) + refresh (7d) tokens
- Telegram: POST /auth/telegram → HMAC verify → create/update user → tokens
- Protected routes: Bearer token → get_current_user dependency
- Default admin: admin@jobsy.dev / admin123 (must_change_password=true)

### Claude OAuth
- Start: GET /claude-auth/oauth/start → authorize_url (PKCE)
- Callback: POST /claude-auth/oauth/callback → exchange code → store tokens
- Background: token_refresh_loop() every 30min → refresh if <30min to expiry
- Distribute: write .credentials.json to all RUNNING agent containers

## Development

```bash
# Backend
cd orchestrator && docker-compose up -d   # PostgreSQL + Orchestrator
# или
uvicorn src.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev  # localhost:9002

# Health check
curl http://localhost:9001/health
```

## Conventions

- Python: dataclass/Pydantic вместо dict, обязательные type hints
- Без try/except без крайней необходимости
- Простые и прозрачные конструкции
- Frontend: Russian UI language, dark theme, glass-morphism design
- API errors: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found)
- Agent statuses: creating → running → stopped/error → deleted
