'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Play, Square, Trash2, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { AgentStatusBadge } from '@/components/agents/agent-status-badge'
import { AppLayout } from '@/components/layout/app-layout'
import { useAgentsStore } from '@/store/agents'
import { cn, formatDate } from '@/lib/utils'
import type { Agent } from '@/types/agent'

type Tab = 'overview' | 'logs' | 'settings'

export default function AgentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = Number(params.id)

  const { getAgent, startAgent, stopAgent, deleteAgent } = useAgentsStore()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

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
    await deleteAgent(id)
    router.push('/agents')
  }

  const handleStart = async () => {
    await startAgent(id)
    const data = await getAgent(id)
    setAgent(data)
  }

  const handleStop = async () => {
    await stopAgent(id)
    const data = await getAgent(id)
    setAgent(data)
  }

  if (loading || !agent) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  const canStart = agent.status === 'stopped' || agent.status === 'error'
  const canStop = agent.status === 'running'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'logs', label: 'Логи' },
    { id: 'settings', label: 'Настройки' },
  ]

  const avatarColors = [
    'from-blue-500 to-cyan-400',
    'from-purple-500 to-pink-400',
    'from-emerald-500 to-teal-400',
    'from-orange-500 to-amber-400',
  ]
  const hash = agent.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const colorClass = avatarColors[hash % avatarColors.length]
  const initials = agent.name.slice(0, 2).toUpperCase()

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => router.push('/agents')} className="mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Агенты
        </Button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${colorClass} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white font-bold text-lg">{initials}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
                <AgentStatusBadge status={agent.status} />
              </div>
              <p className="text-sm text-muted-foreground">ID: {agent.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canStart && (
              <Button size="sm" onClick={handleStart}>
                <Play className="h-4 w-4" />
                Запустить
              </Button>
            )}
            {canStop && (
              <Button size="sm" variant="outline" onClick={handleStop}>
                <Square className="h-4 w-4" />
                Остановить
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <Trash2 className="h-4 w-4" />
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
                  <AlertDialogAction onClick={handleDelete}>
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 glass-subtle rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-white/[0.1] text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Основная информация</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">ID</p>
                      <p className="font-mono text-sm">{agent.id}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Telegram User ID</p>
                      <p className="text-sm">{agent.telegram_user_id}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Создан</p>
                      <p className="text-sm">{formatDate(agent.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Обновлён</p>
                      <p className="text-sm">{formatDate(agent.updated_at)}</p>
                    </div>
                    {agent.last_heartbeat && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Последний heartbeat</p>
                        <p className="text-sm">{formatDate(agent.last_heartbeat)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Активен</p>
                      <p className="text-sm">{agent.is_active ? 'Да' : 'Нет'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Статистика</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Всего сессий</p>
                      <p className="text-2xl font-semibold">{agent.total_sessions}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Активных сессий</p>
                      <p className="text-2xl font-semibold">{agent.active_sessions}</p>
                    </div>
                    {agent.container_id && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Container ID</p>
                        <p className="font-mono text-xs truncate">{agent.container_id}</p>
                      </div>
                    )}
                    {agent.port && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Port</p>
                        <p className="font-mono text-sm">{agent.port}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {agent.custom_instructions && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base">Кастомные инструкции</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-white/[0.04] border border-white/[0.06] p-4 rounded-xl text-sm font-mono overflow-auto whitespace-pre-wrap">
                      {agent.custom_instructions}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <p className="text-sm">Логи будут доступны в будущих версиях</p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'settings' && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <p className="text-sm">Настройки будут доступны в будущих версиях</p>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </motion.div>
    </AppLayout>
  )
}
