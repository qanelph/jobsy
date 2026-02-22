'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Key, Shield, ExternalLink, RefreshCw, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import type { ClaudeAuthStatus } from '@/types/claude-auth'

type OAuthFlowState = {
  active: boolean
  state: string
  authorizeUrl: string
}

export default function SettingsPage() {
  const [status, setStatus] = useState<ClaudeAuthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // OAuth flow
  const [oauthFlow, setOauthFlow] = useState<OAuthFlowState | null>(null)
  const [oauthCode, setOauthCode] = useState('')

  // API Key flow
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [apiKeyValue, setApiKeyValue] = useState('')

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    const data = await apiClient.getClaudeAuthStatus()
    setStatus(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleStartOAuth = async () => {
    setActionLoading('oauth')
    try {
      const response = await apiClient.startClaudeOAuth()
      setOauthFlow({
        active: true,
        state: response.state,
        authorizeUrl: response.authorize_url,
      })
      window.open(response.authorize_url, '_blank', 'noopener,noreferrer')
    } catch {
      showFeedback('error', 'Не удалось начать OAuth flow')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCompleteOAuth = async () => {
    if (!oauthFlow || !oauthCode.trim()) return
    setActionLoading('oauth-complete')
    try {
      const data = await apiClient.completeClaudeOAuth(oauthCode.trim(), oauthFlow.state)
      setStatus(data)
      setOauthFlow(null)
      setOauthCode('')
      showFeedback('success', 'OAuth авторизация успешно завершена')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showFeedback('error', detail || 'Не удалось завершить авторизацию')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelOAuth = () => {
    setOauthFlow(null)
    setOauthCode('')
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyValue.trim()) return
    setActionLoading('apikey')
    try {
      const data = await apiClient.setClaudeApiKey(apiKeyValue.trim())
      setStatus(data)
      setApiKeyValue('')
      setShowApiKeyInput(false)
      showFeedback('success', 'API ключ сохранён')
    } catch {
      showFeedback('error', 'Не удалось сохранить API ключ')
    } finally {
      setActionLoading(null)
    }
  }

  const handleClear = async () => {
    setActionLoading('clear')
    try {
      await apiClient.clearClaudeAuth()
      setStatus({ configured: false, auth_mode: null, account_email: null, organization_name: null, expires_at: null, is_expired: false })
      showFeedback('success', 'Credentials очищены')
    } catch {
      showFeedback('error', 'Не удалось очистить credentials')
    } finally {
      setActionLoading(null)
    }
  }

  const renderStatusBadge = () => {
    if (!status?.configured) {
      return <Badge variant="default">Не настроено</Badge>
    }
    if (status.auth_mode === 'oauth') {
      return <Badge variant="success">OAuth</Badge>
    }
    return <Badge className="bg-blue-500/15 text-blue-400">API Key</Badge>
  }

  const renderExpiresInfo = () => {
    if (!status?.expires_at) return null
    const expiresDate = new Date(status.expires_at * 1000)
    const isExpired = status.is_expired
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Истекает:</span>
        <span className={isExpired ? 'text-red-400' : 'text-foreground'}>
          {isExpired ? 'Истёк' : formatRelativeTime(expiresDate)}
        </span>
      </div>
    )
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление платформой и интеграциями
          </p>
        </div>

        {/* Feedback */}
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mb-6 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            {feedback.message}
          </motion.div>
        )}

        {/* Claude Auth Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                  <Shield className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <CardTitle>Claude Credentials</CardTitle>
                  <CardDescription>Авторизация для AI агентов</CardDescription>
                </div>
              </div>
              {!loading && renderStatusBadge()}
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : status?.configured ? (
              /* Configured state */
              <div className="space-y-4">
                {/* Info */}
                <div className="space-y-2 rounded-xl bg-white/[0.03] p-4">
                  {status.account_email && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="text-foreground">{status.account_email}</span>
                    </div>
                  )}
                  {status.organization_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Организация:</span>
                      <span className="text-foreground">{status.organization_name}</span>
                    </div>
                  )}
                  {renderExpiresInfo()}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleClear}
                    disabled={actionLoading === 'clear'}
                  >
                    {actionLoading === 'clear' ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Отключить
                  </Button>
                </div>
              </div>
            ) : (
              /* Not configured state */
              <div className="space-y-4">
                {oauthFlow?.active ? (
                  /* OAuth code input step */
                  <div className="space-y-3">
                    <div className="rounded-xl bg-white/[0.03] p-4 space-y-2">
                      <p className="text-sm text-foreground font-medium">Завершите авторизацию</p>
                      <p className="text-sm text-muted-foreground">
                        Скопируйте код со страницы Claude и вставьте ниже.
                        Если окно не открылось —{' '}
                        <a
                          href={oauthFlow.authorizeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                        >
                          откройте вручную
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Вставьте код авторизации..."
                        value={oauthCode}
                        onChange={(e) => setOauthCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCompleteOAuth()}
                      />
                      <Button
                        onClick={handleCompleteOAuth}
                        disabled={!oauthCode.trim() || actionLoading === 'oauth-complete'}
                      >
                        {actionLoading === 'oauth-complete' ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Подтвердить
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleCancelOAuth}>
                      Отмена
                    </Button>
                  </div>
                ) : showApiKeyInput ? (
                  /* API Key input */
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="sk-ant-..."
                        value={apiKeyValue}
                        onChange={(e) => setApiKeyValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                      />
                      <Button
                        onClick={handleSaveApiKey}
                        disabled={!apiKeyValue.trim() || actionLoading === 'apikey'}
                      >
                        {actionLoading === 'apikey' ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Сохранить
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setShowApiKeyInput(false); setApiKeyValue('') }}>
                      Отмена
                    </Button>
                  </div>
                ) : (
                  /* Choose method */
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Выберите способ подключения Claude для ваших агентов
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleStartOAuth}
                        disabled={actionLoading === 'oauth'}
                      >
                        {actionLoading === 'oauth' ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Shield className="h-4 w-4" />
                        )}
                        Войти через Claude
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" onClick={() => setShowApiKeyInput(true)}>
                        <Key className="h-4 w-4" />
                        API Key
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AppLayout>
  )
}
