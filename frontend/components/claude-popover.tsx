'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api'
import type { ClaudeAuthStatus } from '@/types/claude-auth'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

export function ClaudePopover() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ClaudeAuthStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // OAuth flow
  const [oauthState, setOauthState] = useState<{ state: string; url: string } | null>(null)
  const [oauthCode, setOauthCode] = useState('')

  // API key flow
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    const data = await apiClient.getClaudeAuthStatus()
    setStatus(data)
    setLoading(false)
  }, [])

  // Check on mount (for dot color)
  useEffect(() => { fetchStatus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) fetchStatus()
  }, [open, fetchStatus])

  const handleStartOAuth = async () => {
    setError(null)
    setActionLoading('oauth')
    try {
      const response = await apiClient.startClaudeOAuth()
      setOauthState({ state: response.state, url: response.authorize_url })
      window.open(response.authorize_url, '_blank', 'noopener,noreferrer')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`OAuth start: ${msg}`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCompleteOAuth = async () => {
    if (!oauthState || !oauthCode.trim()) return
    setError(null)
    setActionLoading('oauth-complete')
    try {
      const code = oauthCode.trim().split('#')[0]
      const data = await apiClient.completeClaudeOAuth(code, oauthState.state)
      setStatus(data)
      setOauthState(null)
      setOauthCode('')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`OAuth callback: ${msg}`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyValue.trim()) return
    setError(null)
    setActionLoading('apikey')
    try {
      const data = await apiClient.setClaudeApiKey(apiKeyValue.trim())
      setStatus(data)
      setApiKeyValue('')
      setShowApiKey(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`API key: ${msg}`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleClear = async () => {
    setError(null)
    setActionLoading('clear')
    try {
      await apiClient.clearClaudeAuth()
      setStatus({ configured: false, auth_mode: null, account_email: null, organization_name: null, expires_at: null, is_expired: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Clear: ${msg}`)
    } finally {
      setActionLoading(null)
    }
  }

  const dotColor = !status?.configured
    ? 'text-text-dim'
    : status.is_expired
      ? 'text-rose'
      : 'text-emerald-400'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-main transition-colors">
          claude <span className={dotColor}>{'\u25CF'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="space-y-3">
          {error && (
            <div className="text-[10px] text-rose bg-rose/10 rounded px-2 py-1 break-all">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-text-dim text-xs text-center py-2">...</div>
          ) : status?.configured ? (
            <>
              <div className="space-y-1 text-xs">
                <div className="text-text-dim">
                  {status.auth_mode === 'oauth' ? 'OAuth' : 'API Key'}
                </div>
                {status.account_email && (
                  <div className="text-text-main font-mono">{status.account_email}</div>
                )}
                {status.organization_name && (
                  <div className="text-text-dim">{status.organization_name}</div>
                )}
              </div>
              <button
                onClick={handleClear}
                disabled={actionLoading === 'clear'}
                className="text-xs text-rose hover:underline disabled:opacity-40"
              >
                {actionLoading === 'clear' ? '...' : 'отключить'}
              </button>
            </>
          ) : oauthState ? (
            <>
              <p className="text-xs text-text-dim">
                Вставьте код со страницы Claude:
              </p>
              <input
                autoFocus
                value={oauthCode}
                onChange={(e) => setOauthCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCompleteOAuth()}
                placeholder="код..."
                className="w-full h-8 bg-void border border-line-faint rounded px-2 text-xs text-text-main placeholder:text-text-dim focus:outline-none focus:border-line-subtle font-mono"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCompleteOAuth}
                  disabled={!oauthCode.trim() || actionLoading === 'oauth-complete'}
                  className="text-xs text-copper hover:underline disabled:opacity-40"
                >
                  {actionLoading === 'oauth-complete' ? '...' : 'подтвердить'}
                </button>
                <button
                  onClick={() => { setOauthState(null); setOauthCode('') }}
                  className="text-xs text-text-dim hover:underline"
                >
                  отмена
                </button>
              </div>
            </>
          ) : showApiKey ? (
            <>
              <input
                autoFocus
                type="password"
                value={apiKeyValue}
                onChange={(e) => setApiKeyValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                placeholder="sk-ant-..."
                className="w-full h-8 bg-void border border-line-faint rounded px-2 text-xs text-text-main placeholder:text-text-dim focus:outline-none focus:border-line-subtle font-mono"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyValue.trim() || actionLoading === 'apikey'}
                  className="text-xs text-copper hover:underline disabled:opacity-40"
                >
                  {actionLoading === 'apikey' ? '...' : 'сохранить'}
                </button>
                <button
                  onClick={() => { setShowApiKey(false); setApiKeyValue('') }}
                  className="text-xs text-text-dim hover:underline"
                >
                  отмена
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-text-dim">не настроено</p>
              <div className="flex gap-3">
                <button
                  onClick={handleStartOAuth}
                  disabled={actionLoading === 'oauth'}
                  className="text-xs text-copper hover:underline disabled:opacity-40"
                >
                  {actionLoading === 'oauth' ? '...' : 'OAuth'}
                </button>
                <button
                  onClick={() => setShowApiKey(true)}
                  className="text-xs text-text-main hover:underline"
                >
                  API Key
                </button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
