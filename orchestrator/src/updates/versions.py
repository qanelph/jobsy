"""Получение списка версий из Docker Hub тегов + GitHub PR info."""

import logging
import os

import httpx

from .schemas import VersionEntry

logger = logging.getLogger(__name__)

def _github_headers() -> dict[str, str]:
    """Headers для GitHub API. Если есть GITHUB_TOKEN — используем для обхода rate limit."""
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

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


async def _fetch_merged_prs(repo: str, limit: int = 20) -> list[dict]:
    """Получить последние merged PRs одним запросом (вместо N запросов по коммитам)."""
    url = f"https://api.github.com/repos/{repo}/pulls"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=_github_headers(), params={
                "state": "closed",
                "sort": "updated",
                "direction": "desc",
                "per_page": limit,
            })
            if resp.status_code != 200:
                logger.warning("GitHub PRs API %s: %s", url, resp.status_code)
                return []
            return [pr for pr in resp.json() if pr.get("merged_at")]
    except Exception as e:
        logger.warning("Failed to fetch PRs for %s: %s", repo, e)
        return []


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

    # Fetch PRs in one request, build sha→PR lookup
    prs = await _fetch_merged_prs(repo) if repo else []
    pr_by_sha: dict[str, dict] = {}
    for pr in prs:
        merge_sha = pr.get("merge_commit_sha", "")
        if merge_sha:
            pr_by_sha[merge_sha[:7]] = pr

    versions: list[VersionEntry] = []
    for t in sha_tags[:10]:
        short_sha = t["sha"][:7]
        pr = pr_by_sha.get(short_sha)
        versions.append(VersionEntry(
            sha=short_sha,
            tag=t["tag"],
            pr_title=pr.get("title", "") if pr else "",
            pr_body=pr.get("body", "") if pr else "",
            merged_at=pr.get("merged_at", t["updated"]) if pr else t["updated"],
            is_current=short_sha == current_sha,
            pr_url=pr.get("html_url", "") if pr else "",
        ))

    return versions
