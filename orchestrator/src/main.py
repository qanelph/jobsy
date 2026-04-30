import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, get_db
from .agents.cleanup import reset_stuck_agents
from .agents.routes import router as agents_router
from .auth.routes import router as auth_router
from .claude_auth.routes import router as claude_auth_router
from .claude_auth.background import token_refresh_loop
from .config import settings
from .config_manager import ConfigManager
from .settings_routes import router as settings_router
from .telethon_auth.routes import router as telethon_auth_router
from .updates.routes import router as updates_router
from .usage.background import usage_poll_loop


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Инициализация приложения при старте"""
    await init_db()

    # Загрузить dynamic settings из БД и подчистить залипших агентов после краша.
    async for db in get_db():
        await ConfigManager.load_from_db(db)
        await reset_stuck_agents(db)

    refresh_task = asyncio.create_task(token_refresh_loop())
    usage_task = asyncio.create_task(usage_poll_loop())
    yield
    for t in (refresh_task, usage_task):
        t.cancel()
        try:
            await t
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(
    title="PHL Jobsy Orchestrator",
    description="API для управления Jobs агентами",
    version="1.0.0",
    lifespan=lifespan,
    debug=False,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.cors_origin == "*" else [s.strip() for s in settings.cors_origin.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роуты
app.include_router(auth_router)
app.include_router(agents_router)
app.include_router(claude_auth_router)
app.include_router(settings_router)
app.include_router(telethon_auth_router)
app.include_router(updates_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint"""
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint"""
    return {
        "message": "PHL Jobsy Orchestrator API",
        "docs": "/docs",
        "health": "/health"
    }
