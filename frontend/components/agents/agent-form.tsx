'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CreateAgentRequest } from '@/types/agent'

interface AgentFormProps {
  onSubmit: (data: CreateAgentRequest) => Promise<void>
  loading?: boolean
}

export function AgentForm({ onSubmit, loading }: AgentFormProps) {
  const [formData, setFormData] = useState<CreateAgentRequest>({
    name: '',
    telegram_user_id: 0,
    custom_instructions: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Основное */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Основное</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Имя агента *</Label>
            <Input
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Мой AI-ассистент"
            />
          </div>
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="telegram_user_id">User ID *</Label>
            <Input
              id="telegram_user_id"
              type="number"
              required
              value={formData.telegram_user_id || ''}
              onChange={(e) => setFormData({ ...formData, telegram_user_id: parseInt(e.target.value) || 0 })}
              placeholder="123456789"
            />
            <p className="text-xs text-muted-foreground">
              Отправьте /start боту @userinfobot в Telegram чтобы узнать свой ID
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="telegram_bot_token">Bot Token *</Label>
            <Input
              id="telegram_bot_token"
              type="password"
              required
              value={formData.telegram_bot_token || ''}
              onChange={(e) => setFormData({ ...formData, telegram_bot_token: e.target.value || undefined })}
              placeholder="123456:ABC-DEF..."
            />
            <p className="text-xs text-muted-foreground">
              Получите у @BotFather в Telegram
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Конфигурация */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Конфигурация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="claude_api_key">Claude API Key *</Label>
            <Input
              id="claude_api_key"
              type="password"
              required
              value={formData.claude_api_key || ''}
              onChange={(e) => setFormData({ ...formData, claude_api_key: e.target.value || undefined })}
              placeholder="sk-ant-..."
            />
            <p className="text-xs text-muted-foreground">
              API ключ для Claude (Anthropic)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom_instructions">Инструкции для агента</Label>
            <Textarea
              id="custom_instructions"
              rows={5}
              placeholder="Необязательные кастомные инструкции для агента..."
              className="font-mono text-xs"
              value={formData.custom_instructions || ''}
              onChange={(e) => setFormData({ ...formData, custom_instructions: e.target.value || undefined })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Создание...
            </>
          ) : (
            'Создать агента'
          )}
        </Button>
      </div>
    </form>
  )
}
