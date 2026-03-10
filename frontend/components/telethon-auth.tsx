'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { apiClient } from '@/lib/api'
import type { TelethonAuthPhase, TelethonSessionInfo } from '@/types/agent'

const POLL_INTERVAL = 2000

interface TelethonAuthProps {
  agentId: number
  agentRunning: boolean
}

export function TelethonAuth({ agentId, agentRunning }: TelethonAuthProps) {
  const [session, setSession] = useState<TelethonSessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<TelethonAuthPhase>('idle')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultInfo, setResultInfo] = useState<{ phone: string | null; username: string | null; first_name: string | null } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Fetch session on mount
  useEffect(() => {
    if (!agentRunning) {
      setSession(null)
      setLoading(false)
      return
    }
    setLoading(true)
    apiClient.getTelethonSession(agentId)
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [agentId, agentRunning])

  // Cleanup polling on unmount
  useEffect(() => stopPolling, [stopPolling])

  const handleStart = async () => {
    setActionLoading(true)
    setError(null)
    setPhase('qr_pending')
    setResultInfo(null)
    try {
      const res = await apiClient.startTelethonQr(agentId)
      setQrUrl(res.qr_url)
      // Start polling
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const status = await apiClient.getTelethonQrStatus(agentId)
          setPhase(status.phase)
          if (status.qr_url) setQrUrl(status.qr_url)
          if (status.error) setError(status.error)
          if (status.phase === 'success') {
            stopPolling()
            setResultInfo({ phone: status.phone, username: status.username, first_name: status.first_name })
          }
          if (status.phase === 'error' || status.phase === 'expired') {
            stopPolling()
          }
        } catch {
          // ignore polling errors
        }
      }, POLL_INTERVAL)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Не удалось начать авторизацию'
      setError(msg)
      setPhase('error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirm = async () => {
    setActionLoading(true)
    try {
      const info = await apiClient.confirmTelethonQr(agentId)
      setSession(info)
      setPhase('idle')
      setQrUrl(null)
      setResultInfo(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка подтверждения'
      setError(msg)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    setActionLoading(true)
    try {
      const info = await apiClient.deleteTelethonSession(agentId)
      setSession(info)
    } catch {
      // ignore
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = () => {
    stopPolling()
    setPhase('idle')
    setQrUrl(null)
    setError(null)
    setResultInfo(null)
  }

  if (!agentRunning) {
    return (
      <div>
        <label className="block text-text-dim text-xs mb-1.5">telegram userbot</label>
        <div className="text-text-dim text-xs">доступно для запущенного агента</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <label className="block text-text-dim text-xs mb-1.5">telegram userbot</label>
        <div className="text-text-dim text-xs">...</div>
      </div>
    )
  }

  // Session exists — show info
  if (session?.has_session && phase === 'idle') {
    const initial = session.first_name?.[0] ?? session.username?.[0]?.toUpperCase() ?? 'T'
    return (
      <div>
        <label className="block text-text-dim text-xs mb-1.5">telegram userbot</label>
        <div className="flex items-center gap-3 bg-panel border border-line-faint rounded px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-hover flex items-center justify-center text-copper text-xs shrink-0 font-mono">{initial}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-text-main truncate">
              {session.first_name ?? (session.username ? `@${session.username}` : 'аккаунт привязан')}
            </div>
            <div className="text-xs text-text-dim font-mono">
              {[session.username ? `@${session.username}` : null, session.phone ? `+${session.phone}` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button
            onClick={handleDelete}
            disabled={actionLoading}
            className="text-xs text-text-dim hover:text-rose shrink-0"
          >
            {actionLoading ? '...' : 'отвязать'}
          </button>
        </div>
      </div>
    )
  }

  // QR flow active
  if (phase === 'qr_pending' || phase === 'success') {
    return (
      <div>
        <label className="block text-text-dim text-xs mb-1.5">telegram userbot</label>
        <div className="bg-panel border border-line-faint rounded p-4">
          {phase === 'qr_pending' && qrUrl && (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white rounded-lg p-3">
                <QRCodeSVG value={qrUrl} size={180} />
              </div>
              <div className="text-center">
                <div className="text-xs text-text-main">Откройте Telegram → Настройки → Устройства → Привязать устройство</div>
                <div className="text-[10px] text-text-dim mt-1">Отсканируйте QR-код камерой Telegram</div>
              </div>
              <button
                onClick={handleCancel}
                className="text-xs text-text-dim hover:text-text-main"
              >
                отмена
              </button>
            </div>
          )}
          {phase === 'qr_pending' && !qrUrl && (
            <div className="text-text-dim text-xs text-center py-4">генерация QR...</div>
          )}
          {phase === 'success' && resultInfo && (
            <div className="flex flex-col items-center gap-3">
              <div className="text-emerald-400 text-sm">авторизация успешна</div>
              <div className="text-center">
                {resultInfo.first_name && (
                  <div className="text-text-main text-sm">{resultInfo.first_name}</div>
                )}
                <div className="text-text-dim text-xs font-mono">
                  {[resultInfo.username ? `@${resultInfo.username}` : null, resultInfo.phone ? `+${resultInfo.phone}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button
                onClick={handleConfirm}
                disabled={actionLoading}
                className="h-8 px-4 bg-copper text-void text-xs font-medium rounded hover:opacity-80 disabled:opacity-40 transition-opacity"
              >
                {actionLoading ? '...' : 'подтвердить и сохранить'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Error / expired
  if (phase === 'error' || phase === 'expired') {
    return (
      <div>
        <label className="block text-text-dim text-xs mb-1.5">telegram userbot</label>
        <div className="bg-panel border border-line-faint rounded p-4">
          <div className="text-center space-y-2">
            <div className="text-rose text-xs">{error ?? (phase === 'expired' ? 'QR-код истёк' : 'ошибка')}</div>
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="text-xs text-copper hover:underline"
            >
              попробовать снова
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Idle, no session — show bind button
  return (
    <div>
      <label className="block text-text-dim text-xs mb-1.5">telegram userbot</label>
      <button
        onClick={handleStart}
        disabled={actionLoading}
        className="w-full h-9 bg-panel border border-line-faint border-dashed rounded text-xs text-text-dim hover:text-copper hover:border-copper/40 transition-colors disabled:opacity-40"
      >
        {actionLoading ? '...' : 'привязать аккаунт'}
      </button>
    </div>
  )
}
