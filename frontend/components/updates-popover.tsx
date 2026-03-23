'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCw } from 'lucide-react'
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
    <div className="space-y-1.5 pt-2">
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

const MAX_CHANGELOG_ITEMS = 3

function cleanTitle(title: string): string {
  return title.replace(/^\[.*?]\s*/, '').trim()
}

function Changelog({ entries }: { entries: VersionEntry[] }) {
  const items = entries
    .filter(v => !v.is_current && v.pr_title)
    .map(v => cleanTitle(v.pr_title))
    .filter(Boolean)

  if (items.length === 0) return null

  const visible = items.slice(0, MAX_CHANGELOG_ITEMS)
  const remaining = items.length - visible.length

  return (
    <div className="py-2 space-y-1">
      {visible.map((title, i) => (
        <div key={i} className="text-xs text-text-dim leading-relaxed">
          <span className="text-text-dim mr-1.5">{'\u00B7'}</span>
          {title}
        </div>
      ))}
      {remaining > 0 && (
        <div className="text-xs text-text-dim/50 ml-3.5">
          {'и ещё'} {remaining}
        </div>
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
  const [showReload, setShowReload] = useState(false)
  const [changelog, setChangelog] = useState<VersionEntry[]>([])
  const healthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.checkUpdates()
      setStatus(data)

      // Load changelog from both components
      const hasJobsUpdate = data.agent.has_update || data.browser.has_update
      const hasJobsyUpdate = data.orchestrator.has_update || data.frontend.has_update
      if (hasJobsUpdate || hasJobsyUpdate) {
        const promises: Promise<VersionEntry[]>[] = []
        if (hasJobsyUpdate) promises.push(apiClient.getVersions('jobsy').catch(() => []))
        if (hasJobsUpdate) promises.push(apiClient.getVersions('jobs').catch(() => []))
        const results = await Promise.all(promises)
        setChangelog(results.flat())
      } else {
        setChangelog([])
      }
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

  /* ── Update handlers ── */

  const handleUpdateAll = async () => {
    setError(null)
    setShowReload(false)

    const needsJobs = status && (status.agent.has_update || status.browser.has_update)
    const needsJobsy = status && (status.orchestrator.has_update || status.frontend.has_update)

    const allSteps: ProgressStep[] = []
    if (needsJobs) {
      allSteps.push({ label: 'обновление агентов', status: 'pending' })
    }
    if (needsJobsy) {
      allSteps.push({ label: 'обновление платформы', status: 'pending' })
    }
    allSteps.push({ label: 'проверка', status: 'pending' })

    if (allSteps.length === 1) {
      allSteps.unshift({ label: 'обновление', status: 'pending' })
    }

    allSteps[0].status = 'active'
    setSteps([...allSteps])

    try {
      let stepIdx = 0

      if (needsJobs) {
        allSteps[stepIdx].status = 'active'
        setSteps([...allSteps])
        await apiClient.updateAgents()
        allSteps[stepIdx].status = 'done'
        stepIdx++
      }

      if (needsJobsy) {
        allSteps[stepIdx].status = 'active'
        setSteps([...allSteps])
        await apiClient.updatePlatform()
        allSteps[stepIdx].status = 'done'
        stepIdx++
      }

      // Final check step
      allSteps[stepIdx].status = 'active'
      setSteps([...allSteps])

      if (needsJobsy) {
        pollHealthcheck()
      } else {
        await fetchStatus()
        allSteps.forEach(s => s.status = 'done')
        setSteps([...allSteps])
        setTimeout(() => setSteps(null), 2500)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSteps(s => s && s.map(st =>
        st.status === 'active' ? { ...st, status: 'error' as const } : st
      ))
    }
  }

  const isUpdating = steps !== null && steps.some(s => s.status === 'active')
  const hasAnyUpdate = status && (
    status.agent.has_update || status.browser.has_update ||
    status.orchestrator.has_update || status.frontend.has_update
  )

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
      <PopoverContent className="w-[260px] p-3">
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
        ) : hasAnyUpdate ? (
          <div>
            {!steps && !showReload && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-main">Обновление доступно</span>
                  <button
                    onClick={fetchStatus}
                    disabled={loading}
                    className="text-text-dim hover:text-copper transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                {changelog.length > 0 && <Changelog entries={changelog} />}
                <button
                  onClick={handleUpdateAll}
                  disabled={isUpdating}
                  className="w-full h-8 mt-1 bg-copper hover:bg-copper/90 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-40"
                >
                  Обновить
                </button>
              </>
            )}
            {steps && <ProgressBar steps={steps} />}
            {showReload && (
              <button
                onClick={() => window.location.reload()}
                className="w-full h-8 text-sm text-center rounded-md bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 transition-colors"
              >
                Перезагрузить
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between h-9">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-sm text-text-dim">актуально</span>
            </div>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="text-text-dim hover:text-copper transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
