import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { authStorage } from './auth'
import type { Agent, AgentConfig, CreateAgentRequest, UpdateAgentRequest, TelethonAuthStatus, TelethonSessionInfo } from '@/types/agent'
import type { AuthResponse, TelegramUser } from '@/types/auth'
import type { ClaudeAuthStatus, OAuthStartResponse } from '@/types/claude-auth'
import type { PlatformSettings, PlatformSettingsUpdate } from '@/types/settings'

const API_URL = '/api'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.client.interceptors.request.use(
      (config) => {
        const token = authStorage.getToken()
        if (token && !authStorage.isTokenExpired(token)) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          authStorage.removeToken()
          if (typeof window !== 'undefined') {
            window.location.href = '/auth/login'
          }
        }
        return Promise.reject(error)
      }
    )
  }

  async auth(telegramUser: TelegramUser): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/telegram', telegramUser)
    return response.data
  }

  async getAgents(): Promise<Agent[]> {
    const response = await this.client.get<{ agents: Agent[]; total: number }>('/agents')
    return response.data.agents
  }

  async getAgent(id: number): Promise<Agent> {
    const response = await this.client.get<Agent>(`/agents/${id}`)
    return response.data
  }

  async createAgent(data: CreateAgentRequest): Promise<Agent> {
    const response = await this.client.post<Agent>('/agents', data)
    return response.data
  }

  async updateAgent(id: number, data: UpdateAgentRequest): Promise<Agent> {
    const response = await this.client.patch<Agent>(`/agents/${id}`, data)
    return response.data
  }

  async deleteAgent(id: number): Promise<void> {
    await this.client.delete(`/agents/${id}`)
  }

  async startAgent(id: number): Promise<Agent> {
    const response = await this.client.post<Agent>(`/agents/${id}/start`)
    return response.data
  }

  async stopAgent(id: number): Promise<Agent> {
    const response = await this.client.post<Agent>(`/agents/${id}/stop`)
    return response.data
  }

  async restartAgent(id: number): Promise<Agent> {
    const response = await this.client.post<Agent>(`/agents/${id}/restart`)
    return response.data
  }

  // Agent Settings (proxy to agent container)

  async getAgentSettings(id: number, unmask = false): Promise<AgentConfig> {
    const response = await this.client.get<AgentConfig>(`/agents/${id}/settings`, {
      params: unmask ? { unmask: true } : undefined,
    })
    return response.data
  }

  async patchAgentSettings(id: number, data: Record<string, unknown>): Promise<AgentConfig> {
    const response = await this.client.patch<AgentConfig>(`/agents/${id}/settings`, data)
    return response.data
  }

  // Global Config

  async getGlobalConfig(): Promise<{ env_vars: Record<string, string> }> {
    const response = await this.client.get<{ env_vars: Record<string, string> }>('/agents/config')
    return response.data
  }

  async updateGlobalConfig(env_vars: Record<string, string>): Promise<{ env_vars: Record<string, string> }> {
    const response = await this.client.patch<{ env_vars: Record<string, string> }>('/agents/config', { env_vars })
    return response.data
  }

  // Claude Auth

  async getClaudeAuthStatus(): Promise<ClaudeAuthStatus> {
    const response = await this.client.get<ClaudeAuthStatus>('/claude-auth/status')
    return response.data
  }

  async startClaudeOAuth(): Promise<OAuthStartResponse> {
    const response = await this.client.post<OAuthStartResponse>('/claude-auth/oauth/start')
    return response.data
  }

  async completeClaudeOAuth(code: string, state: string): Promise<ClaudeAuthStatus> {
    const response = await this.client.post<ClaudeAuthStatus>('/claude-auth/oauth/callback', { code, state })
    return response.data
  }

  async setClaudeApiKey(apiKey: string): Promise<ClaudeAuthStatus> {
    const response = await this.client.post<ClaudeAuthStatus>('/claude-auth/apikey', { api_key: apiKey })
    return response.data
  }

  async clearClaudeAuth(): Promise<void> {
    await this.client.delete('/claude-auth')
  }

  // Telethon Auth

  async startTelethonQr(agentId: number): Promise<{ qr_url: string; expires_in: number }> {
    const response = await this.client.post<{ qr_url: string; expires_in: number }>(`/agents/${agentId}/telethon/qr/start`)
    return response.data
  }

  async getTelethonQrStatus(agentId: number): Promise<TelethonAuthStatus> {
    const response = await this.client.get<TelethonAuthStatus>(`/agents/${agentId}/telethon/qr/status`)
    return response.data
  }

  async confirmTelethonQr(agentId: number): Promise<TelethonSessionInfo> {
    const response = await this.client.post<TelethonSessionInfo>(`/agents/${agentId}/telethon/qr/confirm`)
    return response.data
  }

  async getTelethonSession(agentId: number): Promise<TelethonSessionInfo> {
    const response = await this.client.get<TelethonSessionInfo>(`/agents/${agentId}/telethon/session`)
    return response.data
  }

  async deleteTelethonSession(agentId: number): Promise<TelethonSessionInfo> {
    const response = await this.client.delete<TelethonSessionInfo>(`/agents/${agentId}/telethon/session`)
    return response.data
  }

  // Platform Settings

  async getPlatformSettings(): Promise<PlatformSettings> {
    const response = await this.client.get<PlatformSettings>('/settings')
    return response.data
  }

  async updatePlatformSettings(data: PlatformSettingsUpdate): Promise<PlatformSettings> {
    const response = await this.client.patch<PlatformSettings>('/settings', data)
    return response.data
  }
}

export const apiClient = new ApiClient()
