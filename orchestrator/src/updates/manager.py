"""Менеджер обновлений — проверка Docker Hub + rolling update K8s deployments."""

import logging

from kubernetes import client, config
from kubernetes.client.exceptions import ApiException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.models import Agent, AgentStatus
from ..config import settings
from .checker import checker
from .schemas import ImageUpdateInfo, UpdateStatus

logger = logging.getLogger(__name__)

# Образы платформы (без тега — checker работает с latest)
ORCHESTRATOR_IMAGE = "jobsyk/jobsy-orchestrator"
FRONTEND_IMAGE = "jobsyk/jobsy-frontend"


def _get_k8s_apps() -> client.AppsV1Api:
    config.load_incluster_config()
    return client.AppsV1Api()


def _get_running_digest(apps: client.AppsV1Api, deployment: str, container: str, namespace: str) -> str:
    """Получить image digest запущенного deployment из pod status."""
    try:
        dep = apps.read_namespaced_deployment(name=deployment, namespace=namespace)
        image = ""
        for c in dep.spec.template.spec.containers:
            if c.name == container:
                image = c.image or ""
                break
        # Если image содержит @sha256: — это digest
        if "@sha256:" in image:
            return image.split("@")[-1]
        # Иначе берём из pod statuses
        core = client.CoreV1Api()
        pods = core.list_namespaced_pod(
            namespace=namespace,
            label_selector=f"app={deployment}",
            limit=1,
        )
        for pod in pods.items:
            for cs in (pod.status.container_statuses or []):
                if cs.name == container and cs.image_id:
                    # imageID: docker-pullable://image@sha256:...
                    if "@" in cs.image_id:
                        return cs.image_id.split("@")[-1]
        return ""
    except ApiException:
        return ""


async def check_all() -> UpdateStatus:
    """Проверить обновления для всех трёх компонентов."""
    namespace = settings.k8s_namespace
    agent_image = settings.agent_image.split(":")[0]  # убрать :latest

    if settings.deployment_type == "k8s":
        apps = _get_k8s_apps()
        agent_digest = _get_running_digest(apps, "agent-3", "agent", namespace)
        orch_digest = _get_running_digest(apps, "orchestrator", "orchestrator", namespace)
        front_digest = _get_running_digest(apps, "frontend", "frontend", namespace)
    else:
        agent_digest = ""
        orch_digest = ""
        front_digest = ""

    agent_info = await checker.check(agent_image, agent_digest)
    orch_info = await checker.check(ORCHESTRATOR_IMAGE, orch_digest)
    front_info = await checker.check(FRONTEND_IMAGE, front_digest)

    return UpdateStatus(agent=agent_info, orchestrator=orch_info, frontend=front_info)


async def update_agents(db: AsyncSession) -> list[str]:
    """Обновить образ всех running агентов (rolling restart)."""
    if settings.deployment_type != "k8s":
        return ["Update agents поддерживается только в K8s"]

    apps = _get_k8s_apps()
    namespace = settings.k8s_namespace
    image = settings.agent_image

    result = await db.execute(
        select(Agent).where(Agent.status == AgentStatus.RUNNING)
    )
    agents = result.scalars().all()

    updated: list[str] = []
    for agent in agents:
        dep_name = f"agent-{agent.id}"
        try:
            # Patch container image
            apps.patch_namespaced_deployment(
                name=dep_name,
                namespace=namespace,
                body={
                    "spec": {
                        "template": {
                            "spec": {
                                "containers": [{"name": "agent", "image": image}]
                            }
                        }
                    }
                },
            )
            # Trigger rollout by patching annotation
            import datetime
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
                            }
                        }
                    }
                },
            )
            updated.append(f"{dep_name} ({agent.name})")
            logger.info("Updated agent %s image to %s", dep_name, image)
        except ApiException as e:
            logger.error("Failed to update %s: %s", dep_name, e.reason)

    return updated


async def update_platform() -> list[str]:
    """Обновить orchestrator + frontend deployments."""
    if settings.deployment_type != "k8s":
        return ["Update platform поддерживается только в K8s"]

    apps = _get_k8s_apps()
    namespace = settings.k8s_namespace
    import datetime
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
                            "spec": {
                                "containers": [{"name": container, "image": image}]
                            },
                            "metadata": {"annotations": restart_annotation},
                        }
                    }
                },
            )
            updated.append(dep_name)
            logger.info("Updated %s to %s", dep_name, image)
        except ApiException as e:
            logger.error("Failed to update %s: %s", dep_name, e.reason)

    return updated
