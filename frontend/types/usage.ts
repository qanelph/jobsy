export type UsagePeriod = '24h' | '7d' | '30d'

export interface UsageSnapshot {
  taken_at: string
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  total_cost_usd: number | null
  events_count: number
}

export interface AgentUsageResponse {
  agent_id: number
  period: UsagePeriod
  snapshots: UsageSnapshot[]
}

export interface UsageSummaryBucket {
  agent_id: number
  name: string
  snapshots: UsageSnapshot[]
}

export interface UsageSummaryResponse {
  period: UsagePeriod
  agents: UsageSummaryBucket[]
}
