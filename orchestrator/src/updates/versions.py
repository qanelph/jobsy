"""Получение списка версий из Docker Hub тегов + GitHub PR info."""

import logging

import httpx

from .schemas import VersionEntry

logger = logging.getLogger(__name__)

# GitHub repos для каждого компонента
REPOS = {
    "jobsy": "qanelph/jobsy",
    "jobs": "qanelph/jobs",
}


async def _fetch_tags(image: str, limit: int = 20) -> list[dict]:
    """Получить теги из Docker Hub, отсортированные по дате."""
    parts = image.split("/", 1)
    if len(parts) == 1:
        namespace, repo = "library", parts[0]
    else:
        namespace, repo = parts[0], parts[1]

    url = f"https://hub.docker.com/v2/repositories/{namespace}/{repo}/tags"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={"page_size": limit, "ordering": "last_updated"})
            if resp.status_code != 200:
                return []
            return resp.json().get("results", [])
    except Exception as e:
        logger.warning("Failed to fetch tags for %s: %s", image, e)
        return []


async def _fetch_pr_for_commit(repo: str, sha: str) -> dict | None:
    """Найти merged PR для коммита через GitHub API."""
    url = f"https://api.github.com/repos/{repo}/commits/{sha}/pulls"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={
                "Accept": "application/vnd.github+json",
            })
            if resp.status_code != 200:
                return None
            pulls = resp.json()
            # Берём первый merged PR
            for pr in pulls:
                if pr.get("merged_at"):
                    return pr
            return pulls[0] if pulls else None
    except Exception:
        return None


async def get_versions(component: str, current_digest: str) -> list[VersionEntry]:
    """Список доступных версий для компонента (jobsy или jobs)."""
    if component == "jobsy":
        image = "jobsyk/jobsy-orchestrator"
    elif component == "jobs":
        image = "jobsyk/jobs-agent"
    else:
        return []

    repo = REPOS.get(component, "")
    tags = await _fetch_tags(image)

    # Фильтруем только sha-* теги
    sha_tags = []
    for tag in tags:
        name = tag.get("name", "")
        if name.startswith("sha-"):
            digest = ""
            images = tag.get("images", [])
            if images:
                digest = images[0].get("digest", "")
            sha_tags.append({
                "sha": name[4:],  # убираем "sha-"
                "tag": name,
                "digest": digest,
                "updated": tag.get("last_updated", ""),
            })

    # Для каждого тега получаем PR info
    versions: list[VersionEntry] = []
    for t in sha_tags[:10]:  # макс 10 версий
        pr = await _fetch_pr_for_commit(repo, t["sha"]) if repo else None
        versions.append(VersionEntry(
            sha=t["sha"][:7],
            tag=t["tag"],
            pr_title=pr.get("title", t["sha"][:7]) if pr else t["sha"][:7],
            pr_body=pr.get("body", "") if pr else "",
            merged_at=pr.get("merged_at", t["updated"]) if pr else t["updated"],
            is_current=t["digest"] == current_digest,
        ))

    return versions
