"""Менеджер обновлений — проверка Docker Hub + rolling update K8s deployments."""

import asyncio
import datetime
import logging

from kubernetes import client, config
from kubernetes.client.exceptions import ApiException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.k8s_spawner import AGENT_LABEL
from ..agents.models import Agent, AgentStatus
from ..config import settings
from .checker import checker
from .schemas import ImageUpdateInfo, UpdateStatus

logger = logging.getLogger(__name__)

ORCHESTRATOR_IMAGE = "jobsyk/jobsy-orchestrator"
FRONTEND_IMAGE = "jobsyk/jobsy-frontend"


def _init_k8s() -> None:
    config.load_incluster_config()


def _get_pod_digest(label_selector: str, container_name: str, namespace: str) -> str:
    """Получить image digest из running pod по label selector."""
    try:
        core = client.CoreV1Api()
        pods = core.list_namespaced_pod(
            namespace=namespace,
            label_selector=label_selector,
            field_selector="status.phase=Running",
            limit=1,
        )
        for pod in pods.items:
            for cs in (pod.status.container_statuses or []):
                if cs.name == container_name and cs.image_id:
                    if "@" in cs.image_id:
                        return cs.image_id.split("@")[-1]
        return ""
    except ApiException as e:
        logger.warning("K8s API error getting digest for %s: %s", label_selector, e.reason)
        return ""


async def check_all() -> UpdateStatus:
    """Проверить обновления для всех трёх компонентов."""
    namespace = settings.k8s_namespace
    agent_image = settings.agent_image.split(":")[0]

    if settings.deployment_type == "k8s":
        def _fetch_digests() -> tuple[str, str, str]:
            _init_k8s()
            return (
                _get_pod_digest(f"app={AGENT_LABEL}", "agent", namespace),
                _get_pod_digest("app=orchestrator", "orchestrator", namespace),
                _get_pod_digest("app=frontend", "frontend", namespace),
            )

        agent_digest, orch_digest, front_digest = await asyncio.to_thread(_fetch_digests)
    else:
        agent_digest = orch_digest = front_digest = ""

    agent_info = await checker.check(agent_image, agent_digest)
    orch_info = await checker.check(ORCHESTRATOR_IMAGE, orch_digest)
    front_info = await checker.check(FRONTEND_IMAGE, front_digest)

    return UpdateStatus(agent=agent_info, orchestrator=orch_info, frontend=front_info)


async def update_agents(db: AsyncSession) -> list[str]:
    """Обновить образ всех running агентов (rolling restart)."""
    if settings.deployment_type != "k8s":
        return ["Update agents поддерживается только в K8s"]

    namespace = settings.k8s_namespace
    image = settings.agent_image

    result = await db.execute(
        select(Agent).where(Agent.status == AgentStatus.RUNNING)
    )
    agents = result.scalars().all()

    def _do_update() -> list[str]:
        _init_k8s()
        apps = client.AppsV1Api()
        updated: list[str] = []
        for agent in agents:
            dep_name = f"agent-{agent.id}"
            try:
                apps.patch_namespaced_deployment(
                    name=dep_name,
                    namespace=namespace,
                    body={
                        "spec": {
                            "template": {
                                "metadata": {
                                    "annotations": {
                                        "jobsy/restart-at": datetime.datetime.utcnow().isoformat()
                                    }
                                },
                                "spec": {
                                    "containers": [{"name": "agent", "image": image}]
                                },
                            }
                        }
                    },
                )
                updated.append(f"{dep_name} ({agent.name})")
                logger.info("Updated agent %s image to %s", dep_name, image)
            except ApiException as e:
                logger.error("Failed to update %s: %s", dep_name, e.reason)
        return updated

    return await asyncio.to_thread(_do_update)


async def update_platform() -> list[str]:
    """Обновить orchestrator + frontend deployments."""
    if settings.deployment_type != "k8s":
        return ["Update platform поддерживается только в K8s"]

    namespace = settings.k8s_namespace

    def _do_update() -> list[str]:
        _init_k8s()
        apps = client.AppsV1Api()
        restart_annotation = {"jobsy/restart-at": datetime.datetime.utcnow().isoformat()}
        updated: list[str] = []
        for dep_name, container, image in [
            ("frontend", "frontend", f"{FRONTEND_IMAGE}:latest"),
            ("orchestrator", "orchestrator", f"{ORCHESTRATOR_IMAGE}:latest"),
        ]:
            try:
                apps.patch_namespaced_deployment(
                    name=dep_name,
                    namespace=namespace,
                    body={
                        "spec": {
                            "template": {
                                "metadata": {"annotations": restart_annotation},
                                "spec": {
                                    "containers": [{"name": container, "image": image}]
                                },
                            }
                        }
                    },
                )
                updated.append(dep_name)
                logger.info("Updated %s to %s", dep_name, image)
            except ApiException as e:
                logger.error("Failed to update %s: %s", dep_name, e.reason)
        return updated

    return await asyncio.to_thread(_do_update)
