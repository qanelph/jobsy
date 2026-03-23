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


def _split_image(image: str) -> tuple[str, str]:
    parts = image.split("/", 1)
    if len(parts) == 1:
        return "library", parts[0]
    return parts[0], parts[1]


@dataclass
class DockerHubChecker:
    """Проверяет наличие обновлений по digest из Docker Hub Registry API."""

    _cache: dict[str, _CacheEntry] = field(default_factory=dict, init=False)
    _tags_cache: dict[str, tuple[list[dict], float]] = field(default_factory=dict, init=False)

    async def check(self, image: str, current_digest: str) -> ImageUpdateInfo:
        """Сравнить current_digest с latest на Docker Hub. Кеширует на 5 мин."""
        now = time.monotonic()
        cached = self._cache.get(image)
        if cached and now - cached.ts < CACHE_TTL:
            return cached.info

        tags = await self._fetch_tags(image)

        # Найти latest digest
        latest_digest = ""
        latest_sha = ""
        for tag in tags:
            if tag["name"] == "latest":
                latest_digest = tag["digest"]
                break

        # Найти sha-* тег для latest digest
        for tag in tags:
            if tag["name"].startswith("sha-") and tag["digest"] == latest_digest:
                latest_sha = tag["name"][4:7]  # первые 7 символов коммита
                break

        # Найти sha-* тег для current digest
        current_sha = ""
        for tag in tags:
            if tag["name"].startswith("sha-") and tag["digest"] == current_digest:
                current_sha = tag["name"][4:11]  # первые 7 символов коммита
                break

        has_update = bool(latest_digest and current_digest and latest_digest != current_digest)

        info = ImageUpdateInfo(
            image=image,
            current_digest=current_digest or "",
            latest_digest=latest_digest or "",
            has_update=has_update,
            current_sha=current_sha,
            latest_sha=latest_sha,
        )
        self._cache[image] = _CacheEntry(info=info, ts=now)
        return info

    async def _fetch_tags(self, image: str, limit: int = 50) -> list[dict]:
        """Получить теги из Docker Hub с digest."""
        now = time.monotonic()
        cached = self._tags_cache.get(image)
        if cached and now - cached[1] < CACHE_TTL:
            return cached[0]

        namespace, repo = _split_image(image)
        url = f"https://hub.docker.com/v2/repositories/{namespace}/{repo}/tags"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, params={"page_size": limit, "ordering": "last_updated"})
                if resp.status_code != 200:
                    logger.warning("Docker Hub tags API %s: %s", url, resp.status_code)
                    return []
                results = resp.json().get("results", [])
                tags = []
                for t in results:
                    digest = ""
                    images = t.get("images", [])
                    if images:
                        digest = images[0].get("digest", "")
                    tags.append({"name": t["name"], "digest": digest})
                self._tags_cache[image] = (tags, now)
                return tags
        except Exception as e:
            logger.warning("Docker Hub tags fetch failed for %s: %s", image, e)
            return []


checker = DockerHubChecker()
