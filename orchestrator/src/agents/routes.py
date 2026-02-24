import json
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import require_admin, require_any
from ..auth.models import User
from ..config import settings
from ..database import get_db
from .models import Agent, AgentStatus, GlobalConfig
from .schemas import AgentCreate, AgentUpdate, AgentResponse, AgentListResponse, GlobalConfigResponse, GlobalConfigUpdate
from .manager import AgentManager

router = APIRouter(prefix="/agents", tags=["agents"])
manager = AgentManager()


@router.get("/config", response_model=GlobalConfigResponse)
async def get_global_config(
    db: AsyncSession = Depends(get_db),
    _user: User = require_any,
) -> GlobalConfigResponse:
    """Получить глобальный конфиг"""
    config = await db.get(GlobalConfig, 1)
    if not config:
        return GlobalConfigResponse(env_vars={})
    return GlobalConfigResponse.model_validate(config)


@router.patch("/config", response_model=GlobalConfigResponse)
async def update_global_config(
    data: GlobalConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = require_admin,
) -> GlobalConfigResponse:
    """Обновить глобальный конфиг"""
    config = await db.get(GlobalConfig, 1)
    if not config:
        config = GlobalConfig(id=1, env_vars=json.dumps(data.env_vars))
        db.add(config)
    else:
        config.env_vars = json.dumps(data.env_vars)
    await db.commit()
    await db.refresh(config)
    return GlobalConfigResponse.model_validate(config)


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(
    data: AgentCreate,
    db: AsyncSession = Depends(get_db)
) -> AgentResponse:
    """Создать нового агента"""
    try:
        return await manager.create_agent(data, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=AgentListResponse)
async def list_agents(
    telegram_user_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
) -> AgentListResponse:
    """Получить список агентов"""
    return await manager.list_agents(telegram_user_id, db, skip, limit)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db)
) -> AgentResponse:
    """Получить агента по ID"""
    agent = await manager.get_agent(agent_id, db)
    if not agent:
        raise HTTPException(status_code=404, detail="Агент не найден")
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: int,
    data: AgentUpdate,
    db: AsyncSession = Depends(get_db)
) -> AgentResponse:
    """Обновить агента"""
    agent = await manager.update_agent(agent_id, data, db)
    if not agent:
        raise HTTPException(status_code=404, detail="Агент не найден")
    return agent


@router.post("/{agent_id}/start", response_model=AgentResponse)
async def start_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db)
) -> AgentResponse:
    """Запустить агента"""
    try:
        agent = await manager.start_agent(agent_id, db)
        if not agent:
            raise HTTPException(status_code=404, detail="Агент не найден")
        return agent
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{agent_id}/stop", response_model=AgentResponse)
async def stop_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db)
) -> AgentResponse:
    """Остановить агента"""
    try:
        agent = await manager.stop_agent(agent_id, db)
        if not agent:
            raise HTTPException(status_code=404, detail="Агент не найден")
        return agent
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{agent_id}/restart", response_model=AgentResponse)
async def restart_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db)
) -> AgentResponse:
    """Перезапустить агента"""
    try:
        agent = await manager.restart_agent(agent_id, db)
        if not agent:
            raise HTTPException(status_code=404, detail="Агент не найден")
        return agent
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db)
) -> None:
    """Удалить агента"""
    success = await manager.delete_agent(agent_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Агент не найден")


# --- Agent settings proxy ---

async def _get_running_agent(agent_id: int, db: AsyncSession) -> Agent:
    """Получить агента, проверить что он RUNNING."""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Агент не найден")
    if agent.status != AgentStatus.RUNNING:
        raise HTTPException(status_code=409, detail=f"Агент не запущен (status={agent.status.value})")
    return agent


async def _proxy_to_agent(
    agent: Agent,
    method: str,
    json_body: dict[str, Any] | None = None,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Проксировать запрос к HTTP API агента."""
    if settings.deployment_type == "k8s":
        host = f"agent-{agent.id}-svc"
    else:
        host = f"jobs-agent-{agent.id}"
    url = f"http://{host}:8080/config"
    headers = {"Authorization": f"Bearer {settings.jwt_secret_key}"}

    try:
        async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
            response = await client.request(method, url, headers=headers, json=json_body, params=params)
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail=f"Агент недоступен ({host}:8080)")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"Таймаут соединения с агентом ({host}:8080)")

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()


@router.get("/{agent_id}/settings")
async def get_agent_settings(
    agent_id: int,
    unmask: bool = False,
    db: AsyncSession = Depends(get_db),
    _user: User = require_any,
) -> dict[str, Any]:
    """Получить конфигурацию запущенного агента (proxy к агенту)."""
    agent = await _get_running_agent(agent_id, db)
    params = {"unmask": "true"} if unmask else None
    return await _proxy_to_agent(agent, "GET", params=params)


@router.patch("/{agent_id}/settings")
async def patch_agent_settings(
    agent_id: int,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    _user: User = require_admin,
) -> dict[str, Any]:
    """Обновить конфигурацию запущенного агента (proxy к агенту)."""
    agent = await _get_running_agent(agent_id, db)
    return await _proxy_to_agent(agent, "PATCH", json_body=body)
