import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AgentStatus } from '@/types/agent'

interface AgentStatusBadgeProps {
  status: AgentStatus
}

const statusConfig: Record<AgentStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive'; dotColor: string }> = {
  creating: { label: 'Создание', variant: 'default', dotColor: 'bg-blue-400 animate-dot-pulse' },
  running: { label: 'Активен', variant: 'success', dotColor: 'bg-emerald-400 animate-dot-pulse' },
  stopped: { label: 'Остановлен', variant: 'warning', dotColor: 'bg-amber-400' },
  error: { label: 'Ошибка', variant: 'destructive', dotColor: 'bg-red-400' },
  deleted: { label: 'Удалён', variant: 'default', dotColor: 'bg-slate-400' },
}

export function AgentStatusBadge({ status }: AgentStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.stopped
  return (
    <Badge variant={config.variant}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dotColor)} />
      {config.label}
    </Badge>
  )
}
