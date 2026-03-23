'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authStorage, clearTokens } from '@/lib/auth'
import { useAgentsStore } from '@/store/agents'
import { AgentList } from '@/components/agent-list'
import { AgentDetail } from '@/components/agent-detail'
import { ClaudePopover } from '@/components/claude-popover'
import { TelegramPopover } from '@/components/telegram-popover'
import { UpdatesPopover } from '@/components/updates-popover'

export default function HomePage() {
  const router = useRouter()
  const { agents, fetchAgents, createAgent } = useAgentsStore()
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('jobsy:selectedAgentId')
    return saved ? Number(saved) : null
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!authStorage.isAuthenticated()) {
      router.push('/auth/login')
      return
    }
    setReady(true)
    fetchAgents()
  }, [router, fetchAgents])

  // Persist selected agent to localStorage
  useEffect(() => {
    if (selectedId !== null) {
      localStorage.setItem('jobsy:selectedAgentId', String(selectedId))
    }
  }, [selectedId])

  // Auto-select: saved agent if exists, otherwise first
  useEffect(() => {
    if (agents.length === 0) return
    if (selectedId !== null && agents.some(a => a.id === selectedId)) return
    setSelectedId(agents[0].id)
  }, [agents, selectedId])

  // Poll when any agent is in transitional state (creating)
  useEffect(() => {
    const hasTransitional = agents.some(a => a.status === 'creating' || a.status === 'stopping')
    if (!hasTransitional) return
    const interval = setInterval(() => fetchAgents(), 3000)
    return () => clearInterval(interval)
  }, [agents, fetchAgents])

  const handleCreate = async (name: string) => {
    try {
      const agent = await createAgent({ name, telegram_user_id: 1 })
      setSelectedId(agent.id)
    } catch {
      // store уже обрабатывает ошибку
    }
  }

  const handleLogout = () => {
    clearTokens()
    router.push('/auth/login')
  }

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null

  if (!ready) {
    return <div className="h-screen bg-void" />
  }

  return (
    <div className="h-screen flex flex-col bg-void">
      {/* Header — 40px */}
      <header className="flex items-center justify-between px-4 h-10 border-b border-line-faint shrink-0">
        <span className="font-mono text-sm text-text-bright tracking-tight">jobsy</span>
        <div className="flex items-center gap-4">
          <UpdatesPopover />
          <TelegramPopover />
          <ClaudePopover />
          <button
            onClick={handleLogout}
            className="text-xs text-text-dim hover:text-text-main transition-colors"
          >
            выйти
          </button>
        </div>
      </header>

      {/* Main — flex-1 */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel — agent list */}
        <aside className="w-52 border-r border-line-faint shrink-0">
          <AgentList
            agents={agents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={handleCreate}
          />
        </aside>

        {/* Right panel — agent detail */}
        <main className="flex-1 min-w-0">
          {selectedAgent ? (
            <AgentDetail
              key={selectedAgent.id}
              agent={selectedAgent}
              onDeleted={() => {
                setSelectedId(agents.find((a) => a.id !== selectedId)?.id ?? null)
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-dim text-sm">
              {agents.length === 0
                ? 'создайте первого агента нажав +'
                : 'выберите агента'}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
