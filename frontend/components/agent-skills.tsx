'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { ChevronDown, Copy, Download, RefreshCw, Trash2, Upload } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAgentsStore } from '@/store/agents'
import type { Skill, SkillImportResult } from '@/types/agent'

interface AgentSkillsListProps {
  agentId: number
  agentRunning: boolean
}

interface PendingImport {
  results: SkillImportResult[]
  retry?: (names: string[]) => Promise<void>
}

function parseSkillName(content: string): string | null {
  if (!content.startsWith('---')) return null
  const end = content.indexOf('---', 3)
  if (end < 0) return null
  const fm = content.slice(3, end)
  for (const line of fm.split('\n')) {
    const trimmed = line.trim()
    const m = /^name\s*:\s*(.*)$/.exec(trimmed)
    if (m) {
      // Снять опциональные кавычки и комментарий, оставить голое имя.
      let value = m[1].trim()
      const hash = value.indexOf('#')
      if (hash >= 0) value = value.slice(0, hash).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      return value || null
    }
  }
  return null
}

function isValidName(name: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(name)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Откладываем revoke — синхронный вызов после click() в некоторых браузерах
  // (Safari/Firefox) прерывает скачивание.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// Кастомные чекбоксы под dark-палитру (нативные выглядят как белые квадраты).
const CHECKBOX_CLASS =
  'appearance-none w-3.5 h-3.5 rounded-sm bg-panel border border-line-subtle ' +
  'checked:bg-copper checked:border-copper ' +
  "relative checked:after:content-['✓'] checked:after:absolute checked:after:inset-0 " +
  'checked:after:flex checked:after:items-center checked:after:justify-center ' +
  'checked:after:text-[10px] checked:after:text-void checked:after:font-bold ' +
  'focus:outline-none focus:ring-1 focus:ring-copper/40 transition-colors cursor-pointer'

function statusBadge(status: SkillImportResult['status']): string {
  if (status === 'created') return 'text-emerald-400'
  if (status === 'replaced') return 'text-emerald-400'
  if (status === 'skipped') return 'text-copper'
  return 'text-rose'
}

interface SkillRowProps {
  agentId: number
  skill: Skill
  selected: boolean
  onToggle: () => void
  onChanged: () => void
}

function SkillRow({ agentId, skill, selected, onToggle, onChanged }: SkillRowProps) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const expand = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (content !== null) return
    setLoading(true)
    try {
      const data = await apiClient.getAgentSkill(agentId, skill.name)
      setContent(data.content)
    } catch {
      setContent('— не удалось загрузить —')
    } finally {
      setLoading(false)
    }
  }

  const downloadSingle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const data = content ?? (await apiClient.getAgentSkill(agentId, skill.name)).content
      downloadBlob(new Blob([data], { type: 'text/markdown' }), `${skill.name}.md`)
    } catch (err) {
      alert(`Не удалось скачать: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  const deleteSingle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Удалить скилл "${skill.name}"?`)) return
    try {
      await apiClient.deleteAgentSkill(agentId, skill.name)
      onChanged()
    } catch (err) {
      alert(`Не удалось удалить: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return (
    <div className="bg-panel border border-line-faint rounded">
      <div className="flex items-start gap-2 px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className={`mt-1 shrink-0 ${CHECKBOX_CLASS}`}
        />
        <button
          type="button"
          onClick={expand}
          aria-expanded={open}
          className="flex-1 min-w-0 text-left hover:bg-hover -mx-2 px-2 py-0.5 rounded cursor-pointer"
        >
          <div className="text-xs text-text-main truncate">{skill.name}</div>
          {skill.description && (
            <div className="text-[10px] text-text-dim mt-0.5 truncate">{skill.description}</div>
          )}
        </button>
        <button
          type="button"
          onClick={downloadSingle}
          title="скачать .md"
          className="text-text-dim hover:text-text-main shrink-0"
        >
          <Download size={12} />
        </button>
        <button
          type="button"
          onClick={deleteSingle}
          title="удалить"
          className="text-text-dim hover:text-rose shrink-0"
        >
          <Trash2 size={12} />
        </button>
        <ChevronDown
          size={12}
          className={`shrink-0 mt-1 text-text-dim transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {open && (
        <div className="px-3 pb-2 border-t border-line-faint pt-2">
          {loading ? (
            <div className="text-text-dim text-[11px]">загрузка...</div>
          ) : (
            <pre className="text-[11px] text-text-dim font-mono whitespace-pre-wrap break-words">
              {content ?? ''}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

interface ImportResultModalProps {
  pending: PendingImport
  onClose: () => void
  onRetry: (names: string[]) => Promise<void>
}

function ImportResultModal({ pending, onClose, onRetry }: ImportResultModalProps) {
  const [retrying, setRetrying] = useState(false)
  const skipped = pending.results.filter((r) => r.status === 'skipped').map((r) => r.name)

  const counts = useMemo(() => {
    const c = { created: 0, replaced: 0, skipped: 0, error: 0 }
    for (const r of pending.results) c[r.status]++
    return c
  }, [pending])

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await onRetry(skipped)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-panel border border-line-faint rounded p-4 max-w-lg w-full max-h-[80vh] overflow-y-auto space-y-3">
        <div className="text-sm text-text-main">Импорт скиллов</div>
        <div className="text-xs text-text-dim flex flex-wrap gap-x-3">
          {counts.created > 0 && <span className="text-emerald-400">создано: {counts.created}</span>}
          {counts.replaced > 0 && <span className="text-emerald-400">заменено: {counts.replaced}</span>}
          {counts.skipped > 0 && <span className="text-copper">пропущено: {counts.skipped}</span>}
          {counts.error > 0 && <span className="text-rose">ошибок: {counts.error}</span>}
        </div>
        <div className="space-y-1 text-[11px] font-mono">
          {pending.results.map((r) => (
            <div key={r.name} className="flex gap-2">
              <span className={`shrink-0 w-16 ${statusBadge(r.status)}`}>{r.status}</span>
              <span className="text-text-main truncate">{r.name}</span>
              {r.error && <span className="text-rose">— {r.error}</span>}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          {skipped.length > 0 && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="px-3 py-1 text-xs bg-copper/20 hover:bg-copper/30 text-copper rounded disabled:opacity-50"
            >
              {retrying ? '...' : `заменить пропущенные (${skipped.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={retrying}
            className="px-3 py-1 text-xs bg-hover hover:bg-hover/70 text-text-main rounded disabled:opacity-50"
          >
            закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

export function AgentSkillsList({ agentId, agentRunning }: AgentSkillsListProps) {
  const [items, setItems] = useState<Skill[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const agentsStore = useAgentsStore((s) => s.agents)

  // Защита от race при быстром переключении агентов: каждый load инкрементит
  // ticket, и устаревшие ответы игнорируются при setState.
  const loadTicket = useRef(0)

  const load = async () => {
    if (!agentRunning) {
      setItems(null)
      return
    }
    const my = ++loadTicket.current
    setLoading(true)
    setError(false)
    try {
      const data = await apiClient.listAgentSkills(agentId)
      if (my !== loadTicket.current) return
      setItems(data.items)
      setSelected((prev) => {
        const names = new Set(data.items.map((s) => s.name))
        const next = new Set<string>()
        prev.forEach((n) => names.has(n) && next.add(n))
        return next
      })
    } catch {
      if (my !== loadTicket.current) return
      setItems(null)
      setError(true)
    } finally {
      if (my === loadTicket.current) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    return () => {
      // Инвалидируем in-flight load — его setState не пройдут.
      loadTicket.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, agentRunning])

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    if (!items) return
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map((s) => s.name)))
    }
  }

  const withBusy = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label)
    try {
      return await fn()
    } catch (err) {
      alert(`Ошибка (${label}): ${err instanceof Error ? err.message : 'unknown'}`)
      return undefined
    } finally {
      setBusy(null)
    }
  }

  const downloadSelected = () =>
    withBusy('downloading', async () => {
      if (selected.size === 0) return
      const names = [...selected]
      if (names.length === 1) {
        const data = await apiClient.getAgentSkill(agentId, names[0])
        downloadBlob(new Blob([data.content], { type: 'text/markdown' }), `${names[0]}.md`)
        return
      }
      const blob = await apiClient.bulkExportSkills(agentId, names)
      downloadBlob(blob, 'skills.zip')
    })

  const deleteSelected = () =>
    withBusy('deleting', async () => {
      if (selected.size === 0) return
      if (!confirm(`Удалить ${selected.size} скилл(а)?`)) return
      // allSettled — частичные удаления не должны откатывать остальные.
      const results = await Promise.allSettled(
        [...selected].map((n) => apiClient.deleteAgentSkill(agentId, n)),
      )
      await load()
      const failed = results.filter((r) => r.status === 'rejected')
      if (failed.length > 0) {
        alert(`Не удалось удалить ${failed.length} скилл(ов). См. консоль для деталей.`)
      }
    })

  // Загрузка одного .md с обработкой 409
  const uploadSingleMd = (file: File) =>
    withBusy('uploading', async () => {
      const text = await file.text()
      const name = parseSkillName(text) || file.name.replace(/\.md$/i, '')
      if (!isValidName(name)) {
        alert(`Невалидное имя скилла: "${name}". Допустимы только буквы/цифры/_/-.`)
        return
      }
      try {
        await apiClient.putAgentSkill(agentId, name, text, false)
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 409) {
          if (!confirm(`Скилл "${name}" уже существует. Заменить?`)) return
          await apiClient.putAgentSkill(agentId, name, text, true)
        } else {
          throw e
        }
      }
      await load()
    })

  // Загрузка нескольких .md серией PUT с обработкой конфликтов
  const uploadMultipleMd = (files: File[]) =>
    withBusy('uploading', () => uploadMultipleMdImpl(files))

  const uploadMultipleMdImpl = async (files: File[]) => {
    const results: SkillImportResult[] = []
    const contents = new Map<string, string>()
    for (const file of files) {
      const text = await file.text()
      const name = parseSkillName(text) || file.name.replace(/\.md$/i, '')
      if (!isValidName(name)) {
        results.push({ name, status: 'error', error: 'invalid name' })
        continue
      }
      contents.set(name, text)
      try {
        await apiClient.putAgentSkill(agentId, name, text, false)
        results.push({ name, status: 'created', error: null })
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 409) {
          results.push({ name, status: 'skipped', error: null })
        } else {
          results.push({
            name,
            status: 'error',
            error: e instanceof Error ? e.message : 'unknown',
          })
        }
      }
    }
    setPendingImport({
      results,
      retry: async (names) => {
        const more: SkillImportResult[] = []
        for (const name of names) {
          const text = contents.get(name)
          if (!text) continue
          try {
            await apiClient.putAgentSkill(agentId, name, text, true)
            more.push({ name, status: 'replaced', error: null })
          } catch (e) {
            more.push({
              name,
              status: 'error',
              error: e instanceof Error ? e.message : 'unknown',
            })
          }
        }
        // Обновим в текущем pending
        setPendingImport((prev) => {
          if (!prev) return prev
          const byName = new Map(more.map((r) => [r.name, r]))
          return {
            ...prev,
            results: prev.results.map((r) => byName.get(r.name) ?? r),
          }
        })
        await load()
      },
    })
    await load()
  }

  const uploadZip = (file: File) =>
    withBusy('uploading', async () => {
      const resp = await apiClient.bulkImportSkills(agentId, file, false)
      setPendingImport({
        results: resp.results,
        retry: async (names) => {
          // Тот же архив повторно, но сервер обрабатывает только пропущенные имена
          // (?names=…) — успешно созданные/ошибочные при первом проходе НЕ перезаписываются.
          const retry = await apiClient.bulkImportSkills(agentId, file, true, names)
          setPendingImport((prev) => {
            if (!prev) return prev
            const byName = new Map(retry.results.map((r) => [r.name, r]))
            return {
              ...prev,
              results: prev.results.map((r) => byName.get(r.name) ?? r),
            }
          })
          await load()
        },
      })
      await load()
    })

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    const zips = files.filter((f) => f.name.toLowerCase().endsWith('.zip'))
    const mds = files.filter((f) => f.name.toLowerCase().endsWith('.md'))

    if (zips.length === 1 && mds.length === 0) {
      await uploadZip(zips[0])
      return
    }
    if (mds.length === 1 && zips.length === 0) {
      await uploadSingleMd(mds[0])
      return
    }
    if (mds.length > 1 && zips.length === 0) {
      await uploadMultipleMd(mds)
      return
    }
    alert('Загрузите либо один .zip, либо один или несколько .md файлов.')
  }

  // Скопировать выбранные в другого агента
  const copyTo = (dstAgentId: number) =>
    withBusy('copying', async () => {
      if (selected.size === 0) return
      const blob = await apiClient.bulkExportSkills(agentId, [...selected])
      const file = new File([blob], 'skills.zip', { type: 'application/zip' })
      const resp = await apiClient.bulkImportSkills(dstAgentId, file, false)
      setPendingImport({
        results: resp.results,
        retry: async (names) => {
          const filtered = await apiClient.bulkExportSkills(agentId, names)
          const f = new File([filtered], 'skills.zip', { type: 'application/zip' })
          const retry = await apiClient.bulkImportSkills(dstAgentId, f, true)
          setPendingImport((prev) => {
            if (!prev) return prev
            const byName = new Map(retry.results.map((r) => [r.name, r]))
            return {
              ...prev,
              results: prev.results.map((r) => byName.get(r.name) ?? r),
            }
          })
        },
      })
    })

  if (!agentRunning) {
    return <div className="text-text-dim text-xs">доступно для запущенного агента</div>
  }

  if (loading && !items) {
    return <div className="text-text-dim text-xs">загрузка...</div>
  }

  if (error) {
    return <div className="text-text-dim text-xs">не удалось загрузить</div>
  }

  const otherRunning = agentsStore.filter((a) => a.id !== agentId && a.status === 'running')
  const hasItems = items && items.length > 0
  const allSelected = items && selected.size === items.length && items.length > 0

  const nothingSelected = selected.size === 0
  const openFilePicker = () => fileInputRef.current?.click()

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.zip"
        multiple
        onChange={onUpload}
        className="hidden"
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {hasItems && (
            <label className="flex items-center gap-1.5 text-text-dim text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={!!allSelected}
                onChange={toggleAll}
                className={CHECKBOX_CLASS}
              />
              {selected.size > 0 ? `выбрано: ${selected.size}` : 'выбрать все'}
            </label>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openFilePicker}
            disabled={!!busy}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-hover hover:bg-hover/70 text-text-main rounded disabled:opacity-50"
            title="загрузить .md или .zip"
          >
            <Upload size={12} />
            <span>загрузить</span>
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            title="обновить"
            className="text-text-dim hover:text-text-main disabled:opacity-50 px-1"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {hasItems && (
        <div className="flex items-center gap-1.5 flex-wrap bg-hover/50 px-2 py-1.5 rounded text-xs">
          <button
            type="button"
            onClick={downloadSelected}
            disabled={!!busy || nothingSelected}
            className="flex items-center gap-1 text-text-main hover:text-copper disabled:opacity-30"
          >
            <Download size={12} />
            <span>{nothingSelected ? 'скачать' : `скачать (${selected.size})`}</span>
          </button>
          <span className="text-text-dim">|</span>
          <CopyToMenu
            disabled={!!busy || nothingSelected || otherRunning.length === 0}
            agents={otherRunning}
            onSelect={copyTo}
          />
          <span className="text-text-dim">|</span>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={!!busy || nothingSelected}
            className="flex items-center gap-1 text-text-main hover:text-rose disabled:opacity-30"
          >
            <Trash2 size={12} />
            <span>удалить</span>
          </button>
        </div>
      )}

      {hasItems ? (
        <div className="space-y-1.5">
          {items.map((s) => (
            <SkillRow
              key={s.name}
              agentId={agentId}
              skill={s}
              selected={selected.has(s.name)}
              onToggle={() => toggle(s.name)}
              onChanged={load}
            />
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-line-faint rounded p-6 flex flex-col items-center justify-center gap-3">
          <div className="text-text-dim text-xs">Скиллов пока нет</div>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-copper/10 hover:bg-copper/20 text-copper border border-copper/30 rounded disabled:opacity-50"
          >
            <Upload size={12} />
            <span>Загрузить скилл</span>
          </button>
          <div className="text-[10px] text-text-dim">принимает .md или .zip</div>
        </div>
      )}

      {pendingImport && (
        <ImportResultModal
          pending={pendingImport}
          onClose={() => setPendingImport(null)}
          onRetry={async (names) => {
            await pendingImport.retry?.(names)
          }}
        />
      )}
    </div>
  )
}

interface CopyToMenuProps {
  disabled: boolean
  agents: { id: number; name: string }[]
  onSelect: (id: number) => void
}

function CopyToMenu({ disabled, agents, onSelect }: CopyToMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={agents.length === 0 ? 'нет других запущенных агентов' : 'скопировать в…'}
        className="flex items-center gap-1 text-text-main hover:text-copper disabled:opacity-50"
      >
        <Copy size={12} />
        <span>скопировать в…</span>
      </button>
      {open && (
        <div className="absolute z-10 right-0 mt-1 bg-panel border border-line-faint rounded shadow-lg min-w-[160px] py-1">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setOpen(false)
                onSelect(a.id)
              }}
              className="w-full text-left px-3 py-1 text-xs text-text-main hover:bg-hover"
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

