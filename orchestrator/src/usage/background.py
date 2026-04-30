"""Фоновый poller: раз в 5 минут собирает usage с RUNNING агентов и пишет snapshot в БД."""

import asyncio
import logging
from typing import Any

import httpx
from sqlalchemy import select

from ..agents.models import Agent, AgentStatus, AgentUsageSnapshot
from ..config import settings
from ..database import async_session_maker
from ..utils.agent_host import agent_internal_host

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60
HTTP_TIMEOUT_SECONDS = 10.0
MAX_PARALLEL_FETCHES = 16


def _nonneg_int(v: Any) -> int:
    return max(0, int(v or 0))


async def _fetch_agent_usage(
    client: httpx.AsyncClient,
    agent: Agent,
    sem: asyncio.Semaphore,
) -> dict[str, Any] | None:
    """GET http://{host}:8080/usage. None при недоступности или плохом ответе."""
    host = agent_internal_host(agent)
    url = f"http://{host}:8080/usage"
    headers = {"Authorization": f"Bearer {settings.jwt_secret_key}"}
    async with sem:
        try:
            response = await client.get(url, headers=headers)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError) as exc:
            logger.debug("Usage fetch unreachable agent_id=%s: %s", agent.id, exc)
            return None

    if response.status_code != 200:
        logger.warning(
            "Usage fetch failed agent_id=%s status=%s",
            agent.id, response.status_code,
        )
        return None
    try:
        return response.json()
    except ValueError:
        logger.warning("Usage fetch invalid JSON agent_id=%s", agent.id)
        return None


def _coerce_cost(value: Any) -> float | None:
    # bool — наследник int в Python; явно отсекаем, чтобы True не записался как 1.0 USD.
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _build_breakdown(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    breakdown: dict[str, dict[str, Any]] = {}
    for row in payload.get("by_model") or []:
        if not isinstance(row, dict):
            continue
        model = row.get("model")
        if not model or not isinstance(model, str):
            continue
        breakdown[model] = {
            "input_tokens": _nonneg_int(row.get("input_tokens")),
            "output_tokens": _nonneg_int(row.get("output_tokens")),
            "cache_creation_input_tokens": _nonneg_int(row.get("cache_creation_input_tokens")),
            "cache_read_input_tokens": _nonneg_int(row.get("cache_read_input_tokens")),
            "total_cost_usd": _coerce_cost(row.get("total_cost_usd")),
        }
    return breakdown


def _payload_to_snapshot(agent_id: int, payload: dict[str, Any]) -> AgentUsageSnapshot:
    totals = payload.get("totals") or {}
    return AgentUsageSnapshot(
        agent_id=agent_id,
        input_tokens=_nonneg_int(totals.get("input_tokens")),
        output_tokens=_nonneg_int(totals.get("output_tokens")),
        cache_creation_input_tokens=_nonneg_int(totals.get("cache_creation_input_tokens")),
        cache_read_input_tokens=_nonneg_int(totals.get("cache_read_input_tokens")),
        total_cost_usd=_coerce_cost(totals.get("total_cost_usd")),
        events_count=_nonneg_int(totals.get("events_count")),
        breakdown_by_model=_build_breakdown(payload),
    )


async def _persist_snapshot(agent_id: int, payload: dict[str, Any]) -> None:
    """Пишет snapshot в собственной сессии, чтобы ошибка одного агента
    не отравляла транзакции других."""
    try:
        async with async_session_maker() as db:
            db.add(_payload_to_snapshot(agent_id, payload))
            await db.commit()
    except Exception:
        logger.exception("Usage snapshot save failed agent_id=%s", agent_id)


async def _poll_once() -> None:
    async with async_session_maker() as db:
        result = await db.execute(
            select(Agent).where(Agent.status == AgentStatus.RUNNING)
        )
        agents = list(result.scalars().all())

    if not agents:
        return

    sem = asyncio.Semaphore(MAX_PARALLEL_FETCHES)
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS, trust_env=False) as client:
        tasks = [_fetch_agent_usage(client, a, sem) for a in agents]
        payloads = await asyncio.gather(*tasks, return_exceptions=True)

    persist_tasks: list[asyncio.Task] = []
    for agent, payload in zip(agents, payloads):
        if isinstance(payload, Exception):
            logger.warning("Usage fetch exception agent_id=%s: %s", agent.id, payload)
            continue
        if not payload:
            continue
        persist_tasks.append(asyncio.create_task(_persist_snapshot(agent.id, payload)))
    if persist_tasks:
        await asyncio.gather(*persist_tasks, return_exceptions=True)


async def usage_poll_loop() -> None:
    """Бесконечный цикл сбора usage-снапшотов."""
    while True:
        try:
            await _poll_once()
        except Exception:
            logger.exception("Error in usage poll loop")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
