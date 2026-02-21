import { Badge } from '@/components/ui/badge'
import type { AgentStatus } from '@/types/agent'

interface AgentStatusBadgeProps {
  status: AgentStatus
}

const statusConfig: Record<AgentStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' }> = {
  idle: { label: 'Ожидание', variant: 'default' },
  active: { label: 'Активен', variant: 'success' },
  error: { label: 'Ошибка', variant: 'destructive' },
  stopped: { label: 'Остановлен', variant: 'warning' },
}

export function AgentStatusBadge({ status }: AgentStatusBadgeProps) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
