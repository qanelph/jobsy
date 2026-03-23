export interface ImageUpdateInfo {
  image: string
  current_digest: string
  latest_digest: string
  has_update: boolean
  current_sha: string
  latest_sha: string
  last_checked: string
}

export interface UpdateStatus {
  agent: ImageUpdateInfo
  browser: ImageUpdateInfo
  orchestrator: ImageUpdateInfo
  frontend: ImageUpdateInfo
}

export interface VersionEntry {
  sha: string
  tag: string
  pr_title: string
  pr_body: string
  merged_at: string
  is_current: boolean
}
