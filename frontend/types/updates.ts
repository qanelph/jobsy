export interface ImageUpdateInfo {
  image: string
  current_digest: string
  latest_digest: string
  has_update: boolean
  last_checked: string
}

export interface UpdateStatus {
  agent: ImageUpdateInfo
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
