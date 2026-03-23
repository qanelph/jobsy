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


async def _fetch_commits(repo: str, limit: int = 20) -> list[dict]:
    """Получить последние коммиты main ветки. Работает без auth для public repos."""
    url = f"https://api.github.com/repos/{repo}/commits"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=_github_headers(), params={
                "per_page": limit,
            })
            if resp.status_code != 200:
                logger.warning("GitHub commits API %s: %s", url, resp.status_code)
                return []
            return resp.json()
    except Exception as e:
        logger.warning("Failed to fetch commits for %s: %s", repo, e)
        return []


def _extract_title_from_commit(message: str) -> str:
    """Извлекает чистый тайтл из commit message (первая строка, без (#N) суффикса)."""
    first_line = message.split("\n")[0].strip()
    # Remove PR number suffix like " (#21)"
    import re
    first_line = re.sub(r'\s*\(#\d+\)\s*$', '', first_line)
    return first_line


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

    # Fetch commits (works without auth for public repos), build sha→commit lookup
    commits = await _fetch_commits(repo) if repo else []
    commit_by_sha: dict[str, dict] = {}
    for c in commits:
        sha7 = c.get("sha", "")[:7]
        if sha7:
            commit_by_sha[sha7] = c

    versions: list[VersionEntry] = []
    for t in sha_tags[:10]:
        short_sha = t["sha"][:7]
        commit = commit_by_sha.get(short_sha)
        message = commit["commit"]["message"] if commit else ""
        title = _extract_title_from_commit(message) if message else ""
        html_url = commit.get("html_url", "") if commit else ""

        versions.append(VersionEntry(
            sha=short_sha,
            tag=t["tag"],
            pr_title=title,
            pr_body="",
            merged_at=t["updated"],
            is_current=short_sha == current_sha,
            pr_url=html_url,
        ))

    return versions
