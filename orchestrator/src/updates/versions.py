"""Получение списка версий из Docker Hub тегов + GitHub PR info."""

import logging

import httpx

from .schemas import VersionEntry

logger = logging.getLogger(__name__)

REPOS = {
    "jobsy": "qanelph/jobsy",
    "jobs": "qanelph/jobs",
    "browser": "qanelph/jobs",
}


async def _fetch_tags(image: str, limit: int = 20) -> list[dict]:
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
    url = f"https://api.github.com/repos/{repo}/commits/{sha}/pulls"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={
                "Accept": "application/vnd.github+json",
            })
            if resp.status_code != 200:
                return None
            pulls = resp.json()
            for pr in pulls:
                if pr.get("merged_at"):
                    return pr
            return pulls[0] if pulls else None
    except Exception:
        return None


async def get_versions(component: str, current_sha: str) -> list[VersionEntry]:
    """Список доступных версий. current_sha — 7-символьный commit sha."""
    if component == "jobsy":
        image = "jobsyk/jobsy-orchestrator"
    elif component == "jobs":
        image = "jobsyk/jobs-agent"
    elif component == "browser":
        image = "jobsyk/jobs-browser"
    else:
        return []

    repo = REPOS.get(component, "")
    tags = await _fetch_tags(image)

    sha_tags = []
    for tag in tags:
        name = tag.get("name", "")
        if name.startswith("sha-"):
            sha_tags.append({
                "sha": name[4:],
                "tag": name,
                "updated": tag.get("last_updated", ""),
            })

    versions: list[VersionEntry] = []
    for t in sha_tags[:10]:
        short_sha = t["sha"][:7]
        pr = await _fetch_pr_for_commit(repo, t["sha"]) if repo else None
        versions.append(VersionEntry(
            sha=short_sha,
            tag=t["tag"],
            pr_title=pr.get("title", short_sha) if pr else short_sha,
            pr_body=pr.get("body", "") if pr else "",
            merged_at=pr.get("merged_at", t["updated"]) if pr else t["updated"],
            is_current=short_sha == current_sha,
        ))

    return versions
