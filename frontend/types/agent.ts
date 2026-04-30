export type AgentStatus = 'creating' | 'running' | 'stopping' | 'stopped' | 'error' | 'deleted'

export interface Agent {
  id: number
  name: string
  telegram_user_id: number
  status: AgentStatus
  container_id: string | null
  port: number | null
  custom_instructions: string | null
  telegram_bot_token: string | null
  browser_enabled: boolean
  env_vars: Record<string, string> | null
  total_sessions: number
  active_sessions: number
  is_active: boolean
  created_at: string
  updated_at: string
  last_heartbeat: string | null
}

export interface CreateAgentRequest {
  name: string
  telegram_user_id: number
  custom_instructions?: string
  telegram_bot_token?: string
  claude_api_key?: string
  browser_enabled?: boolean
  env_vars?: Record<string, string>
}

export interface UpdateAgentRequest {
  name?: string
  custom_instructions?: string
  telegram_bot_token?: string
  claude_api_key?: string
  is_active?: boolean
  browser_enabled?: boolean
  env_vars?: Record<string, string>
}

export interface AgentConfigField {
  value: string | number | boolean | string[] | null
  mutable: boolean
  type?: string // "str" | "int" | "bool" | "secret" | "path" | "list[int]" | ...
}

export type AgentConfig = Record<string, AgentConfigField>

// Telethon auth

export type TelethonAuthPhase = 'idle' | 'qr_pending' | 'success' | 'error' | 'expired'

export interface TelethonAuthStatus {
  phase: TelethonAuthPhase
  qr_url: string | null
  error: string | null
  phone: string | null
  username: string | null
  first_name: string | null
}

export interface TelethonSessionInfo {
  has_session: boolean
  phone: string | null
  username: string | null
  first_name: string | null
}
