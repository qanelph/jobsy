'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCw, ExternalLink, ChevronDown } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { UpdateStatus, VersionEntry } from '@/types/updates'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

/* ── Progress ── */

interface ProgressStep {
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

function ProgressBar({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => {
        const color =
          step.status === 'done' ? 'text-emerald-400' :
          step.status === 'active' ? 'text-copper' :
          step.status === 'error' ? 'text-rose' : 'text-text-dim'
        return (
          <div key={i}
            className="flex items-center gap-2 transition-all duration-300"
            style={{ opacity: step.status === 'pending' ? 0.35 : 1 }}
          >
            <span className={`text-[10px] ${color} ${step.status === 'active' ? 'animate-pulse' : ''}`}>
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

/* ── Changelog ── */

const INITIAL_VISIBLE = 3

function cleanTitle(title: string): string {
  return title.replace(/^\[.*?]\s*/, '').trim()
}

function Changelog({ entries }: { entries: VersionEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const [openItem, setOpenItem] = useState<string | null>(null)

  const items = entries.filter(v => {
    const title = cleanTitle(v.pr_title || '')
    // Skip entries with no title or where title is just a commit hash
    return title && !/^[0-9a-f]{7,}$/i.test(title)
  })
  if (items.length === 0) return null

  // Find current index — everything at and after is "installed"
  const currentIdx = items.findIndex(v => v.is_current)

  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE)
  const hasMore = items.length > INITIAL_VISIBLE

  return (
    <div className="py-1.5 space-y-0.5">
      {visible.map((entry, idx) => {
        const title = cleanTitle(entry.pr_title)
        const isOpen = openItem === entry.sha
        const hasBody = !!entry.pr_body?.trim()
        const canExpand = hasBody || entry.pr_url

        // Determine if this version is installed
        const realIdx = expanded ? idx : idx // visible index maps to items index
        const itemIdx = expanded ? idx : items.indexOf(entry)
        const isInstalled = currentIdx >= 0 && itemIdx >= currentIdx
        const isCurrent = entry.is_current

        const dotColor = isInstalled ? 'text-emerald-400/70' : 'text-text-dim/40'
        const dot = isInstalled ? '\u25A0' : '\u25A1'

        return (
          <div key={entry.sha}>
            <button
              onClick={() => canExpand && setOpenItem(isOpen ? null : entry.sha)}
              className={`w-full text-left flex items-center gap-1.5 py-0.5 text-xs leading-snug transition-colors ${
                canExpand ? 'hover:text-text-main cursor-pointer' : 'cursor-default'
              } ${isOpen ? 'text-text-main' : isInstalled ? 'text-text-dim/60' : 'text-text-dim'}`}
            >
              <span className={`${dotColor} shrink-0 text-[10px]`}>{dot}</span>
              <span className="flex-1 truncate">{title}</span>
              {canExpand && (
                <ChevronDown className={`w-3 h-3 mt-0.5 shrink-0 text-text-dim/40 transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`} />
              )}
            </button>
            <div className={`overflow-hidden transition-all duration-200 ${
              isOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
            }`}>
              <div className="ml-3 pl-2 border-l border-line-faint mb-1">
                {hasBody && (
                  <p className="text-[11px] text-text-dim/70 leading-relaxed whitespace-pre-wrap line-clamp-4">
                    {entry.pr_body.trim()}
                  </p>
                )}
                {entry.pr_url && (
                  <a
                    href={entry.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-copper hover:underline mt-1"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    GitHub
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-text-dim/50 hover:text-text-dim ml-3.5 transition-colors"
        >
          {expanded ? 'свернуть' : `и ещё ${items.length - INITIAL_VISIBLE}`}
        </button>
      )}
    </div>
  )
}

/* ── Update Block ── */

function UpdateBlock({
  label,
  entries,
  hasUpdate,
  onUpdate,
  disabled,
}: {
  label: string
  entries: VersionEntry[]
  hasUpdate: boolean
  onUpdate: () => void
  disabled: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-text-dim uppercase tracking-wider">{label}</span>
        {hasUpdate ? (
          <button
            onClick={onUpdate}
            disabled={disabled}
            className="text-xs text-copper hover:underline disabled:opacity-40 transition-opacity"
          >
            обновить
          </button>
        ) : (
          <span className="text-xs text-emerald-400/70">обновлений нет</span>
        )}
      </div>
      <Changelog entries={entries} />
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
  const [showReload, setShowReload] = useState(false)
  const [jobsyChangelog, setJobsyChangelog] = useState<VersionEntry[]>([])
  const [jobsChangelog, setJobsChangelog] = useState<VersionEntry[]>([])
  const healthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.checkUpdates()
      setStatus(data)

      // Always load changelogs to show installed versions
      const [jobsyVersions, jobsVersions] = await Promise.all([
        apiClient.getVersions('jobsy').catch(() => []),
        apiClient.getVersions('jobs').catch(() => []),
      ])
      setJobsyChangelog(jobsyVersions)
      setJobsChangelog(jobsVersions)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Check on mount (for dot color) and on open (for fresh data)
  useEffect(() => { fetchStatus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    let attempts = 0
    const maxAttempts = 40 // 40 × 3s = 2 min timeout
    healthPollRef.current = setInterval(async () => {
      attempts++
      try {
        const resp = await fetch('/api/health')
        if (resp.ok) {
          if (healthPollRef.current) clearInterval(healthPollRef.current)
          setSteps(s => s && s.map(st => ({ ...st, status: 'done' as const })))
          setShowReload(true)
          return
        }
      } catch {
        // still restarting
      }
      if (attempts >= maxAttempts) {
        if (healthPollRef.current) clearInterval(healthPollRef.current)
        setError('Сервер не отвечает после обновления. Попробуйте перезагрузить вручную.')
        setSteps(s => s && s.map(st =>
          st.status === 'active' ? { ...st, status: 'error' as const } : st
        ))
        setShowReload(true)
      }
    }, 3000)
  }

  /* ── Update handlers ── */

  const handleUpdateJobs = async () => {
    setError(null)
    const s: ProgressStep[] = [
      { label: 'обновление jobs', status: 'active' },
      { label: 'проверка', status: 'pending' },
    ]
    setSteps([...s])
    try {
      await apiClient.updateAgents()
      s[0].status = 'done'
      s[1].status = 'active'
      setSteps([...s])
      await fetchStatus()
      s[1].status = 'done'
      setSteps([...s])
      setTimeout(() => setSteps(null), 2500)
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
    const s: ProgressStep[] = [
      { label: 'обновление jobsy', status: 'active' },
      { label: 'ожидание перезапуска', status: 'pending' },
    ]
    setSteps([...s])
    try {
      await apiClient.updatePlatform()
      s[0].status = 'done'
      s[1].status = 'active'
      setSteps([...s])
      pollHealthcheck()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSteps(s => s && s.map(st =>
        st.status === 'active' ? { ...st, status: 'error' as const } : st
      ))
    }
  }

  const isUpdating = steps !== null && steps.some(s => s.status === 'active')

  const jobsHasUpdate = !!(status && (status.agent.has_update || status.browser.has_update))
  const jobsyHasUpdate = !!(status && (status.orchestrator.has_update || status.frontend.has_update))
  const hasAnyUpdate = jobsHasUpdate || jobsyHasUpdate

  const dotColor = !status
    ? 'text-text-dim'
    : hasAnyUpdate
      ? 'text-copper'
      : 'text-emerald-400'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-main transition-colors">
          updates <span className={`${dotColor} transition-colors duration-500`}>{'\u25CF'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3">
        {error && (
          <div className="text-xs text-rose bg-rose/10 rounded px-2.5 py-1.5 break-all mb-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-9">
            <RotateCw className="w-3.5 h-3.5 text-text-dim animate-spin" />
          </div>
        ) : !status ? (
          <div className="flex items-center justify-between h-9">
            <span className="text-sm text-text-dim">Проверить обновления</span>
            <button onClick={fetchStatus} className="text-text-dim hover:text-copper transition-colors">
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div>
            {!steps && !showReload && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-text-main">
                    {hasAnyUpdate ? 'Обновления' : 'Версии'}
                  </span>
                  <button
                    onClick={fetchStatus}
                    disabled={loading}
                    className="text-text-dim hover:text-copper transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <UpdateBlock
                    label="jobsy"
                    entries={jobsyChangelog}
                    hasUpdate={jobsyHasUpdate}
                    onUpdate={handleUpdateJobsy}
                    disabled={isUpdating}
                  />
                  <UpdateBlock
                    label="jobs"
                    entries={jobsChangelog}
                    hasUpdate={jobsHasUpdate}
                    onUpdate={handleUpdateJobs}
                    disabled={isUpdating}
                  />
                </div>
              </>
            )}
            {steps && <ProgressBar steps={steps} />}
            {showReload && (
              <button
                onClick={() => window.location.reload()}
                className="w-full h-8 mt-3 text-sm text-center rounded-md bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 transition-colors"
              >
                Перезагрузить
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
