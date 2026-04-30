'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { ScheduledTask } from '@/types/agent'

function formatRepeat(seconds: number | null): string | null {
  if (!seconds) return null
  if (seconds % 86400 === 0) return `каждые ${seconds / 86400}д`
  if (seconds % 3600 === 0) return `каждые ${seconds / 3600}ч`
  if (seconds % 60 === 0) return `каждые ${seconds / 60}мин`
  return `каждые ${seconds}с`
}

function formatScheduleAt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRanAt(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusColor(status: string): string {
  if (status === 'done') return 'text-emerald-400'
  if (status === 'cancelled') return 'text-text-dim'
  if (status === 'pending' || status === 'in_progress') return 'text-copper'
  return 'text-text-dim'
}

interface TaskRowProps {
  task: ScheduledTask
}

function TaskRow({ task }: TaskRowProps) {
  const [open, setOpen] = useState(false)
  const repeat = formatRepeat(task.schedule_repeat)
  const hasResult = !!(task.result?.output || task.result?.error)
  const expandable = hasResult

  const summary = task.result?.error
    ? `❌ ${task.result.error}`
    : task.result?.output || ''

  return (
    <div className="bg-panel border border-line-faint rounded">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => expandable && setOpen(!open)}
        className={`w-full text-left px-3 py-2 flex items-start gap-2 ${
          expandable ? 'hover:bg-hover cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className={`text-[10px] font-mono shrink-0 mt-0.5 ${statusColor(task.status)}`}>
          [{task.id}]
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-main truncate">{task.title}</div>
          <div className="text-[10px] text-text-dim font-mono mt-0.5 flex flex-wrap gap-x-2">
            <span>{formatScheduleAt(task.schedule_at)}</span>
            {repeat && <span>{repeat}</span>}
            {task.model && <span className="text-copper">{task.model}</span>}
            {task.result?.ran_at && (
              <span>посл.: {formatRanAt(task.result.ran_at)}</span>
            )}
          </div>
        </div>
        {expandable && (
          <ChevronDown
            size={12}
            className={`shrink-0 mt-1 text-text-dim transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      {open && hasResult && (
        <div className="px-3 pb-2 text-[11px] text-text-dim font-mono whitespace-pre-wrap border-t border-line-faint pt-2">
          {summary}
        </div>
      )}
    </div>
  )
}

interface ScheduledTasksListProps {
  agentId: number
  agentRunning: boolean
}

export function ScheduledTasksList({ agentId, agentRunning }: ScheduledTasksListProps) {
  const [items, setItems] = useState<ScheduledTask[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const load = async () => {
    if (!agentRunning) {
      setItems(null)
      return
    }
    setLoading(true)
    setError(false)
    try {
      const data = await apiClient.getAgentScheduled(agentId)
      setItems(data.items)
    } catch {
      setItems(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, agentRunning])

  if (!agentRunning) {
    return (
      <div className="text-text-dim text-xs">доступно для запущенного агента</div>
    )
  }

  if (loading && !items) {
    return <div className="text-text-dim text-xs">загрузка...</div>
  }

  if (error) {
    return <div className="text-text-dim text-xs">не удалось загрузить</div>
  }

  if (!items || items.length === 0) {
    return <div className="text-text-dim text-xs">нет запланированных задач</div>
  }

  const active = items.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const archive = items.filter((t) => t.status === 'done' || t.status === 'cancelled')

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-text-dim text-xs">
          {active.length} активных
          {archive.length > 0 && `, ${archive.length} в архиве`}
        </span>
        <button
          onClick={load}
          disabled={loading}
          title="обновить"
          className="text-text-dim hover:text-text-main disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="space-y-1.5">
        {active.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
      {archive.length > 0 && (
        <details className="space-y-1.5" open={showDone}>
          <summary
            onClick={(e) => {
              e.preventDefault()
              setShowDone(!showDone)
            }}
            className="text-text-dim text-xs cursor-pointer hover:text-text-main list-none"
          >
            {showDone ? '▾' : '▸'} архив ({archive.length})
          </summary>
          {showDone && (
            <div className="space-y-1.5">
              {archive.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          )}
        </details>
      )}
    </div>
  )
}
