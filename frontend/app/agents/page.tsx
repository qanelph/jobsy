'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus, RefreshCw, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentCard } from '@/components/agents/agent-card'
import { AppLayout } from '@/components/layout/app-layout'
import { useAgentsStore } from '@/store/agents'

export default function AgentsPage() {
  const router = useRouter()
  const { agents, loading, fetchAgents, startAgent, stopAgent, deleteAgent } = useAgentsStore()

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">AI Агенты</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Управление вашими AI агентами
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchAgents()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Обновить
              </Button>
              <Button size="sm" onClick={() => router.push('/agents/new')}>
                <Plus className="h-4 w-4" />
                Создать
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading && agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground mt-4 text-sm">Загрузка агентов...</p>
          </div>
        ) : agents.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass flex flex-col items-center justify-center py-16 px-8"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/[0.06] flex items-center justify-center mb-4">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-1">Нет агентов</p>
            <p className="text-sm text-muted-foreground mb-6">Создайте первого AI агента для начала работы</p>
            <Button onClick={() => router.push('/agents/new')}>
              <Plus className="h-4 w-4" />
              Создать агента
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent, index) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                index={index}
                onStart={startAgent}
                onStop={stopAgent}
                onDelete={deleteAgent}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AppLayout>
  )
}
