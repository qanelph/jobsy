from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .schemas import AgentCreate, AgentUpdate, AgentResponse, AgentListResponse
from .manager import AgentManager

router = APIRouter(prefix="/agents", tags=["agents"])
manager = AgentManager()


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
