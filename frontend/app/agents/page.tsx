'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentCard } from '@/components/agents/agent-card'
import { useAgentsStore } from '@/store/agents'

export default function AgentsPage() {
  const router = useRouter()
  const { agents, loading, fetchAgents, startAgent, stopAgent, deleteAgent } = useAgentsStore()

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Агенты</h1>
            <p className="text-muted-foreground mt-2">
              Управление вашими AI агентами
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fetchAgents()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Button onClick={() => router.push('/agents/new')}>
              <Plus className="h-4 w-4" />
              Создать агента
            </Button>
          </div>
        </div>
      </div>

      {loading && agents.length === 0 ? (
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground mt-4">Загрузка агентов...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">У вас пока нет агентов</p>
          <Button onClick={() => router.push('/agents/new')}>
            <Plus className="h-4 w-4" />
            Создать первого агента
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onStart={startAgent}
              onStop={stopAgent}
              onDelete={deleteAgent}
            />
          ))}
        </div>
      )}
    </div>
  )
}
