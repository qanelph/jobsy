'use client'

import { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { PlatformSettings } from '@/types/settings'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

export function TelegramPopover() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [hashRevealed, setHashRevealed] = useState(false)
  const [dirty, setDirty] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.getPlatformSettings()
      setSettings(data)
      setApiId(data.tg_api_id ? String(data.tg_api_id) : '')
      setApiHash(data.tg_api_hash || '')
      setDirty(false)
      setHashRevealed(false)
    } catch {
      setError('не удалось загрузить')
    } finally {
      setLoading(false)
    }
  }, [])

  // Check on mount (for dot color)
  useEffect(() => { fetchSettings() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) fetchSettings()
  }, [open, fetchSettings])

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      const newApiId = apiId.trim() ? parseInt(apiId.trim(), 10) : 0
      if (newApiId !== (settings?.tg_api_id ?? 0)) patch.tg_api_id = newApiId

      // Only send api_hash if it was actually changed (not masked value)
      const isMasked = apiHash.includes('...')
      if (!isMasked && apiHash !== (settings?.tg_api_hash ?? '')) {
        patch.tg_api_hash = apiHash
      }

      if (Object.keys(patch).length === 0) {
        setDirty(false)
        setSaving(false)
        return
      }

      const data = await apiClient.updatePlatformSettings(patch)
      setSettings(data)
      setApiId(data.tg_api_id ? String(data.tg_api_id) : '')
      setApiHash(data.tg_api_hash || '')
      setDirty(false)
      setHashRevealed(false)
    } catch {
      setError('ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const configured = Boolean(settings && settings.tg_api_id && settings.tg_api_hash && !settings.tg_api_hash.startsWith('****'))
  const dotColor = !settings ? 'text-text-dim' : configured ? 'text-emerald-400' : 'text-rose'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-main transition-colors">
          telegram <span className={dotColor}>{'\u25CF'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="space-y-3">
          <div className="text-[10px] text-text-dim uppercase tracking-wider font-mono">Telegram API</div>

          {error && (
            <div className="text-[10px] text-rose bg-rose/10 rounded px-2 py-1">{error}</div>
          )}

          {loading ? (
            <div className="text-text-dim text-xs text-center py-2">...</div>
          ) : (
            <>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-text-dim mb-0.5 block">API ID</label>
                  <input
                    type="text"
                    value={apiId}
                    onChange={(e) => { setApiId(e.target.value); setDirty(true) }}
                    placeholder="12345678"
                    className="w-full h-8 bg-void border border-line-faint rounded px-2 text-xs text-text-main placeholder:text-text-dim/40 focus:outline-none focus:border-line-subtle font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-dim mb-0.5 block">API Hash</label>
                  <div className="relative">
                    <input
                      type={hashRevealed ? 'text' : 'password'}
                      value={apiHash}
                      onChange={(e) => { setApiHash(e.target.value); setDirty(true) }}
                      placeholder="0123456789abcdef..."
                      className="w-full h-8 bg-void border border-line-faint rounded px-2 pr-8 text-xs text-text-main placeholder:text-text-dim/40 focus:outline-none focus:border-line-subtle font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setHashRevealed(!hashRevealed)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main"
                    >
                      {hashRevealed ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-text-dim">
                Получить на <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" className="text-copper hover:underline">my.telegram.org/apps</a>
              </div>

              {dirty && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs text-copper hover:underline disabled:opacity-40"
                >
                  {saving ? '...' : 'сохранить'}
                </button>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
