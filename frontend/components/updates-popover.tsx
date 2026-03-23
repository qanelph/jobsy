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
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className={info.has_update ? 'text-copper' : 'text-emerald-400'}>
          {info.has_update ? '\u2191' : '\u2713'}
        </span>
        <span className="text-xs text-text-main">{label}</span>
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

  const handleUpdateAgents = async () => {
    setUpdating('agents')
    setError(null)
    setResult(null)
    try {
      const res = await apiClient.updateAgents()
      setResult(`${res.updated.length} agent(s) updated`)
      fetchStatus()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUpdating(null)
    }
  }

  const handleUpdatePlatform = async () => {
    if (!confirm('Orchestrator и frontend будут перезапущены. Продолжить?')) return
    setUpdating('platform')
    setError(null)
    setResult(null)
    try {
      await apiClient.updatePlatform()
      setResult('platform restarting...')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUpdating(null)
    }
  }

  const hasAnyUpdate = status && (status.agent.has_update || status.orchestrator.has_update || status.frontend.has_update)

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
          ) : status ? (
            <>
              <UpdateRow
                label="agents"
                info={status.agent}
                onUpdate={handleUpdateAgents}
                updating={updating === 'agents'}
              />
              <UpdateRow
                label="orchestrator"
                info={status.orchestrator}
                onUpdate={handleUpdatePlatform}
                updating={updating === 'platform'}
              />
              <UpdateRow
                label="frontend"
                info={status.frontend}
                onUpdate={handleUpdatePlatform}
                updating={updating === 'platform'}
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
