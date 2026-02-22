'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Play, Square, Trash2 } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { AgentStatusBadge } from './agent-status-badge'
import { formatRelativeTime } from '@/lib/utils'
import type { Agent } from '@/types/agent'

interface AgentCardProps {
  agent: Agent
  index?: number
  onStart?: (id: number) => void
  onStop?: (id: number) => void
  onDelete?: (id: number) => void
}

const avatarColors = [
  'from-blue-500 to-cyan-400',
  'from-purple-500 to-pink-400',
  'from-emerald-500 to-teal-400',
  'from-orange-500 to-amber-400',
  'from-rose-500 to-pink-400',
  'from-indigo-500 to-violet-400',
]

function getAvatarColor(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return avatarColors[hash % avatarColors.length]
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function AgentCard({ agent, index = 0, onStart, onStop, onDelete }: AgentCardProps) {
  const canStart = agent.status === 'stopped' || agent.status === 'creating'
  const canStop = agent.status === 'running'
  const initials = getInitials(agent.name)
  const colorClass = getAvatarColor(agent.name)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
    >
      <Card className="group hover:bg-white/[0.08] transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <Link href={`/agents/${agent.id}`} className="flex items-center gap-3 min-w-0">
              <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center flex-shrink-0`}>
                <span className="text-white font-semibold text-sm">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate hover:text-blue-400 transition-colors">
                  {agent.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {agent.active_sessions > 0
                    ? `${agent.active_sessions} активных сессий`
                    : `${agent.total_sessions} сессий всего`}
                </p>
              </div>
            </Link>
            <AgentStatusBadge status={agent.status} />
          </div>
        </CardHeader>

        <CardContent className="pb-3">
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Telegram ID</span>
              <span className="text-foreground font-mono text-xs">{agent.telegram_user_id}</span>
            </div>
            <div className="flex justify-between">
              <span>Создан</span>
              <span className="text-foreground">{formatRelativeTime(agent.created_at)}</span>
            </div>
            {agent.last_heartbeat && (
              <div className="flex justify-between">
                <span>Heartbeat</span>
                <span className="text-foreground">{formatRelativeTime(agent.last_heartbeat)}</span>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="gap-1.5 pt-3 border-t border-white/[0.06]">
          {canStart && onStart && (
            <Button size="icon" variant="ghost" onClick={() => onStart(agent.id)} title="Запустить">
              <Play className="h-4 w-4 text-emerald-400" />
            </Button>
          )}
          {canStop && onStop && (
            <Button size="icon" variant="ghost" onClick={() => onStop(agent.id)} title="Остановить">
              <Square className="h-4 w-4 text-amber-400" />
            </Button>
          )}
          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto"
                  title="Удалить"
                >
                  <Trash2 className="h-4 w-4 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить агента?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Агент <span className="font-medium text-foreground">{agent.name}</span> будет удалён. Контейнеры будут остановлены и удалены, но данные (volumes) сохранятся.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(agent.id)}>
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  )
}
