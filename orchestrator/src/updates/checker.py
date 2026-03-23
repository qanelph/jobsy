"""Docker Hub digest checker — сравнение текущего и latest образов."""

import logging
import time
from dataclasses import dataclass, field

import httpx

from .schemas import ImageUpdateInfo

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 минут


@dataclass
class _CacheEntry:
    info: ImageUpdateInfo
    ts: float


@dataclass
class DockerHubChecker:
    """Проверяет наличие обновлений по digest из Docker Hub Registry API."""

    _cache: dict[str, _CacheEntry] = field(default_factory=dict, init=False)

    async def check(self, image: str, current_digest: str) -> ImageUpdateInfo:
        """Сравнить current_digest с latest на Docker Hub. Кеширует на 5 мин."""
        now = time.monotonic()
        cached = self._cache.get(image)
        if cached and now - cached.ts < CACHE_TTL:
            return cached.info

        latest_digest = await self._fetch_latest_digest(image)
        has_update = bool(latest_digest and current_digest and latest_digest != current_digest)

        info = ImageUpdateInfo(
            image=image,
            current_digest=current_digest or "",
            latest_digest=latest_digest or "",
            has_update=has_update,
        )
        self._cache[image] = _CacheEntry(info=info, ts=now)
        return info

    @staticmethod
    async def _fetch_latest_digest(image: str) -> str:
        """Получить digest latest тега из Docker Hub."""
        # Docker Hub API v2: /repositories/{namespace}/{repo}/tags/{tag}
        parts = image.split("/", 1)
        if len(parts) == 1:
            namespace, repo = "library", parts[0]
        else:
            namespace, repo = parts[0], parts[1]

        url = f"https://hub.docker.com/v2/repositories/{namespace}/{repo}/tags/latest"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                if resp.status_code != 200:
                    logger.warning("Docker Hub API %s: %s", url, resp.status_code)
                    return ""
                data = resp.json()
                # digest из первого image в images[]
                images = data.get("images", [])
                if images:
                    return images[0].get("digest", "")
                return data.get("digest", "")
        except Exception as e:
            logger.warning("Docker Hub check failed for %s: %s", image, e)
            return ""


checker = DockerHubChecker()
