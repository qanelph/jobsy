import io
import json
import logging
import tarfile
from abc import ABC, abstractmethod
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

SESSION_PATH = "/data/telethon.session"
INFO_PATH = "/data/telethon_info.json"
VOLUME_PATTERN = "jobs-agent-{agent_id}-data"


class BaseSessionWriter(ABC):
    """Интерфейс для записи/проверки/удаления telethon session."""

    @abstractmethod
    def write_to_volume(
        self, agent_id: int, session_bytes: bytes, user_info: dict[str, Any] | None = None,
    ) -> bool: ...

    @abstractmethod
    def get_session_info(self, agent_id: int) -> dict[str, Any]: ...

    @abstractmethod
    def delete_session(self, agent_id: int) -> bool: ...


def _build_tar(filename: str, data: bytes) -> io.BytesIO:
    """Упаковать один файл в tar-архив для put_archive."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        info = tarfile.TarInfo(name=filename)
        info.size = len(data)
        info.uid = 1000
        info.gid = 1000
        tar.addfile(info, io.BytesIO(data))
    buf.seek(0)
    return buf


class DockerSessionWriter(BaseSessionWriter):
    """Docker: запись через put_archive / exec_run."""

    def __init__(self) -> None:
        from ..utils.docker_client import DockerClient
        self._docker: DockerClient | None = None

    @property
    def docker(self) -> "DockerClient":
        if self._docker is None:
            from ..utils.docker_client import DockerClient
            self._docker = DockerClient()
        return self._docker

    def write_to_volume(
        self, agent_id: int, session_bytes: bytes, user_info: dict[str, Any] | None = None,
    ) -> bool:
        container_name = f"jobs-agent-{agent_id}"
        container = self.docker.get_container(container_name)

        if container and container.status == "running":
            tar_buf = _build_tar("telethon.session", session_bytes)
            container.put_archive("/data", tar_buf)
            if user_info:
                info_buf = _build_tar("telethon_info.json", json.dumps(user_info).encode())
                container.put_archive("/data", info_buf)
            logger.info("Wrote telethon.session via put_archive to %s", container_name)
            return True

        volume_name = VOLUME_PATTERN.format(agent_id=agent_id)
        tar_buf = _build_tar("telethon.session", session_bytes)

        tmp = self.docker.client.containers.run(
            image="alpine:3.19",
            name=f"jobs-telethon-writer-{agent_id}",
            volumes={volume_name: {"bind": "/data", "mode": "rw"}},
            command="sleep 5",
            detach=True,
            remove=True,
        )
        tmp.put_archive("/data", tar_buf)
        if user_info:
            info_buf = _build_tar("telethon_info.json", json.dumps(user_info).encode())
            tmp.put_archive("/data", info_buf)
        tmp.stop()
        logger.info("Wrote telethon.session via temp container to volume %s", volume_name)
        return True

    def get_session_info(self, agent_id: int) -> dict[str, Any]:
        container_name = f"jobs-agent-{agent_id}"
        container = self.docker.get_container(container_name)
        if not container or container.status != "running":
            return {"has_session": False}
        exit_code, _ = container.exec_run(f"test -f {SESSION_PATH}")
        if exit_code != 0:
            return {"has_session": False}
        # Try to read info file
        exit_code, output = container.exec_run(f"cat {INFO_PATH}")
        info: dict[str, Any] = {"has_session": True}
        if exit_code == 0 and output:
            try:
                info.update(json.loads(output))
            except json.JSONDecodeError:
                pass
        return info

    def delete_session(self, agent_id: int) -> bool:
        container_name = f"jobs-agent-{agent_id}"
        container = self.docker.get_container(container_name)
        if not container or container.status != "running":
            return False
        container.exec_run(f"rm -f {SESSION_PATH} {INFO_PATH}")
        return True


class K8sSessionWriter(BaseSessionWriter):
    """K8s: запись через HTTP к agent (agent-{id}-svc:8080)."""

    def _agent_url(self, agent_id: int) -> str:
        return f"http://agent-{agent_id}-svc:8080"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {settings.jwt_secret_key}"}

    def _client(self, timeout: float = 10.0) -> httpx.Client:
        return httpx.Client(timeout=timeout, trust_env=False)

    def write_to_volume(
        self, agent_id: int, session_bytes: bytes, user_info: dict[str, Any] | None = None,
    ) -> bool:
        url = f"{self._agent_url(agent_id)}/session"
        session_string = session_bytes.decode("utf-8")
        payload: dict[str, Any] = {"session_string": session_string}
        if user_info:
            payload["info"] = user_info
        with self._client() as client:
            resp = client.post(url, json=payload, headers=self._headers())
        if resp.status_code == 200:
            logger.info("Pushed telethon session to agent-%d via HTTP", agent_id)
            return True
        logger.warning("Failed to push session to agent-%d: HTTP %d", agent_id, resp.status_code)
        return False

    def get_session_info(self, agent_id: int) -> dict[str, Any]:
        url = f"{self._agent_url(agent_id)}/session"
        with self._client(timeout=5.0) as client:
            resp = client.get(url)
        if resp.status_code == 200:
            return resp.json()
        return {"has_session": False}

    def delete_session(self, agent_id: int) -> bool:
        url = f"{self._agent_url(agent_id)}/session"
        with self._client(timeout=5.0) as client:
            resp = client.delete(url, headers=self._headers())
        return resp.status_code == 200


# Backward-compatible alias
SessionWriter = DockerSessionWriter


def create_session_writer() -> BaseSessionWriter:
    """Создать writer на основе deployment_type."""
    if settings.deployment_type == "k8s":
        return K8sSessionWriter()
    return DockerSessionWriter()
