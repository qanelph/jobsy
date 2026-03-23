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
