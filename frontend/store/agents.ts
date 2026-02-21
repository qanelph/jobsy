import { create } from 'zustand'
import { apiClient } from '@/lib/api'
import type { Agent, CreateAgentRequest, UpdateAgentRequest } from '@/types/agent'

interface AgentsState {
  agents: Agent[]
  loading: boolean
  error: string | null

  fetchAgents: () => Promise<void>
  getAgent: (id: string) => Promise<Agent | null>
  createAgent: (data: CreateAgentRequest) => Promise<Agent>
  updateAgent: (id: string, data: UpdateAgentRequest) => Promise<Agent>
  deleteAgent: (id: string) => Promise<void>
  startAgent: (id: string) => Promise<void>
  stopAgent: (id: string) => Promise<void>
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null })
    const agents = await apiClient.getAgents()
    set({ agents, loading: false })
  },

  getAgent: async (id: string) => {
    const cached = get().agents.find(a => a.id === id)
    if (cached) return cached

    set({ loading: true, error: null })
    const agent = await apiClient.getAgent(id)
    set(state => ({
      agents: [...state.agents.filter(a => a.id !== id), agent],
      loading: false,
    }))
    return agent
  },

  createAgent: async (data: CreateAgentRequest) => {
    set({ loading: true, error: null })
    const agent = await apiClient.createAgent(data)
    set(state => ({
      agents: [...state.agents, agent],
      loading: false,
    }))
    return agent
  },

  updateAgent: async (id: string, data: UpdateAgentRequest) => {
    set({ loading: true, error: null })
    const agent = await apiClient.updateAgent(id, data)
    set(state => ({
      agents: state.agents.map(a => a.id === id ? agent : a),
      loading: false,
    }))
    return agent
  },

  deleteAgent: async (id: string) => {
    set({ loading: true, error: null })
    await apiClient.deleteAgent(id)
    set(state => ({
      agents: state.agents.filter(a => a.id !== id),
      loading: false,
    }))
  },

  startAgent: async (id: string) => {
    set({ loading: true, error: null })
    const agent = await apiClient.startAgent(id)
    set(state => ({
      agents: state.agents.map(a => a.id === id ? agent : a),
      loading: false,
    }))
  },

  stopAgent: async (id: string) => {
    set({ loading: true, error: null })
    const agent = await apiClient.stopAgent(id)
    set(state => ({
      agents: state.agents.map(a => a.id === id ? agent : a),
      loading: false,
    }))
  },
}))
