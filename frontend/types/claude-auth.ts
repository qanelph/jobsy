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

