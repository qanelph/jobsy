export interface ClaudeAuthStatus {
  configured: boolean
  auth_mode: 'oauth' | 'api_key' | null
  account_email: string | null
  organization_name: string | null
  expires_at: number | null
  is_expired: boolean
}

export interface OAuthStartResponse {
  authorize_url: string
  state: string
}

export interface UsageWindow {
  utilization: number   // 0..100
  resets_at: string     // ISO 8601
}

export interface ExtraUsage {
  is_enabled: boolean
  // Anthropic присылает null когда extra-usage не подключён.
  used_credits: number | null  // USD
  monthly_limit: number | null // USD
}

export interface ClaudeUsage {
  five_hour: UsageWindow | null
  seven_day: UsageWindow | null
  seven_day_opus: UsageWindow | null
  seven_day_sonnet: UsageWindow | null
  extra_usage: ExtraUsage | null
}

