'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authStorage, clearTokens } from '@/lib/auth'
import { apiClient } from '@/lib/api'
import { useAgentsStore } from '@/store/agents'
import { AgentList } from '@/components/agent-list'
import { AgentDetail } from '@/components/agent-detail'
import { ClaudePopover } from '@/components/claude-popover'
import { TelegramPopover } from '@/components/telegram-popover'
import { UpdatesPopover } from '@/components/updates-popover'
import { UsageChart } from '@/components/usage-chart'
import { AgentUsageRow } from '@/components/agent-usage-row'
import type { UsagePeriod, UsageSummaryBucket } from '@/types/usage'

export default function HomePage() {
  const router = useRouter()
  const { agents, fetchAgents, createAgent } = useAgentsStore()
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('jobsy:selectedAgentId')
    if (saved === 'overview') return null
    return saved ? Number(saved) : null
  })
  // Был ли выбор сделан явно (включая "обзор")? Чтобы не авто-выбирать поверх него.
  const [explicitSelection, setExplicitSelection] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('jobsy:selectedAgentId') !== null
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

  const handleSelect = (id: number | null) => {
    setSelectedId(id)
    setExplicitSelection(true)
    localStorage.setItem('jobsy:selectedAgentId', id === null ? 'overview' : String(id))
  }

  // Auto-select first agent ТОЛЬКО при первом заходе без явного выбора
  useEffect(() => {
    if (agents.length === 0) return
    if (explicitSelection) return
    if (selectedId !== null && agents.some(a => a.id === selectedId)) return
    setSelectedId(agents[0].id)
  }, [agents, selectedId, explicitSelection])

  // Poll when any agent is in transitional state (creating)
  useEffect(() => {
    const hasTransitional = agents.some(a => a.status === 'creating' || a.status === 'stopping')
    if (!hasTransitional) return
    const interval = setInterval(() => fetchAgents(), 3000)
    return () => clearInterval(interval)
  }, [agents, fetchAgents])

  // Usage summary
  const [summaryPeriod, setSummaryPeriod] = useState<UsagePeriod>('7d')
  const [summaryBuckets, setSummaryBuckets] = useState<UsageSummaryBucket[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryReloadTick, setSummaryReloadTick] = useState(0)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    setSummaryLoading(true)
    apiClient
      .getUsageSummary(summaryPeriod)
      .then((res) => {
        if (cancelled) return
        setSummaryBuckets(res.agents)
      })
      .catch(() => {
        if (cancelled) return
        setSummaryBuckets([])
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => { cancelled = true }
  }, [ready, summaryPeriod, summaryReloadTick])

  const handleCreate = async (name: string) => {
    try {
      const agent = await createAgent({ name, telegram_user_id: 1 })
      handleSelect(agent.id)
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
            onSelect={handleSelect}
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
                handleSelect(agents.find((a) => a.id !== selectedId)?.id ?? null)
              }}
            />
          ) : (
            <div className="h-full overflow-y-auto px-6 py-5 space-y-5">
              <div className="flex items-center h-14 -mt-5 -mx-6 px-6 border-b border-line-faint">
                <h2 className="font-mono text-sm text-text-bright">обзор</h2>
              </div>
              <UsageChart
                mode="stacked"
                period={summaryPeriod}
                onPeriodChange={setSummaryPeriod}
                onRefresh={() => setSummaryReloadTick((t) => t + 1)}
                agents={summaryBuckets}
                loading={summaryLoading}
              />
              {summaryBuckets.length > 0 && (
                <div className="space-y-2">
                  <div className="text-text-dim text-xs uppercase tracking-wider">
                    агенты
                  </div>
                  <div className="space-y-1.5">
                    {summaryBuckets.map((bucket) => (
                      <AgentUsageRow
                        key={bucket.agent_id}
                        bucket={bucket}
                        onClick={() => handleSelect(bucket.agent_id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {agents.length === 0 && (
                <div className="text-text-dim text-xs text-center">
                  создайте первого агента нажав +
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
