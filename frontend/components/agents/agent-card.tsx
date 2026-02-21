'use client'

import Link from 'next/link'
import { Play, Square, Trash2, User } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AgentStatusBadge } from './agent-status-badge'
import { formatRelativeTime } from '@/lib/utils'
import type { Agent } from '@/types/agent'

interface AgentCardProps {
  agent: Agent
  onStart?: (id: string) => void
  onStop?: (id: string) => void
  onDelete?: (id: string) => void
}

export function AgentCard({ agent, onStart, onStop, onDelete }: AgentCardProps) {
  const canStart = agent.status === 'idle' || agent.status === 'stopped'
  const canStop = agent.status === 'active'

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                <Link href={`/agents/${agent.id}`} className="hover:underline">
                  {agent.first_name || agent.username}
                </Link>
              </CardTitle>
              <CardDescription>@{agent.username}</CardDescription>
            </div>
          </div>
          <AgentStatusBadge status={agent.status} />
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>
            <span className="font-medium">Telegram ID:</span> {agent.telegram_user_id}
          </div>
          <div>
            <span className="font-medium">Создан:</span> {formatRelativeTime(agent.created_at)}
          </div>
          {agent.last_active_at && (
            <div>
              <span className="font-medium">Последняя активность:</span> {formatRelativeTime(agent.last_active_at)}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        {canStart && onStart && (
          <Button size="sm" onClick={() => onStart(agent.id)} className="gap-1">
            <Play className="h-4 w-4" />
            Запустить
          </Button>
        )}
        {canStop && onStop && (
          <Button size="sm" variant="outline" onClick={() => onStop(agent.id)} className="gap-1">
            <Square className="h-4 w-4" />
            Остановить
          </Button>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (confirm('Удалить агента?')) {
                onDelete(agent.id)
              }
            }}
            className="gap-1 ml-auto"
          >
            <Trash2 className="h-4 w-4" />
            Удалить
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
