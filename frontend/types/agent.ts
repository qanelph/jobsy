export type AgentStatus = 'creating' | 'running' | 'stopped' | 'error' | 'deleted'

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
  value: string | number | string[] | null
  mutable: boolean
  type?: string // "str" | "int" | "secret" | "path" | "list[int]" | ...
}

export type AgentConfig = Record<string, AgentConfigField>
