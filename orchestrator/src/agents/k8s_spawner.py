import json
import logging
from typing import Optional

from kubernetes import client, config
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Agent, AgentStatus, GlobalConfig
from ..claude_auth.manager import ClaudeAuthManager
from ..config import settings

logger = logging.getLogger(__name__)

AGENT_LABEL = "jobsy-agent"


class K8sSpawner:
    """Создание и управление Kubernetes deployments агентов."""

    def __init__(self) -> None:
        config.load_incluster_config()
        self.apps_v1 = client.AppsV1Api()
        self.core_v1 = client.CoreV1Api()
        self.namespace = settings.k8s_namespace
        self.auth_manager = ClaudeAuthManager()

    def _deployment_name(self, agent: Agent) -> str:
        return f"agent-{agent.id}"

    def _service_name(self, agent: Agent) -> str:
        return f"agent-{agent.id}-svc"

    def _pvc_name(self, agent: Agent) -> str:
        return f"agent-{agent.id}-data"

    def _labels(self, agent: Agent) -> dict[str, str]:
        return {
            "app": AGENT_LABEL,
            "agent-id": str(agent.id),
            "agent-name": agent.name,
        }

    def _build_containers(
        self,
        agent: Agent,
        extra_env: dict[str, str],
        api_key: Optional[str],
    ) -> list[client.V1Container]:
        # Базовые env vars (как в Docker spawner)
        environment: dict[str, str] = {
            "TG_USER_ID": str(agent.telegram_user_id),
            "OPENAI_API_KEY": settings.openai_api_key,
            "HTTP_PROXY": settings.http_proxy,
            "TZ": settings.timezone,
            "JWT_SECRET_KEY": settings.jwt_secret_key,
            "ORCHESTRATOR_URL": "http://orchestrator-service",
            "SKIP_SETUP": "1",
            "WORKSPACE_DIR": "/data/workspace",
        }

        if agent.browser_enabled:
            environment["BROWSER_CDP_URL"] = "http://localhost:9223"

        # Per-agent + global overrides
        environment.update(extra_env)

        if agent.telegram_bot_token:
            environment["TG_BOT_TOKEN"] = agent.telegram_bot_token

        if settings.tg_api_id and settings.tg_api_hash:
            environment["TG_API_ID"] = str(settings.tg_api_id)
            environment["TG_API_HASH"] = settings.tg_api_hash

        if api_key:
            environment["ANTHROPIC_API_KEY"] = api_key

        if agent.custom_instructions:
            environment["CUSTOM_INSTRUCTIONS"] = agent.custom_instructions

        env = [client.V1EnvVar(name=k, value=v) for k, v in environment.items()]

        volume_mounts: list[client.V1VolumeMount] = [
            client.V1VolumeMount(name="agent-data", mount_path="/data"),
        ]

        containers = [
            client.V1Container(
                name="agent",
                image=settings.agent_image,
                ports=[client.V1ContainerPort(container_port=8080)],
                env=env,
                volume_mounts=volume_mounts or None,
                resources=client.V1ResourceRequirements(
                    requests={"cpu": "50m", "memory": "128Mi"},
                    limits={"cpu": "1", "memory": "2Gi"},
                ),
            )
        ]

        if agent.browser_enabled:
            browser_env = []
            if settings.http_proxy:
                browser_env.append(client.V1EnvVar(name="HTTP_PROXY", value=settings.http_proxy))
            containers.append(
                client.V1Container(
                    name="browser",
                    image=settings.browser_image,
                    env=browser_env or None,
                    resources=client.V1ResourceRequirements(
                        requests={"cpu": "100m", "memory": "256Mi"},
                        limits={"cpu": "500m", "memory": "1Gi"},
                    ),
                )
            )

        return containers

    async def spawn(self, agent: Agent, db: AsyncSession) -> None:
        """Создать Deployment + Service для агента."""
        global_api_key, credentials_json = await self.auth_manager.get_agent_credentials(db)
        agent_api_key = global_api_key or agent.claude_api_key

        if not agent_api_key and not credentials_json:
            raise ValueError(
                "Не настроена авторизация Claude: нет ни OAuth, ни глобального API key, ни per-agent ключа"
            )

        global_config = await db.get(GlobalConfig, 1)
        global_env: dict[str, str] = json.loads(global_config.env_vars or "{}") if global_config else {}
        local_env: dict[str, str] = json.loads(agent.env_vars or "{}")
        extra_env = {**global_env, **local_env}

        labels = self._labels(agent)

        # PVC для /data (MCP конфиг, SQLite, Telethon session)
        pvc_name = self._pvc_name(agent)
        pvc = client.V1PersistentVolumeClaim(
            metadata=client.V1ObjectMeta(name=pvc_name, labels=labels),
            spec=client.V1PersistentVolumeClaimSpec(
                access_modes=["ReadWriteOnce"],
                resources=client.V1ResourceRequirements(
                    requests={"storage": "1Gi"},
                ),
            ),
        )
        try:
            self.core_v1.read_namespaced_persistent_volume_claim(
                name=pvc_name, namespace=self.namespace
            )
        except client.exceptions.ApiException as e:
            if e.status == 404:
                self.core_v1.create_namespaced_persistent_volume_claim(
                    namespace=self.namespace, body=pvc
                )
            else:
                raise

        containers = self._build_containers(agent, extra_env, agent_api_key)

        # Volumes
        volumes: list[client.V1Volume] = [
            client.V1Volume(
                name="agent-data",
                persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                    claim_name=pvc_name,
                ),
            ),
        ]
        # initContainer: chown /data для non-root user jobs (uid=1000)
        init_containers = [
            client.V1Container(
                name="fix-permissions",
                image="busybox:1.36",
                command=["sh", "-c", "chown -R 1000:1000 /data"],
                volume_mounts=[
                    client.V1VolumeMount(name="agent-data", mount_path="/data"),
                ],
            ),
        ]

        deployment = client.V1Deployment(
            metadata=client.V1ObjectMeta(name=self._deployment_name(agent), labels=labels),
            spec=client.V1DeploymentSpec(
                replicas=1,
                selector=client.V1LabelSelector(match_labels={"agent-id": str(agent.id)}),
                template=client.V1PodTemplateSpec(
                    metadata=client.V1ObjectMeta(labels=labels),
                    spec=client.V1PodSpec(
                        init_containers=init_containers,
                        containers=containers,
                        volumes=volumes or None,
                    ),
                ),
            ),
        )

        service = client.V1Service(
            metadata=client.V1ObjectMeta(name=self._service_name(agent), labels=labels),
            spec=client.V1ServiceSpec(
                selector={"agent-id": str(agent.id)},
                ports=[client.V1ServicePort(port=8080, target_port=8080)],
                type="ClusterIP",
            ),
        )

        self.apps_v1.create_namespaced_deployment(namespace=self.namespace, body=deployment)
        self.core_v1.create_namespaced_service(namespace=self.namespace, body=service)

        agent.container_id = self._deployment_name(agent)
        agent.status = AgentStatus.RUNNING
        await db.commit()
        logger.info("K8s agent %s spawned (deployment=%s)", agent.id, agent.container_id)

    async def stop(self, agent: Agent) -> None:
        """Остановить агента — scale to 0."""
        name = self._deployment_name(agent)
        self.apps_v1.patch_namespaced_deployment_scale(
            name=name,
            namespace=self.namespace,
            body={"spec": {"replicas": 0}},
        )
        agent.status = AgentStatus.STOPPED
        logger.info("K8s agent %s stopped", agent.id)

    async def start(self, agent: Agent) -> None:
        """Запустить агента — scale to 1."""
        name = self._deployment_name(agent)
        self.apps_v1.patch_namespaced_deployment_scale(
            name=name,
            namespace=self.namespace,
            body={"spec": {"replicas": 1}},
        )
        agent.status = AgentStatus.RUNNING
        logger.info("K8s agent %s started", agent.id)

    async def respawn(self, agent: Agent, db: AsyncSession) -> None:
        """Пересоздать агента."""
        await self.remove(agent)
        agent.status = AgentStatus.CREATING
        await db.commit()
        await self.spawn(agent, db)

    async def remove(self, agent: Agent, delete_data: bool = False) -> None:
        """Удалить Deployment + Service. PVC сохраняется всегда (ручное удаление через kubectl)."""
        dep_name = self._deployment_name(agent)
        svc_name = self._service_name(agent)

        for delete_fn, name in [
            (self.apps_v1.delete_namespaced_deployment, dep_name),
            (self.core_v1.delete_namespaced_service, svc_name),
        ]:
            try:
                delete_fn(name=name, namespace=self.namespace)
            except client.exceptions.ApiException as e:
                if e.status != 404:
                    raise

        agent.status = AgentStatus.DELETED
        agent.container_id = None
        agent.browser_container_id = None
        agent.port = None
        logger.info("K8s agent %s removed", agent.id)

    async def check_status(self, agent: Agent) -> Optional[str]:
        """Проверить статус deployment."""
        name = self._deployment_name(agent)
        try:
            dep = self.apps_v1.read_namespaced_deployment(name=name, namespace=self.namespace)
            if dep.status.available_replicas and dep.status.available_replicas > 0:
                return "running"
            return "creating"
        except client.exceptions.ApiException as e:
            if e.status == 404:
                return None
            raise
