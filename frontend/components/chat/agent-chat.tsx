'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Square, Trash2, MessageSquare } from 'lucide-react'
import { useAgentChat } from '@/hooks/use-agent-chat'
import { cn } from '@/lib/utils'
import type { Agent } from '@/types/agent'
import type { ChatMessage, ConnectionStatus } from '@/types/chat'

interface AgentChatProps {
  agent: Agent
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        'inline-block h-[6px] w-[6px] rounded-full',
        status === 'connected' && 'bg-emerald-400',
        status === 'connecting' && 'bg-yellow-400',
        status === 'error' && 'bg-red-400',
        status === 'disconnected' && 'bg-white/20',
      )}
    />
  )
}

const statusLabel: Record<ConnectionStatus, string> = {
  connected: 'connected',
  connecting: 'connecting...',
  error: 'connection error',
  disconnected: 'disconnected',
}

function MessageLine({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="my-3">
        <span className="text-blue-400 select-none">{'\u203A '}</span>
        <span className="text-foreground/80">{message.content}</span>
      </div>
    )
  }

  return (
    <div className="my-3">
      {message.toolName && (
        <div className="text-[11px] text-muted-foreground/60 mb-1">
          {'\u25B8 '}{message.toolName}
        </div>
      )}
      <span className="text-foreground">
        {message.content}
        {message.isStreaming && (
          <span className="inline-block w-[7px] h-[14px] bg-foreground ml-[1px] align-middle animate-[blink_1s_step-end_infinite]" />
        )}
      </span>
    </div>
  )
}

export function AgentChat({ agent }: AgentChatProps) {
  const port = agent.status === 'running' ? agent.port : null
  const { messages, connectionStatus, queryStatus, sendMessage, stopQuery, clearChat } = useAgentChat(port)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = () => {
    if (!input.trim() || queryStatus === 'querying') return
    sendMessage(input)
    setInput('')
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  // Not running state
  if (agent.status !== 'running') {
    return (
      <div className="glass rounded-2xl h-[calc(100vh-260px)] flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Агент не запущен</p>
        </div>
      </div>
    )
  }

  if (!agent.port) {
    return (
      <div className="glass rounded-2xl h-[calc(100vh-260px)] flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Порт не назначен</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl h-[calc(100vh-260px)] flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 h-7 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2">
          <StatusDot status={connectionStatus} />
          <span className="text-[11px] font-mono text-muted-foreground tracking-wider">
            {statusLabel[connectionStatus]}
          </span>
        </div>
        <button
          onClick={clearChat}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title="Очистить чат"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed font-mono scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <p className="text-muted-foreground/40 text-[12px] select-none">Начните диалог</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageLine key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] p-3 flex items-end gap-2 flex-shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="message..."
          disabled={queryStatus === 'querying'}
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none font-mono text-[13px] text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50 leading-relaxed"
        />
        {queryStatus === 'querying' ? (
          <button
            onClick={stopQuery}
            className="h-7 w-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 hover:bg-red-500/30 transition-colors"
            title="Остановить"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="h-7 w-7 rounded-full bg-white/[0.1] text-foreground flex items-center justify-center flex-shrink-0 hover:bg-white/[0.15] transition-colors disabled:opacity-30"
            title="Отправить"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
