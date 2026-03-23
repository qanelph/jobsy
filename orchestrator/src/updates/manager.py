"""Менеджер обновлений — проверка Docker Hub + rolling update K8s deployments.

Версия определяется через аннотацию `jobsy/commit-sha` в deployment.
При обновлении записываем sha latest тега из Docker Hub.
"""

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
from .schemas import UpdateStatus

logger = logging.getLogger(__name__)

AGENT_IMAGE = "jobsyk/jobs-agent"
BROWSER_IMAGE = "jobsyk/jobs-browser"
ORCHESTRATOR_IMAGE = "jobsyk/jobsy-orchestrator"
FRONTEND_IMAGE = "jobsyk/jobsy-frontend"

ANNOTATION_SHA = "jobsy/commit-sha"
ANNOTATION_BROWSER_SHA = "jobsy/browser-sha"


def _init_k8s() -> None:
    config.load_incluster_config()


def _get_deployment_sha(apps: client.AppsV1Api, name: str, namespace: str) -> str:
    """Получить commit sha из аннотации deployment."""
    try:
        dep = apps.read_namespaced_deployment(name=name, namespace=namespace)
        annotations = dep.spec.template.metadata.annotations or {}
        return annotations.get(ANNOTATION_SHA, "")
    except ApiException as e:
        logger.warning("K8s API error reading %s: %s", name, e.reason)
        return ""


def _get_any_agent_annotations(apps: client.AppsV1Api, namespace: str, keys: list[str]) -> dict[str, str]:
    """Получить несколько аннотаций из любого agent deployment за один запрос."""
    try:
        deps = apps.list_namespaced_deployment(
            namespace=namespace,
            label_selector=f"app={AGENT_LABEL}",
            limit=1,
        )
        for dep in deps.items:
            annotations = dep.spec.template.metadata.annotations or {}
            return {k: annotations.get(k, "") for k in keys}
        return {k: "" for k in keys}
    except ApiException as e:
        logger.warning("K8s API error listing agent deployments: %s", e.reason)
        return {k: "" for k in keys}


async def _get_latest_sha(image: str) -> str:
    """Найти commit sha из sha-* тега, совпадающего с latest на Docker Hub."""
    tags = await checker._fetch_tags(image)
    latest_digest = ""
    for tag in tags:
        if tag["name"] == "latest":
            latest_digest = tag["digest"]
            break
    for tag in tags:
        if tag["name"].startswith("sha-") and tag["digest"] == latest_digest:
            return tag["name"][4:11]
    return ""


async def check_all() -> UpdateStatus:
    """Проверить обновления для всех компонентов."""
    namespace = settings.k8s_namespace

    if settings.deployment_type == "k8s":
        def _fetch_shas() -> tuple[str, str, str, str]:
            _init_k8s()
            apps = client.AppsV1Api()
            agent_annots = _get_any_agent_annotations(
                apps, namespace, [ANNOTATION_SHA, ANNOTATION_BROWSER_SHA]
            )
            return (
                agent_annots[ANNOTATION_SHA],
                agent_annots[ANNOTATION_BROWSER_SHA],
                _get_deployment_sha(apps, "orchestrator", namespace),
                _get_deployment_sha(apps, "frontend", namespace),
            )

        agent_sha, browser_sha, orch_sha, front_sha = await asyncio.to_thread(_fetch_shas)
    else:
        agent_sha = browser_sha = orch_sha = front_sha = ""

    agent_info, browser_info, orch_info, front_info = await asyncio.gather(
        checker.check(AGENT_IMAGE, agent_sha),
        checker.check(BROWSER_IMAGE, browser_sha),
        checker.check(ORCHESTRATOR_IMAGE, orch_sha),
        checker.check(FRONTEND_IMAGE, front_sha),
    )

    return UpdateStatus(
        agent=agent_info,
        browser=browser_info,
        orchestrator=orch_info,
        frontend=front_info,
    )


async def update_agents(db: AsyncSession) -> list[str]:
    """Обновить agent + browser образы всех running агентов (rolling restart)."""
    if settings.deployment_type != "k8s":
        return ["Update agents поддерживается только в K8s"]

    namespace = settings.k8s_namespace
    agent_image = f"{AGENT_IMAGE}:latest"
    browser_image = f"{BROWSER_IMAGE}:latest"

    agent_sha, browser_sha = await asyncio.gather(
        _get_latest_sha(AGENT_IMAGE),
        _get_latest_sha(BROWSER_IMAGE),
    )

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
                                        "jobsy/restart-at": datetime.datetime.utcnow().isoformat(),
                                        ANNOTATION_SHA: agent_sha,
                                        ANNOTATION_BROWSER_SHA: browser_sha,
                                    }
                                },
                                "spec": {
                                    "containers": [
                                        {"name": "agent", "image": agent_image, "imagePullPolicy": "Always"},
                                        {"name": "browser", "image": browser_image, "imagePullPolicy": "Always"},
                                    ]
                                },
                            }
                        }
                    },
                )
                updated.append(f"{dep_name} ({agent.name})")
                logger.info("Updated %s: agent=%s browser=%s", dep_name, agent_sha, browser_sha)
            except ApiException as e:
                logger.error("Failed to update %s: %s", dep_name, e.reason)
        return updated

    return await asyncio.to_thread(_do_update)


async def update_platform() -> list[str]:
    """Обновить orchestrator + frontend deployments."""
    if settings.deployment_type != "k8s":
        return ["Update platform поддерживается только в K8s"]

    namespace = settings.k8s_namespace

    shas: dict[str, str] = {}
    for name, image in [("orchestrator", ORCHESTRATOR_IMAGE), ("frontend", FRONTEND_IMAGE)]:
        shas[name] = await _get_latest_sha(image)

    def _do_update() -> list[str]:
        _init_k8s()
        apps = client.AppsV1Api()
        updated: list[str] = []
        for dep_name, container, image in [
            ("frontend", "frontend", f"{FRONTEND_IMAGE}:latest"),
            ("orchestrator", "orchestrator", f"{ORCHESTRATOR_IMAGE}:latest"),
        ]:
            sha = shas.get(dep_name, "")
            try:
                apps.patch_namespaced_deployment(
                    name=dep_name,
                    namespace=namespace,
                    body={
                        "spec": {
                            "template": {
                                "metadata": {
                                    "annotations": {
                                        "jobsy/restart-at": datetime.datetime.utcnow().isoformat(),
                                        ANNOTATION_SHA: sha,
                                    }
                                },
                                "spec": {
                                    "containers": [{"name": container, "image": image, "imagePullPolicy": "Always"}]
                                },
                            }
                        }
                    },
                )
                updated.append(dep_name)
                logger.info("Updated %s to %s (%s)", dep_name, image, sha)
            except ApiException as e:
                logger.error("Failed to update %s: %s", dep_name, e.reason)
        return updated

    return await asyncio.to_thread(_do_update)
