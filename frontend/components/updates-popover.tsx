'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api'
import type { UpdateStatus, ImageUpdateInfo } from '@/types/updates'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

function UpdateRow({
  label,
  info,
  onUpdate,
  updating,
}: {
  label: string
  info: ImageUpdateInfo
  onUpdate: () => void
  updating: boolean
}) {
  const color = info.has_update ? 'text-copper' : 'text-emerald-400'
  // ■ filled = up to date, □ empty = update available
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
          disabled={updating}
          className="text-[10px] text-copper hover:underline disabled:opacity-40"
        >
          {updating ? '...' : 'обновить'}
        </button>
      )}
    </div>
  )
}

export function UpdatesPopover() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

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
      setResult(null)
      fetchStatus()
    }
  }, [open, fetchStatus])

  const handleUpdateJobs = async () => {
    setUpdating('jobs')
    setError(null)
    setResult(null)
    try {
      const res = await apiClient.updateAgents()
      setResult(`${res.updated.length} agent(s) updated`)
      await fetchStatus()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUpdating(null)
    }
  }

  const handleUpdateJobsy = async () => {
    if (!confirm('Jobsy будет перезапущена. Продолжить?')) return
    setUpdating('jobsy')
    setError(null)
    setResult(null)
    try {
      await apiClient.updatePlatform()
      setResult('jobsy restarting...')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUpdating(null)
    }
  }

  // Combine orchestrator + frontend into one "jobsy" status
  const jobsyHasUpdate = status && (status.orchestrator.has_update || status.frontend.has_update)
  // Show digest of whichever component has an update, or orchestrator by default
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
          {result && (
            <div className="text-[10px] text-emerald-400 bg-emerald-400/10 rounded px-2 py-1">
              {result}
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
                updating={updating === 'jobsy'}
              />
              <UpdateRow
                label="jobs"
                info={status.agent}
                onUpdate={handleUpdateJobs}
                updating={updating === 'jobs'}
              />
              <div className="pt-1 border-t border-line-faint">
                <button
                  onClick={fetchStatus}
                  disabled={loading}
                  className="text-[10px] text-text-dim hover:text-text-main transition-colors"
                >
                  {loading ? '...' : 'проверить заново'}
                </button>
              </div>
            </>
          ) : (
            <div className="text-text-dim text-xs text-center py-2">no data</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
