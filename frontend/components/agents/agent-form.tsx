'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CreateAgentRequest } from '@/types/agent'

interface AgentFormProps {
  onSubmit: (data: CreateAgentRequest) => Promise<void>
  loading?: boolean
}

export function AgentForm({ onSubmit, loading }: AgentFormProps) {
  const [formData, setFormData] = useState<CreateAgentRequest>({
    telegram_user_id: 0,
    username: '',
    first_name: '',
    last_name: '',
    config: {
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
      max_tokens: 4096,
      system_prompt: '',
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(formData)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Создать нового агента</CardTitle>
        <CardDescription>Заполните данные для создания AI агента</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telegram_user_id">Telegram User ID *</Label>
              <Input
                id="telegram_user_id"
                type="number"
                required
                value={formData.telegram_user_id || ''}
                onChange={(e) => setFormData({ ...formData, telegram_user_id: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Имя</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_name">Фамилия</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-4">Конфигурация</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model">Модель</Label>
                <Input
                  id="model"
                  value={formData.config?.model}
                  onChange={(e) => setFormData({
                    ...formData,
                    config: { ...formData.config, model: e.target.value }
                  })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={formData.config?.temperature}
                    onChange={(e) => setFormData({
                      ...formData,
                      config: { ...formData.config, temperature: parseFloat(e.target.value) }
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_tokens">Max Tokens</Label>
                  <Input
                    id="max_tokens"
                    type="number"
                    value={formData.config?.max_tokens}
                    onChange={(e) => setFormData({
                      ...formData,
                      config: { ...formData.config, max_tokens: parseInt(e.target.value) }
                    })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system_prompt">System Prompt</Label>
                <Textarea
                  id="system_prompt"
                  rows={4}
                  placeholder="Необязательный системный промпт для агента..."
                  value={formData.config?.system_prompt}
                  onChange={(e) => setFormData({
                    ...formData,
                    config: { ...formData.config, system_prompt: e.target.value }
                  })}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? 'Создание...' : 'Создать агента'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
