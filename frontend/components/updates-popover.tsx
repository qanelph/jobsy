'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, RotateCw } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { UpdateStatus, ImageUpdateInfo, VersionEntry } from '@/types/updates'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  AlertDialog, AlertDialogContent, AlertDialogTitle,
  AlertDialogDescription, AlertDialogCancel,
} from '@/components/ui/alert-dialog'

/* ── Progress ── */

interface ProgressStep {
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

function ProgressBar({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="space-y-2 py-1">
      {steps.map((step, i) => {
        const color =
          step.status === 'done' ? 'text-emerald-400' :
          step.status === 'active' ? 'text-copper' :
          step.status === 'error' ? 'text-rose' : 'text-text-dim'
        return (
          <div key={i}
            className="flex items-center gap-2.5 transition-all duration-300"
            style={{ opacity: step.status === 'pending' ? 0.35 : 1 }}
          >
            <span className={`text-xs ${color} ${step.status === 'active' ? 'animate-pulse' : ''}`}>
              {step.status === 'done' ? '\u25A0' : step.status === 'error' ? '\u25A0' : '\u25A1'}
            </span>
            <span className={`text-xs ${step.status === 'active' ? 'text-text-main' : color}`}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Version Modal ── */

function VersionModal({
  open, onClose, component,
}: {
  open: boolean
  onClose: () => void
  component: string
}) {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setExpanded(null)
    apiClient.getVersions(component)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [open, component])

  // Find current version index — everything at and below is "installed"
  const currentIdx = versions?.findIndex(v => v.is_current) ?? -1

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogTitle className="text-sm">{component} — история версий</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="mt-3">
            {loading ? (
              <div className="text-text-dim text-xs text-center py-6">загрузка...</div>
            ) : !versions?.length ? (
              <div className="text-text-dim text-xs text-center py-6">нет данных</div>
            ) : (
              <div className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
                {versions.map((v, idx) => {
                  const isCurrentOrOlder = currentIdx >= 0 && idx >= currentIdx
                  const isCurrent = v.is_current
                  return (
                    <div key={v.tag}>
                      <button
                        onClick={() => setExpanded(expanded === v.sha ? null : v.sha)}
                        className={`w-full flex items-center gap-2.5 py-2 px-2.5 text-left rounded transition-colors ${
                          isCurrent ? 'bg-emerald-400/8' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className={`text-xs transition-colors ${
                          isCurrent ? 'text-emerald-400' :
                          isCurrentOrOlder ? 'text-emerald-400/50' :
                          'text-text-dim'
                        }`}>
                          {isCurrentOrOlder ? '\u25A0' : '\u25A1'}
                        </span>
                        <span className={`text-xs font-mono w-16 shrink-0 ${
                          isCurrent ? 'text-emerald-400' : 'text-copper'
                        }`}>
                          {v.sha}
                        </span>
                        <span className={`text-xs truncate flex-1 ${
                          isCurrent ? 'text-text-bright' : 'text-text-main'
                        }`}>
                          {v.pr_title}
                          {isCurrent && <span className="text-emerald-400 ml-1.5 text-[10px]">текущая</span>}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-text-dim transition-transform duration-200 shrink-0 ${
                          expanded === v.sha ? 'rotate-180' : ''
                        }`} />
                      </button>
                      <div className={`overflow-hidden transition-all duration-200 ${
                        expanded === v.sha ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                      }`}>
                        {v.pr_body ? (
                          <div className="ml-9 mr-2 mb-2 mt-0.5 text-xs text-text-dim leading-relaxed whitespace-pre-wrap border-l-2 border-line-faint pl-3">
                            {v.pr_body}
                          </div>
                        ) : (
                          <div className="ml-9 mb-2 text-xs text-text-dim italic">нет описания</div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {currentIdx < 0 && (
                  <div className="text-xs text-text-dim italic text-center py-2 border-t border-line-faint mt-2">
                    текущая версия не найдена среди тегов
                  </div>
                )}
              </div>
            )}
          </div>
        </AlertDialogDescription>
        <div className="flex justify-end mt-4">
          <AlertDialogCancel>закрыть</AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* ── Update Row ── */

function UpdateRow({
  label, info, onUpdate, onShowVersions, disabled,
}: {
  label: string
  info: ImageUpdateInfo
  onUpdate: () => void
  onShowVersions: () => void
  disabled: boolean
}) {
  const color = info.has_update ? 'text-copper' : 'text-emerald-400'
  const icon = info.has_update ? '\u25A1' : '\u25A0'

  return (
    <div className="flex items-center justify-between py-2 group">
      <div className="flex items-center gap-2.5">
        <span className={`text-xs ${color} transition-colors duration-300`}>{icon}</span>
        <span className="text-sm text-text-main font-medium">{label}</span>
        <button
          onClick={onShowVersions}
          className="flex items-center gap-1 text-xs text-text-dim hover:text-copper transition-colors font-mono"
        >
          {info.current_sha || '·····'}
          {info.has_update && info.latest_sha && (
            <span className="text-copper">{'\u2192'} {info.latest_sha}</span>
          )}
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      {info.has_update && (
        <button
          onClick={onUpdate}
          disabled={disabled}
          className="text-xs text-copper hover:underline disabled:opacity-40 transition-opacity"
        >
          обновить
        </button>
      )}
    </div>
  )
}

/* ── Main Popover ── */

export function UpdatesPopover() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<ProgressStep[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [versionModal, setVersionModal] = useState<string | null>(null)
  const [showReload, setShowReload] = useState(false)
  const healthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      setShowReload(false)
      fetchStatus()
    }
    return () => {
      if (healthPollRef.current) clearInterval(healthPollRef.current)
    }
  }, [open, fetchStatus])

  const pollHealthcheck = () => {
    if (healthPollRef.current) clearInterval(healthPollRef.current)
    healthPollRef.current = setInterval(async () => {
      try {
        const resp = await fetch('/api/health')
        if (resp.ok) {
          if (healthPollRef.current) clearInterval(healthPollRef.current)
          setSteps(s => s && s.map(st => ({ ...st, status: 'done' as const })))
          setShowReload(true)
        }
      } catch {
        // still restarting
      }
    }, 3000)
  }

  const handleUpdateJobs = async () => {
    setError(null)
    setSteps([
      { label: 'отправка запроса', status: 'active' },
      { label: 'обновление образов', status: 'pending' },
      { label: 'перезапуск агентов', status: 'pending' },
      { label: 'проверка', status: 'pending' },
    ])
    try {
      setSteps(s => s && [
        { ...s[0], status: 'done' }, { ...s[1], status: 'active' },
        { ...s[2], status: 'pending' }, { ...s[3], status: 'pending' },
      ])
      const res = await apiClient.updateAgents()
      setSteps(s => s && [
        { ...s[0], status: 'done' }, { ...s[1], status: 'done' },
        { label: `${res.updated.length} агентов обновлено`, status: 'done' },
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
    setError(null)
    setShowReload(false)
    setSteps([
      { label: 'отправка запроса', status: 'active' },
      { label: 'обновление frontend', status: 'pending' },
      { label: 'обновление orchestrator', status: 'pending' },
      { label: 'ожидание перезапуска', status: 'pending' },
    ])
    try {
      setSteps(s => s && [
        { ...s[0], status: 'done' }, { ...s[1], status: 'active' },
        { ...s[2], status: 'pending' }, { ...s[3], status: 'pending' },
      ])
      await apiClient.updatePlatform()
      setSteps([
        { label: 'отправка запроса', status: 'done' },
        { label: 'обновление frontend', status: 'done' },
        { label: 'обновление orchestrator', status: 'done' },
        { label: 'ожидание перезапуска', status: 'active' },
      ])
      pollHealthcheck()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSteps(s => s && s.map(st =>
        st.status === 'active' ? { ...st, status: 'error' as const } : st
      ))
    }
  }

  const isUpdating = steps !== null && steps.some(s => s.status === 'active')

  const jobsyHasUpdate = status && (status.orchestrator.has_update || status.frontend.has_update)
  const jobsySource = status?.frontend.has_update ? status.frontend : status?.orchestrator
  const jobsyInfo: ImageUpdateInfo | null = status && jobsySource ? {
    image: 'jobsy',
    current_digest: jobsySource.current_digest,
    latest_digest: jobsySource.latest_digest,
    has_update: !!jobsyHasUpdate,
    current_sha: jobsySource.current_sha,
    latest_sha: jobsySource.latest_sha,
    last_checked: jobsySource.last_checked,
  } : null

  const hasAnyUpdate = status && (status.agent.has_update || jobsyHasUpdate)

  const dotColor = !status
    ? 'text-text-dim'
    : hasAnyUpdate
      ? 'text-copper'
      : 'text-emerald-400'

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-main transition-colors">
            updates <span className={`${dotColor} transition-colors duration-500`}>{'\u25CF'}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="space-y-1">
            {error && (
              <div className="text-xs text-rose bg-rose/10 rounded px-2.5 py-1.5 break-all mb-1">
                {error}
              </div>
            )}
            {loading ? (
              <div className="text-text-dim text-xs text-center py-4">checking...</div>
            ) : status && jobsyInfo ? (
              <>
                <UpdateRow
                  label="jobsy"
                  info={jobsyInfo}
                  onUpdate={handleUpdateJobsy}
                  onShowVersions={() => setVersionModal('jobsy')}
                  disabled={isUpdating}
                />
                <UpdateRow
                  label="jobs"
                  info={status.agent}
                  onUpdate={handleUpdateJobs}
                  onShowVersions={() => setVersionModal('jobs')}
                  disabled={isUpdating}
                />
                {!steps && !showReload && (
                  <div className="pt-2 border-t border-line-faint">
                    <button
                      onClick={fetchStatus}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-main transition-colors"
                    >
                      <RotateCw className="w-3 h-3" />
                      проверить заново
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-text-dim text-xs text-center py-4">no data</div>
            )}
            {steps && (
              <div className="pt-2 border-t border-line-faint">
                <ProgressBar steps={steps} />
              </div>
            )}
            {showReload && (
              <div className="pt-2 border-t border-line-faint">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full text-xs text-center py-2 rounded bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 transition-colors"
                >
                  обновление завершено — перезагрузить
                </button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <VersionModal
        open={versionModal !== null}
        onClose={() => setVersionModal(null)}
        component={versionModal || ''}
      />
    </>
  )
}
