export interface PlatformSettings {
  access_token_expire_minutes: number
  refresh_token_expire_days: number
  telegram_bot_token: string
  agent_image: string
  browser_image: string
  openai_api_key: string
  http_proxy: string
  timezone: string
  tg_api_id: number
  tg_api_hash: string
  use_kubernetes: boolean
  k8s_namespace: string
  agent_port_start: number
  agent_port_end: number
}

export type PlatformSettingsUpdate = Partial<PlatformSettings>
