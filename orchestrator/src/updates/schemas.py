from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ImageUpdateInfo:
    image: str
    current_digest: str
    latest_digest: str
    has_update: bool
    last_checked: datetime = field(default_factory=datetime.utcnow)


@dataclass
class UpdateStatus:
    agent: ImageUpdateInfo
    orchestrator: ImageUpdateInfo
    frontend: ImageUpdateInfo


@dataclass
class VersionEntry:
    sha: str
    tag: str
    pr_title: str
    pr_body: str
    merged_at: str
    is_current: bool
