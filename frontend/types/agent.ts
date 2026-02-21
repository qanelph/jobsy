export type AgentStatus = 'idle' | 'active' | 'error' | 'stopped'

export interface Agent {
  id: string
  telegram_user_id: number
  username: string
  first_name: string | null
  last_name: string | null
  status: AgentStatus
  config: AgentConfig
  created_at: string
  last_active_at: string | null
}

export interface AgentConfig {
  model?: string
  temperature?: number
  max_tokens?: number
  system_prompt?: string
  tools?: string[]
}

export interface CreateAgentRequest {
  telegram_user_id: number
  username: string
  first_name?: string
  last_name?: string
  config?: AgentConfig
}

export interface UpdateAgentRequest {
  status?: AgentStatus
  config?: AgentConfig
}
