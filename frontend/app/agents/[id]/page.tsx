'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Play, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AgentStatusBadge } from '@/components/agents/agent-status-badge'
import { useAgentsStore } from '@/store/agents'
import { formatDate } from '@/lib/utils'
import type { Agent } from '@/types/agent'

export default function AgentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const { getAgent, startAgent, stopAgent, deleteAgent } = useAgentsStore()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadAgent = async () => {
      setLoading(true)
      const data = await getAgent(id)
      setAgent(data)
      setLoading(false)
    }

    loadAgent()
  }, [id, getAgent])

  const handleDelete = async () => {
    if (confirm('Удалить агента?')) {
      await deleteAgent(id)
      router.push('/agents')
    }
  }

  if (loading || !agent) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Загрузка...</div>
      </div>
    )
  }

  const canStart = agent.status === 'idle' || agent.status === 'stopped'
  const canStop = agent.status === 'active'

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4" />
          Назад к списку
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{agent.first_name || agent.username}</h1>
            <p className="text-muted-foreground mt-2">@{agent.username}</p>
          </div>
          <AgentStatusBadge status={agent.status} />
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Основная информация</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">ID</p>
                <p className="font-mono text-sm">{agent.id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Telegram User ID</p>
                <p>{agent.telegram_user_id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Создан</p>
                <p>{formatDate(agent.created_at)}</p>
              </div>
              {agent.last_active_at && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Последняя активность</p>
                  <p>{formatDate(agent.last_active_at)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Конфигурация</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              {agent.config.model && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Модель</p>
                  <p className="font-mono text-sm">{agent.config.model}</p>
                </div>
              )}
              {agent.config.temperature !== undefined && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Temperature</p>
                  <p>{agent.config.temperature}</p>
                </div>
              )}
              {agent.config.max_tokens && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Max Tokens</p>
                  <p>{agent.config.max_tokens}</p>
                </div>
              )}
            </div>
            {agent.config.system_prompt && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">System Prompt</p>
                <pre className="bg-muted p-4 rounded-md text-sm overflow-auto">
                  {agent.config.system_prompt}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Управление</CardTitle>
            <CardDescription>Действия с агентом</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            {canStart && (
              <Button onClick={() => startAgent(id)}>
                <Play className="h-4 w-4" />
                Запустить
              </Button>
            )}
            {canStop && (
              <Button variant="outline" onClick={() => stopAgent(id)}>
                <Square className="h-4 w-4" />
                Остановить
              </Button>
            )}
            <Button variant="destructive" onClick={handleDelete} className="ml-auto">
              <Trash2 className="h-4 w-4" />
              Удалить агента
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
