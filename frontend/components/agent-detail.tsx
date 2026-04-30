'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Eye, EyeOff, CircleHelp } from 'lucide-react'
import { TelethonAuth } from '@/components/telethon-auth'
import { UsageChart } from '@/components/usage-chart'
import type { Agent, AgentConfig, AgentConfigField, UpdateAgentRequest } from '@/types/agent'
import type { UsagePeriod, UsageSnapshot } from '@/types/usage'
import { useAgentsStore } from '@/store/agents'
import { apiClient } from '@/lib/api'
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDraggable,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

const statusLabel: Record<string, { symbol: string; text: string; color: string }> = {
  running: { symbol: '\u25CF', text: 'running', color: 'text-emerald-400' },
  creating: { symbol: '\u25CF', text: 'creating...', color: 'text-copper' },
  stopping: { symbol: '\u25CF', text: 'stopping...', color: 'text-copper' },
  stopped: { symbol: '\u25CB', text: 'stopped', color: 'text-text-dim' },
  error: { symbol: '\u2715', text: 'error', color: 'text-rose' },
  deleted: { symbol: '\u2715', text: 'deleted', color: 'text-text-dim' },
}

// live config key → env var key
const ENV_KEY_OVERRIDES: Record<string, string> = { timezone: 'TZ' }
const toEnvKey = (key: string): string => ENV_KEY_OVERRIDES[key] ?? key.toUpperCase()

// Hints shown via ? tooltip next to inputs
const FIELD_HINTS: Record<string, string> = {
  tg_api_id: '12345678',
  tg_api_hash: '0123456789abcdef...',
  tg_bot_token: '1234567890:AAG...',
  tg_user_id: '123456789',
  tg_owner_ids: '123456789, 987654321',
  anthropic_api_key: 'sk-ant-...',
  claude_model: 'claude-opus-4-6',
  http_proxy: 'http://user:pass@host:port',
  openai_api_key: 'sk-proj-...',
  timezone: 'Europe/Moscow',
  heartbeat_interval_minutes: '30',
}

// --- Draggable config item ---

function DraggableConfigItem({
  id,
  label,
  inputType,
  value,
  isGlobal,
  placeholder,
  description,
  revealed,
  error,
  onReveal,
  onChange,
}: {
  id: string
  label: string
  inputType: 'text' | 'password' | 'number'
  value: string | number
  isGlobal: boolean
  placeholder?: string
  description?: string
  revealed: boolean
  error?: string | null
  onReveal: () => void
  onChange: (value: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  const isSecret = inputType === 'password'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded px-2 py-1 transition-opacity ${isDragging ? 'opacity-40' : ''}`}
    >
      <span
        {...listeners}
        {...attributes}
        className="text-text-dim hover:text-text-main cursor-grab active:cursor-grabbing text-[10px] shrink-0 select-none"
      >
        {'\u2261'}
      </span>
      <label className="w-36 text-xs text-text-dim shrink-0 truncate">{label}</label>
      <div className="flex-1">
        <div className="relative">
          <input
            type={isSecret && !revealed ? 'password' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="[NULL]"
            className={`w-full h-7 bg-panel border rounded px-2 ${isSecret ? 'pr-8' : ''} text-xs placeholder:text-text-dim/40 focus:outline-none font-mono ${
              error ? 'border-rose/60 focus:border-rose' : 'border-line-faint focus:border-line-subtle'
            } ${isGlobal ? 'text-text-dim' : 'text-text-main'}`}
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {(() => {
              const hint = description || placeholder || FIELD_HINTS[id]
              return hint ? (
                <div className="relative group">
                  <CircleHelp size={12} className="text-text-dim group-hover:text-text-main cursor-help" />
                  <div className="absolute hidden group-hover:block bottom-full right-0 mb-1 px-2 py-1 bg-active border border-line-subtle rounded text-[10px] text-text-dim whitespace-nowrap z-50 pointer-events-none">
                    {hint}
                  </div>
                </div>
              ) : null
            })()}
            {isSecret && (
              <button type="button" onClick={onReveal} className="text-text-dim hover:text-text-main">
                {revealed ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            )}
          </div>
        </div>
        {error && <div className="text-[9px] text-rose mt-0.5 pl-1">{error}</div>}
      </div>
    </div>
  )
}

// --- Droppable lane ---

function DropLane({ id, label, hint, children }: { id: string; label: string; hint: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`rounded border transition-colors ${isOver ? 'border-copper/40 bg-copper/5' : 'border-line-faint'}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line-faint">
        <span className="text-[10px] font-mono font-bold text-text-dim uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-text-dim">{hint}</span>
      </div>
      <div className="px-1 py-1 space-y-0.5 min-h-[32px]">{children}</div>
    </div>
  )
}

// --- Bot info ---

interface BotInfo { username: string; first_name: string; photo_url: string | null }

async function fetchBotInfo(token: string): Promise<BotInfo | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json()
    if (!data.ok) return null
    const bot = data.result
    let photoUrl: string | null = null
    const photosRes = await fetch(`https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${bot.id}&limit=1`)
    const photosData = await photosRes.json()
    if (photosData.ok && photosData.result.total_count > 0) {
      const fileId = photosData.result.photos[0][0].file_id
      const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)
      const fileData = await fileRes.json()
      if (fileData.ok) photoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`
    }
    return { username: bot.username, first_name: bot.first_name, photo_url: photoUrl }
  } catch { return null }
}

// --- Helpers ---

const deriveInputType = (field: AgentConfigField): 'text' | 'password' | 'number' => {
  if (field.type === 'secret') return 'password'
  if (field.type === 'int') return 'number'
  return 'text'
}

const isListType = (field: AgentConfigField): boolean =>
  Boolean(field.type?.startsWith('list['))

const validateFieldValue = (value: string | number, field: AgentConfigField): string | null => {
  const str = String(value).trim()
  if (!str) return null
  switch (field.type) {
    case 'int':
      return /^-?\d+$/.test(str) ? null : 'целое число'
    case 'list[int]': {
      if (!str.startsWith('[') || !str.endsWith(']')) return 'формат: [1, 2, 3]'
      const inner = str.slice(1, -1).trim()
      if (!inner) return null // пустой список []
      return inner.split(',').every(s => /^-?\d+$/.test(s.trim())) ? null : 'формат: [1, 2, 3]'
    }
    case 'list[str]':
      return str.split(',').length > 0 ? null : 'значения через запятую'
    default:
      return null
  }
}

// --- Main component ---

// Поля, у которых есть выделенный UI — не дублируем их в общем DnD-конфиге.
const HIDDEN_CONFIG_KEYS = new Set(['ignore_external_users'])

interface IgnoreExternalToggleProps {
  agentId: number
  agentRunning: boolean
  value: boolean
  onChange: (next: boolean) => void
}

function IgnoreExternalToggle({ agentId, agentRunning, value, onChange }: IgnoreExternalToggleProps) {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (!agentRunning || busy) return
    const next = !value
    setBusy(true)
    // Оптимистичный UI: применяем сразу, откатываем при ошибке.
    onChange(next)
    try {
      await apiClient.patchAgentSettings(agentId, { ignore_external_users: next })
    } catch {
      onChange(value)
    } finally {
      setBusy(false)
    }
  }

  const disabled = !agentRunning || busy

  return (
    <div className="flex items-center justify-between">
      <div>
        <label className="block text-text-dim text-xs">игнорировать чужих</label>
        <span className="text-text-dim text-[10px]">
          {agentRunning
            ? 'бот не отвечает никому кроме админов'
            : 'доступно у запущенного агента'}
        </span>
      </div>
      <button
        onClick={toggle}
        disabled={disabled}
        className={`w-8 h-4 rounded-full relative transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          value ? 'bg-copper' : 'bg-line-subtle'
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-text-bright transition-all ${
            value ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}


interface AgentDetailProps { agent: Agent; onDeleted: () => void }

export function AgentDetail({ agent, onDeleted }: AgentDetailProps) {
  const { updateAgent, startAgent, stopAgent, deleteAgent, restartAgent } = useAgentsStore()

  const [tgToken, setTgToken] = useState('')
  const [editingToken, setEditingToken] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [browserEnabled, setBrowserEnabled] = useState(true)
  const [envVars, setEnvVars] = useState<Record<string, string>>({})
  const [globalConfig, setGlobalConfig] = useState<Record<string, string>>({})
  const [newEnvKey, setNewEnvKey] = useState('')
  const [newEnvValue, setNewEnvValue] = useState('')
  const [showCustomEnv, setShowCustomEnv] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const restartKey = `jobsy:needsRestart:${agent.id}`
  const [needsRestart, setNeedsRestartRaw] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(restartKey) === '1'
  })
  const setNeedsRestart = useCallback((v: boolean) => {
    setNeedsRestartRaw(v)
    if (v) localStorage.setItem(restartKey, '1')
    else localStorage.removeItem(restartKey)
  }, [restartKey])
  const needsRestartRef = useRef(needsRestart)
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null)
  const [botLoading, setBotLoading] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Live config from agent
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null)
  const [configDraft, setConfigDraft] = useState<Record<string, string | number>>({})
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({})

  // Usage chart
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>('7d')
  const [usageSnapshots, setUsageSnapshots] = useState<UsageSnapshot[]>([])
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageReloadTick, setUsageReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setUsageLoading(true)
    apiClient
      .getAgentUsage(agent.id, usagePeriod)
      .then((res) => {
        if (cancelled) return
        setUsageSnapshots(res.snapshots)
      })
      .catch(() => {
        if (cancelled) return
        setUsageSnapshots([])
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false)
      })
    return () => { cancelled = true }
  }, [agent.id, usagePeriod, usageReloadTick])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const resetFields = useCallback(() => {
    setTgToken(agent.telegram_bot_token ?? '')
    setInstructions(agent.custom_instructions ?? '')
    setBrowserEnabled(agent.browser_enabled)
    setEnvVars(agent.env_vars ?? {})
    setDirty(false)
    setNeedsRestart(needsRestartRef.current)
    setEditingToken(false)
    setNewEnvKey('')
    setNewEnvValue('')
    setFieldErrors({})
  }, [agent])

  useEffect(() => { resetFields() }, [resetFields])

  useEffect(() => {
    apiClient.getGlobalConfig().then(({ env_vars }) => setGlobalConfig(env_vars)).catch(() => {})
  }, [])

  // Fetch live config when agent is running (with retry)
  useEffect(() => {
    if (agent.status !== 'running') {
      setAgentConfig(null)
      setConfigDraft({})
      setConfigError(null)
      return
    }
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>
    const load = (attempt = 0) => {
      setConfigLoading(true)
      setConfigError(null)
      apiClient.getAgentSettings(agent.id)
        .then((config) => {
          if (cancelled) return
          setAgentConfig(config)
          setConfigDraft({})
          setRevealedKeys(new Set())
          setFieldErrors({})
        })
        .catch(() => {
          if (cancelled) return
          if (attempt < 3) {
            retryTimer = setTimeout(() => load(attempt + 1), 3000)
          } else {
            setConfigError('не удалось загрузить конфиг')
          }
        })
        .finally(() => { if (!cancelled) setConfigLoading(false) })
    }
    load()
    return () => { cancelled = true; clearTimeout(retryTimer) }
  }, [agent.id, agent.status])

  useEffect(() => {
    if (!agent.telegram_bot_token) { setBotInfo(null); return }
    setBotLoading(true)
    fetchBotInfo(agent.telegram_bot_token).then((info) => { setBotInfo(info); setBotLoading(false) })
  }, [agent.telegram_bot_token])

  // --- Config scope helpers ---

  const getScope = (configKey: string): 'global' | 'local' => {
    const envKey = toEnvKey(configKey)
    return envKey in envVars ? 'local' : 'global'
  }

  const getConfigValue = (key: string): string | number => {
    if (key in configDraft) return configDraft[key]
    // Prefer persisted env_var value (local or global) over live config
    const envKey = toEnvKey(key)
    if (envKey in envVars && envVars[envKey] !== '') return envVars[envKey]
    if (envKey in globalConfig && globalConfig[envKey] !== '') return globalConfig[envKey]
    const raw = agentConfig?.[key]?.value
    if (raw === null || raw === undefined) return ''
    if (Array.isArray(raw)) return raw.join(', ')
    if (typeof raw === 'boolean') return raw ? 'true' : 'false'
    return raw
  }

  const setConfigFieldValue = (key: string, value: string) => {
    const field = agentConfig?.[key]
    const parsed: string | number = field && deriveInputType(field) === 'number' ? Number(value) : value
    setConfigDraft(prev => ({ ...prev, [key]: parsed }))
    if (field) {
      const err = validateFieldValue(value, field)
      setFieldErrors(prev => ({ ...prev, [key]: err }))
    }
    setDirty(true)
  }

  const hasValidationErrors = Object.values(fieldErrors).some(Boolean)

  const isMutable = (field: AgentConfigField) => field.mutable

  const handleReveal = async (key: string) => {
    if (revealedKeys.has(key)) {
      setRevealedKeys(prev => { const next = new Set(prev); next.delete(key); return next })
      return
    }
    const unmasked = await apiClient.getAgentSettings(agent.id, true).catch(() => null)
    if (!unmasked?.[key]) return
    setAgentConfig(prev => prev ? { ...prev, [key]: { ...prev[key], value: unmasked[key].value } } : prev)
    setRevealedKeys(prev => new Set(prev).add(key))
  }

  const configEntries = agentConfig
    ? Object.entries(agentConfig).filter(([k]) => !HIDDEN_CONFIG_KEYS.has(k))
    : []
  const mutableFields = configEntries.filter(([, f]) => isMutable(f))
  const immutableFields = configEntries.filter(([, f]) => !isMutable(f))
  const globalMutable = mutableFields.filter(([key]) => getScope(key) === 'global')
  const localMutable = mutableFields.filter(([key]) => getScope(key) === 'local')

  // Known config keys (from live config) — to separate custom env vars
  const knownEnvKeys = new Set(configEntries.map(([k]) => toEnvKey(k)))
  const customEnvEntries = Object.entries(envVars).filter(([k]) => !knownEnvKeys.has(k))

  // DnD active field for overlay
  const activeEntry = activeId ? configEntries.find(([k]) => k === activeId) : null

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const key = active.id as string
    const envKey = toEnvKey(key)
    const targetLane = over.id as string
    const currentScope = getScope(key)

    if (targetLane === currentScope) return

    const value = String(getConfigValue(key))

    if (targetLane === 'local') {
      // G → L: copy value to local env_vars
      setEnvVars(prev => ({ ...prev, [envKey]: value }))
    } else {
      // L → G: move value to global, remove from local
      setGlobalConfig(prev => ({ ...prev, [envKey]: value }))
      setEnvVars(prev => { const next = { ...prev }; delete next[envKey]; return next })
    }
    setDirty(true)
  }

  // --- Save ---

  const handleSave = async () => {
    setActionLoading('save')

    // 1. All mutable configDraft fields → persist to env_vars AND live-patch
    const agentPatch: Record<string, string | number> = {}
    const localPatch: Record<string, string> = {}
    const globalPatch: Record<string, string> = {}
    for (const [key, value] of Object.entries(configDraft)) {
      const field = agentConfig?.[key]
      if (!field?.mutable) continue
      // Live-patch payload (original config keys)
      agentPatch[key] = value
      // Persist to env_vars (env key format)
      const envKey = toEnvKey(key)
      let envValue = String(value)
      if (isListType(field) && !envValue.startsWith('[')) {
        const nums = envValue.split(',').map(s => s.trim()).filter(Boolean)
        envValue = `[${nums.join(',')}]`
      }
      if (getScope(key) === 'local') {
        localPatch[envKey] = envValue
      } else {
        globalPatch[envKey] = envValue
      }
    }

    // Live-patch running agent for instant effect (no restart needed for these)
    if (Object.keys(agentPatch).length > 0 && agent.status === 'running') {
      const updated = await apiClient.patchAgentSettings(agent.id, agentPatch).catch(() => null)
      if (updated) setAgentConfig(updated)
    }

    setConfigDraft({})

    // 2. Build merged env_vars + globalConfig with patches
    const mergedEnv = { ...envVars, ...localPatch }
    const mergedGlobal = { ...globalConfig, ...globalPatch }

    setEnvVars(mergedEnv)
    setGlobalConfig(mergedGlobal)

    // 3. Save orchestrator data
    const data: UpdateAgentRequest = {}
    if (instructions !== (agent.custom_instructions ?? '')) data.custom_instructions = instructions
    let restartNeeded = Object.keys(localPatch).length > 0 || Object.keys(globalPatch).length > 0
    if (tgToken !== (agent.telegram_bot_token ?? '')) { data.telegram_bot_token = tgToken; restartNeeded = true }
    if (browserEnabled !== agent.browser_enabled) { data.browser_enabled = browserEnabled; restartNeeded = true }
    const currentEnv = agent.env_vars ?? {}
    if (JSON.stringify(mergedEnv) !== JSON.stringify(currentEnv)) { data.env_vars = mergedEnv; restartNeeded = true }

    await apiClient.updateGlobalConfig(mergedGlobal).catch(() => {})
    if (restartNeeded) { needsRestartRef.current = true; setNeedsRestart(true) }
    await updateAgent(agent.id, data)
    setDirty(false)
    setEditingToken(false)
    setFieldErrors({})
    setActionLoading(null)
  }

  const handleRestart = async () => {
    setActionLoading('restart')
    needsRestartRef.current = false
    setNeedsRestart(false)
    await restartAgent(agent.id)
    setActionLoading(null)
  }

  const handleStart = async () => { setActionLoading('start'); await startAgent(agent.id); setActionLoading(null) }
  const handleStop = async () => { setActionLoading('stop'); await stopAgent(agent.id); setActionLoading(null) }
  const handleDelete = async () => { setActionLoading('delete'); await deleteAgent(agent.id); onDeleted(); setActionLoading(null) }

  const handleAddEnvVar = () => {
    const key = newEnvKey.trim().toUpperCase()
    if (!key) return
    setEnvVars(prev => ({ ...prev, [key]: newEnvValue }))
    setNewEnvKey(''); setNewEnvValue(''); setDirty(true)
  }

  const handleRemoveEnvVar = (key: string) => {
    setEnvVars(prev => { const next = { ...prev }; delete next[key]; return next })
    setDirty(true)
  }

  const status = statusLabel[agent.status] ?? statusLabel.stopped
  const hasSavedToken = Boolean(agent.telegram_bot_token)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-line-faint">
        <h2 className="font-mono text-sm text-text-bright">{agent.name}</h2>
        <span className={`text-xs font-mono ${status.color}`}>{status.symbol} {status.text}</span>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Usage chart */}
        <UsageChart
          mode="single"
          period={usagePeriod}
          onPeriodChange={setUsagePeriod}
          onRefresh={() => setUsageReloadTick((t) => t + 1)}
          snapshots={usageSnapshots}
          loading={usageLoading}
        />

        <div className="border-t border-line-faint" />

        {/* TG Bot */}
        <div>
          <label className="block text-text-dim text-xs mb-1.5">telegram bot</label>
          {hasSavedToken && !editingToken ? (
            <div className="flex items-center gap-3 bg-panel border border-line-faint rounded px-3 py-2.5">
              {botLoading ? (
                <div className="text-text-dim text-xs">...</div>
              ) : botInfo ? (
                <>
                  {botInfo.photo_url ? (
                    <img src={botInfo.photo_url} alt={botInfo.username} className="w-8 h-8 rounded-full shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-hover flex items-center justify-center text-text-dim text-xs shrink-0">{botInfo.first_name[0]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-main truncate">{botInfo.first_name}</div>
                    <div className="text-xs text-text-dim font-mono">@{botInfo.username}</div>
                  </div>
                  <a href={`https://t.me/${botInfo.username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-copper hover:underline shrink-0">открыть</a>
                </>
              ) : (
                <div className="flex-1 text-text-dim text-xs">бот настроен</div>
              )}
              <button onClick={() => setEditingToken(true)} className="text-xs text-text-dim hover:text-text-main shrink-0">изменить</button>
            </div>
          ) : (
            <div className="relative">
              <input type="text" value={tgToken} onChange={(e) => { setTgToken(e.target.value); setDirty(true) }} placeholder="" className="w-full h-9 bg-panel border border-line-faint rounded px-3 text-sm text-text-main placeholder:text-text-dim focus:outline-none focus:border-line-subtle font-mono" />
              {editingToken && (
                <button onClick={() => { setEditingToken(false); setTgToken(agent.telegram_bot_token ?? ''); setDirty(false) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main text-xs">отмена</button>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-line-faint" />

        {/* Telethon userbot */}
        <TelethonAuth agentId={agent.id} agentRunning={agent.status === 'running'} />

        <div className="border-t border-line-faint" />

        {/* Browser toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-text-dim text-xs">browser</label>
            <span className="text-text-dim text-[10px]">sidecar для веб-доступа</span>
          </div>
          <button onClick={() => { setBrowserEnabled(!browserEnabled); setDirty(true) }} className={`w-8 h-4 rounded-full relative transition-colors ${browserEnabled ? 'bg-copper' : 'bg-line-subtle'}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-text-bright transition-all ${browserEnabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Ignore external users toggle (live, без рестарта) */}
        <IgnoreExternalToggle
          agentId={agent.id}
          agentRunning={agent.status === 'running'}
          value={agentConfig?.ignore_external_users?.value === true}
          onChange={(v) => {
            setAgentConfig(prev => prev ? {
              ...prev,
              ignore_external_users: { ...(prev.ignore_external_users ?? { mutable: true, type: 'bool' }), value: v },
            } : prev)
          }}
        />

        <div className="border-t border-line-faint" />

        {/* Prompt */}
        <div>
          <label className="block text-text-dim text-xs mb-1.5">prompt</label>
          <textarea value={instructions} onChange={(e) => { setInstructions(e.target.value); setDirty(true) }} placeholder="инструкции для агента..." rows={4} className="w-full bg-panel border border-line-faint rounded px-3 py-2 text-sm text-text-main placeholder:text-text-dim focus:outline-none focus:border-line-subtle resize-y font-mono" />
        </div>

        <div className="border-t border-line-faint" />

        {/* Unified config — DnD lanes + immutable */}
        <div className="space-y-3">
          <label className="block text-text-dim text-xs">config</label>

          {agent.status !== 'running' ? (
            <div className="text-text-dim text-xs py-2">конфиг доступен для запущенного агента</div>
          ) : configLoading ? (
            <div className="text-text-dim text-xs py-2">загрузка...</div>
          ) : configError ? (
            <div className="text-rose text-xs py-2">{configError}</div>
          ) : agentConfig && configEntries.length > 0 ? (
            <>
              {mutableFields.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={pointerWithin}
                  onDragStart={(e) => setActiveId(e.active.id as string)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="space-y-2">
                    <DropLane id="global" label="G" hint="все агенты">
                      {globalMutable.map(([key, field]) => (
                        <DraggableConfigItem
                          key={key}
                          id={key}
                          label={toEnvKey(key)}
                          inputType={deriveInputType(field)}
                          value={getConfigValue(key)}
                          isGlobal={true}
                          revealed={revealedKeys.has(key)}
                          error={fieldErrors[key]}
                          onReveal={() => handleReveal(key)}
                          onChange={(v) => setConfigFieldValue(key, v)}
                        />
                      ))}
                    </DropLane>

                    <DropLane id="local" label="L" hint="только этот агент">
                      {localMutable.map(([key, field]) => (
                        <DraggableConfigItem
                          key={key}
                          id={key}
                          label={toEnvKey(key)}
                          inputType={deriveInputType(field)}
                          value={getConfigValue(key)}
                          isGlobal={false}
                          revealed={revealedKeys.has(key)}
                          error={fieldErrors[key]}
                          onReveal={() => handleReveal(key)}
                          onChange={(v) => setConfigFieldValue(key, v)}
                        />
                      ))}
                    </DropLane>
                  </div>

                  <DragOverlay>
                    {activeEntry && (
                      <div className="flex items-center gap-2 rounded px-2 py-1 bg-panel border border-copper/40 shadow-lg">
                        <span className="text-copper text-[10px] shrink-0">{'\u2261'}</span>
                        <span className="text-xs text-text-main">{toEnvKey(activeEntry[0])}</span>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}

              {immutableFields.length > 0 && (
                <div className="space-y-1 opacity-60">
                  {immutableFields.map(([key, field]) => (
                    <div key={key} className="flex items-center gap-2 rounded px-2 py-1">
                      <label className="w-36 text-xs text-text-dim shrink-0 truncate">{toEnvKey(key)}</label>
                      <span className="flex-1 h-7 flex items-center px-2 text-xs text-text-dim font-mono truncate">
                        {String(field.value ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-text-dim text-xs py-2">нет полей</div>
          )}
        </div>

        {/* Custom env vars */}
        <div>
          <button onClick={() => setShowCustomEnv(!showCustomEnv)} className="text-[10px] text-text-dim hover:text-text-main uppercase tracking-wider">
            {showCustomEnv ? '\u25BC' : '\u25B6'} custom env{customEnvEntries.length > 0 ? ` (${customEnvEntries.length})` : ''}
          </button>

          {showCustomEnv && (
            <div className="mt-2 space-y-1.5">
              {customEnvEntries.map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-text-main">{key}</span>
                  <span className="text-text-dim">=</span>
                  <span className="text-text-dim flex-1 truncate">{value}</span>
                  <button onClick={() => handleRemoveEnvVar(key)} className="text-text-dim hover:text-rose shrink-0">{'\u2715'}</button>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <input type="text" value={newEnvKey} onChange={(e) => setNewEnvKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddEnvVar()} placeholder="KEY" className="w-28 h-7 bg-panel border border-line-faint rounded px-2 text-xs text-text-main placeholder:text-text-dim focus:outline-none focus:border-line-subtle font-mono uppercase" />
                <span className="text-text-dim text-xs">=</span>
                <input type="text" value={newEnvValue} onChange={(e) => setNewEnvValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddEnvVar()} placeholder="value" className="flex-1 h-7 bg-panel border border-line-faint rounded px-2 text-xs text-text-main placeholder:text-text-dim focus:outline-none focus:border-line-subtle font-mono" />
                <button onClick={handleAddEnvVar} disabled={!newEnvKey.trim()} className="h-7 px-2 text-xs text-text-dim hover:text-text-main disabled:opacity-30">+</button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Save bar — always visible when dirty */}
      {dirty && (
        <div className="flex items-center gap-3 px-6 py-2 border-t border-line-faint shrink-0">
          <button onClick={handleSave} disabled={actionLoading === 'save' || hasValidationErrors} className="h-8 px-4 bg-copper text-void text-xs font-medium rounded hover:opacity-80 disabled:opacity-40 transition-opacity">
            {actionLoading === 'save' ? '...' : 'сохранить'}
          </button>
          {hasValidationErrors && (
            <span className="text-[10px] text-rose">исправьте ошибки в полях</span>
          )}
        </div>
      )}

      {/* Restart banner */}
      {needsRestart && agent.status === 'running' && (
        <div className="bg-copper/10 border-t border-copper/20 px-6 py-2 shrink-0">
          <span className="text-xs text-copper">настройки изменены — нужен restart</span>
        </div>
      )}

      {/* Actions footer */}
      <div className="flex items-center gap-2 px-6 h-12 border-t border-line-faint">
        {(agent.status === 'stopping' || agent.status === 'creating') && (
          <>
            <span className="text-xs text-copper font-mono">{status.text}</span>
            <button
              onClick={handleRestart}
              disabled={actionLoading !== null}
              title="Принудительно пересоздать (если агент завис в этом статусе)"
              className="h-7 px-3 text-xs text-copper hover:bg-copper/10 rounded transition-colors disabled:opacity-40"
            >
              {actionLoading === 'restart' ? '...' : 'force restart'}
            </button>
          </>
        )}
        {(agent.status === 'stopped' || agent.status === 'error') && (
          <button onClick={handleStart} disabled={actionLoading !== null} className="h-7 px-3 text-xs text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors disabled:opacity-40">
            {actionLoading === 'start' ? '...' : 'start'}
          </button>
        )}
        {agent.status === 'running' && (
          <>
            <button onClick={handleStop} disabled={actionLoading !== null} className="h-7 px-3 text-xs text-text-dim hover:bg-hover rounded transition-colors disabled:opacity-40">
              {actionLoading === 'stop' ? '...' : 'stop'}
            </button>
            <button onClick={handleRestart} disabled={actionLoading !== null} className="h-7 px-3 text-xs text-copper hover:bg-copper/10 rounded transition-colors disabled:opacity-40">
              {actionLoading === 'restart' ? '...' : 'restart'}
            </button>
          </>
        )}
        <div className="flex-1" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button disabled={actionLoading !== null} className="h-7 px-3 text-xs text-rose hover:bg-rose/10 rounded transition-colors disabled:opacity-40">
              {actionLoading === 'delete' ? '...' : 'удалить'}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Удалить агента?</AlertDialogTitle>
            <AlertDialogDescription>
              Агент <span className="text-text-main font-mono">{agent.name}</span> будет остановлен и удалён. Это действие нельзя отменить.
            </AlertDialogDescription>
            <div className="flex justify-end gap-2 mt-4">
              <AlertDialogCancel>отмена</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>удалить</AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
