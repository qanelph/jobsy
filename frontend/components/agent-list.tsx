'use client'

import { useState } from 'react'
import type { Agent } from '@/types/agent'

const statusDot: Record<string, string> = {
  running: 'text-emerald-400',
  creating: 'text-copper',
  stopped: 'text-text-dim',
  error: 'text-rose',
  deleted: 'text-text-dim',
}

interface AgentListProps {
  agents: Agent[]
  selectedId: number | null
  onSelect: (id: number) => void
  onCreate: (name: string) => void
}

export function AgentList({ agents, selectedId, onSelect, onCreate }: AgentListProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    onCreate(name)
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with + button */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-line-faint">
        <span className="text-text-dim text-xs uppercase tracking-wider">агенты</span>
        <button
          onClick={() => setCreating(true)}
          className="text-text-dim hover:text-text-main text-lg leading-none"
          title="Создать агента"
        >
          +
        </button>
      </div>

      {/* Inline create */}
      {creating && (
        <div className="px-4 py-2 border-b border-line-faint">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            onBlur={() => { if (!newName.trim()) { setCreating(false); setNewName('') } }}
            placeholder="имя агента..."
            className="w-full bg-transparent border-none outline-none text-sm text-text-main placeholder:text-text-dim"
          />
        </div>
      )}

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 && !creating && (
          <div className="px-4 py-6 text-text-dim text-xs text-center">
            нет агентов
          </div>
        )}
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            className={`w-full text-left px-4 py-2.5 flex items-center gap-2 text-sm transition-colors ${
              selectedId === agent.id
                ? 'bg-active text-text-bright'
                : 'text-text-main hover:bg-hover'
            }`}
          >
            <span className={statusDot[agent.status] ?? 'text-text-dim'}>
              {agent.status === 'running' ? '\u25CF' : '\u25CB'}
            </span>
            <span className="truncate font-mono text-xs">{agent.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
