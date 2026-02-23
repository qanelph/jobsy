import { create } from 'zustand'
import { apiClient } from '@/lib/api'
import type { Agent, CreateAgentRequest, UpdateAgentRequest } from '@/types/agent'

interface AgentsState {
  agents: Agent[]
  loading: boolean
  error: string | null

  fetchAgents: () => Promise<void>
  getAgent: (id: number) => Promise<Agent | null>
  createAgent: (data: CreateAgentRequest) => Promise<Agent>
  updateAgent: (id: number, data: UpdateAgentRequest) => Promise<Agent>
  deleteAgent: (id: number) => Promise<void>
  startAgent: (id: number) => Promise<void>
  stopAgent: (id: number) => Promise<void>
  restartAgent: (id: number) => Promise<void>
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null })
    try {
      const agents = await apiClient.getAgents()
      set({ agents, loading: false })
    } catch {
      set({ loading: false, error: 'Не удалось загрузить агентов' })
    }
  },

  getAgent: async (id: number) => {
    const cached = get().agents.find(a => a.id === id)
    if (cached) return cached

    set({ loading: true, error: null })
    try {
      const agent = await apiClient.getAgent(id)
      set(state => ({
        agents: [...state.agents.filter(a => a.id !== id), agent],
        loading: false,
      }))
      return agent
    } catch {
      set({ loading: false, error: 'Не удалось загрузить агента' })
      return null
    }
  },

  createAgent: async (data: CreateAgentRequest) => {
    set({ loading: true, error: null })
    try {
      const agent = await apiClient.createAgent(data)
      set(state => ({
        agents: [...state.agents, agent],
        loading: false,
      }))
      return agent
    } catch {
      set({ loading: false, error: 'Не удалось создать агента' })
      throw new Error('Не удалось создать агента')
    }
  },

  updateAgent: async (id: number, data: UpdateAgentRequest) => {
    set({ loading: true, error: null })
    const agent = await apiClient.updateAgent(id, data)
    set(state => ({
      agents: state.agents.map(a => a.id === id ? agent : a),
      loading: false,
    }))
    return agent
  },

  deleteAgent: async (id: number) => {
    set({ loading: true, error: null })
    await apiClient.deleteAgent(id)
    set(state => ({
      agents: state.agents.filter(a => a.id !== id),
      loading: false,
    }))
  },

  startAgent: async (id: number) => {
    set({ loading: true, error: null })
    const agent = await apiClient.startAgent(id)
    set(state => ({
      agents: state.agents.map(a => a.id === id ? agent : a),
      loading: false,
    }))
  },

  stopAgent: async (id: number) => {
    set({ loading: true, error: null })
    const agent = await apiClient.stopAgent(id)
    set(state => ({
      agents: state.agents.map(a => a.id === id ? agent : a),
      loading: false,
    }))
  },

  restartAgent: async (id: number) => {
    set({ loading: true, error: null })
    const agent = await apiClient.restartAgent(id)
    set(state => ({
      agents: state.agents.map(a => a.id === id ? agent : a),
      loading: false,
    }))
  },
}))
