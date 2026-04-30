"""Фоновый poller: раз в 5 минут собирает usage с RUNNING агентов и пишет snapshot в БД."""

import asyncio
import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.models import Agent, AgentStatus, AgentUsageSnapshot
from ..config import settings
from ..database import async_session_maker
from ..utils.agent_host import agent_internal_host

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5 * 60
HTTP_TIMEOUT_SECONDS = 10.0


async def _fetch_agent_usage(client: httpx.AsyncClient, agent: Agent) -> dict[str, Any] | None:
    """GET http://{host}:8080/usage. None при недоступности."""
    host = agent_internal_host(agent)
    url = f"http://{host}:8080/usage"
    headers = {"Authorization": f"Bearer {settings.jwt_secret_key}"}
    try:
        response = await client.get(url, headers=headers)
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError) as exc:
        logger.debug("Usage fetch unreachable agent_id=%s: %s", agent.id, exc)
        return None

    if response.status_code != 200:
        logger.warning(
            "Usage fetch failed agent_id=%s status=%s body=%s",
            agent.id, response.status_code, response.text[:200],
        )
        return None
    return response.json()


async def _save_snapshot(db: AsyncSession, agent_id: int, payload: dict[str, Any]) -> None:
    totals = payload.get("totals") or {}
    snapshot = AgentUsageSnapshot(
        agent_id=agent_id,
        input_tokens=int(totals.get("input_tokens") or 0),
        output_tokens=int(totals.get("output_tokens") or 0),
        cache_creation_input_tokens=int(totals.get("cache_creation_input_tokens") or 0),
        cache_read_input_tokens=int(totals.get("cache_read_input_tokens") or 0),
        total_cost_usd=totals.get("total_cost_usd"),
        events_count=int(totals.get("events_count") or 0),
    )
    db.add(snapshot)
    await db.commit()


async def _poll_once() -> None:
    async with async_session_maker() as db:
        result = await db.execute(
            select(Agent).where(Agent.status == AgentStatus.RUNNING)
        )
        agents = result.scalars().all()

        if not agents:
            return

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS, trust_env=False) as client:
            tasks = [_fetch_agent_usage(client, a) for a in agents]
            payloads = await asyncio.gather(*tasks, return_exceptions=True)

        for agent, payload in zip(agents, payloads):
            if isinstance(payload, Exception):
                logger.warning("Usage fetch exception agent_id=%s: %s", agent.id, payload)
                continue
            if payload is None:
                continue
            try:
                await _save_snapshot(db, agent.id, payload)
            except Exception:
                logger.exception("Usage snapshot save failed agent_id=%s", agent.id)


async def usage_poll_loop() -> None:
    """Бесконечный цикл сбора usage-снапшотов."""
    while True:
        try:
            await _poll_once()
        except Exception:
            logger.exception("Error in usage poll loop")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
