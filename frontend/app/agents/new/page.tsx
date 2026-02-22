'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentForm } from '@/components/agents/agent-form'
import { AppLayout } from '@/components/layout/app-layout'
import { useAgentsStore } from '@/store/agents'
import type { CreateAgentRequest } from '@/types/agent'

export default function NewAgentPage() {
  const router = useRouter()
  const { createAgent, loading } = useAgentsStore()

  const handleSubmit = async (data: CreateAgentRequest) => {
    await createAgent(data)
    router.push('/agents')
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-2xl"
      >
        <div className="mb-8">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Новый агент</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Заполните форму для создания AI агента
          </p>
        </div>

        <AgentForm onSubmit={handleSubmit} loading={loading} />
      </motion.div>
    </AppLayout>
  )
}
