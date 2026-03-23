'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api'
import type { UpdateStatus, ImageUpdateInfo } from '@/types/updates'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

interface ProgressStep {
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

function ProgressBar({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="space-y-1 py-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={`text-[10px] ${
            step.status === 'done' ? 'text-emerald-400' :
            step.status === 'active' ? 'text-copper animate-pulse' :
            step.status === 'error' ? 'text-rose' :
            'text-text-dim'
          }`}>
            {step.status === 'done' ? '\u25A0' :
             step.status === 'active' ? '\u25A1' :
             step.status === 'error' ? '\u25A0' :
             '\u00B7'}
          </span>
          <span className={`text-[10px] ${
            step.status === 'active' ? 'text-text-main' :
            step.status === 'done' ? 'text-text-dim' :
            step.status === 'error' ? 'text-rose' :
            'text-text-dim'
          }`}>
            {step.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function UpdateRow({
  label,
  info,
  onUpdate,
  disabled,
}: {
  label: string
  info: ImageUpdateInfo
  onUpdate: () => void
  disabled: boolean
}) {
  const color = info.has_update ? 'text-copper' : 'text-emerald-400'
  const icon = info.has_update ? '\u25A1' : '\u25A0'

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] ${color}`}>{icon}</span>
        <span className="text-xs text-text-main">{label}</span>
        {info.current_digest && (
          <span className="text-[10px] text-text-dim font-mono">
            {info.current_digest.slice(7, 14)}
          </span>
        )}
      </div>
      {info.has_update && (
        <button
          onClick={onUpdate}
          disabled={disabled}
          className="text-[10px] text-copper hover:underline disabled:opacity-40"
        >
          обновить
        </button>
      )}
    </div>
  )
}

export function UpdatesPopover() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<ProgressStep[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.checkUpdates()
      setStatus(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setSteps(null)
      fetchStatus()
    }
  }, [open, fetchStatus])

  const handleUpdateJobs = async () => {
    setError(null)
    setSteps([
      { label: 'отправка запроса', status: 'active' },
      { label: 'обновление образов агентов', status: 'pending' },
      { label: 'перезапуск агентов', status: 'pending' },
      { label: 'проверка статуса', status: 'pending' },
    ])
    try {
      setSteps(s => s && [
        { ...s[0], status: 'done' },
        { ...s[1], status: 'active' },
        { ...s[2], status: 'pending' },
        { ...s[3], status: 'pending' },
      ])
      const res = await apiClient.updateAgents()
      setSteps(s => s && [
        { ...s[0], status: 'done' },
        { ...s[1], status: 'done' },
        { label: `перезапуск ${res.updated.length} агентов`, status: 'done' },
        { ...s[3], status: 'active' },
      ])
      await fetchStatus()
      setSteps(s => s && s.map(st => ({ ...st, status: 'done' as const })))
      setTimeout(() => setSteps(null), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSteps(s => s && s.map(st =>
        st.status === 'active' ? { ...st, status: 'error' as const } : st
      ))
    }
  }

  const handleUpdateJobsy = async () => {
    if (!confirm('Jobsy будет перезапущена. Продолжить?')) return
    setError(null)
    setSteps([
      { label: 'отправка запроса', status: 'active' },
      { label: 'обновление frontend', status: 'pending' },
      { label: 'обновление orchestrator', status: 'pending' },
      { label: 'перезапуск сервисов', status: 'pending' },
    ])
    try {
      setSteps(s => s && [
        { ...s[0], status: 'done' },
        { ...s[1], status: 'active' },
        { ...s[2], status: 'pending' },
        { ...s[3], status: 'pending' },
      ])
      await apiClient.updatePlatform()
      setSteps([
        { label: 'отправка запроса', status: 'done' },
        { label: 'обновление frontend', status: 'done' },
        { label: 'обновление orchestrator', status: 'done' },
        { label: 'перезапуск сервисов — обновите страницу через 30 сек', status: 'active' },
      ])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSteps(s => s && s.map(st =>
        st.status === 'active' ? { ...st, status: 'error' as const } : st
      ))
    }
  }

  const isUpdating = steps !== null && steps.some(s => s.status === 'active')

  // Combine orchestrator + frontend into one "jobsy" status
  const jobsyHasUpdate = status && (status.orchestrator.has_update || status.frontend.has_update)
  const jobsySource = status?.frontend.has_update ? status.frontend : status?.orchestrator
  const jobsyInfo: ImageUpdateInfo | null = status && jobsySource ? {
    image: 'jobsy',
    current_digest: jobsySource.current_digest,
    latest_digest: jobsySource.latest_digest,
    has_update: !!jobsyHasUpdate,
    last_checked: jobsySource.last_checked,
  } : null

  const hasAnyUpdate = status && (status.agent.has_update || jobsyHasUpdate)

  const dotColor = !status
    ? 'text-text-dim'
    : hasAnyUpdate
      ? 'text-copper'
      : 'text-emerald-400'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-main transition-colors">
          updates <span className={dotColor}>{'\u25CF'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="space-y-2">
          {error && (
            <div className="text-[10px] text-rose bg-rose/10 rounded px-2 py-1 break-all">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-text-dim text-xs text-center py-2">checking...</div>
          ) : status && jobsyInfo ? (
            <>
              <UpdateRow
                label="jobsy"
                info={jobsyInfo}
                onUpdate={handleUpdateJobsy}
                disabled={isUpdating}
              />
              <UpdateRow
                label="jobs"
                info={status.agent}
                onUpdate={handleUpdateJobs}
                disabled={isUpdating}
              />
              {!steps && (
                <div className="pt-1 border-t border-line-faint">
                  <button
                    onClick={fetchStatus}
                    disabled={loading}
                    className="text-[10px] text-text-dim hover:text-text-main transition-colors"
                  >
                    проверить заново
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-text-dim text-xs text-center py-2">no data</div>
          )}
          {steps && (
            <div className="pt-1 border-t border-line-faint">
              <ProgressBar steps={steps} />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
