"""Внутреннее DNS-имя контейнера агента в кластере оркестратора."""

from ..agents.models import Agent
from ..config import settings


def agent_internal_host(agent: Agent) -> str:
    """Имя хоста, по которому оркестратор стучится в HTTP API агента (порт 8080)."""
    if settings.deployment_type == "k8s":
        return f"agent-{agent.id}-svc"
    return f"jobs-agent-{agent.id}"
