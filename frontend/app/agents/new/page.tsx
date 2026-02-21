'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentForm } from '@/components/agents/agent-form'
import { useAgentsStore } from '@/store/agents'

export default function NewAgentPage() {
  const router = useRouter()
  const { createAgent, loading } = useAgentsStore()

  const handleSubmit = async (data: any) => {
    await createAgent(data)
    router.push('/agents')
  }

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="mb-8">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Button>
        <h1 className="text-3xl font-bold">Создать нового агента</h1>
        <p className="text-muted-foreground mt-2">
          Заполните форму для создания AI агента
        </p>
      </div>

      <AgentForm onSubmit={handleSubmit} loading={loading} />
    </div>
  )
}
