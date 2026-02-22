'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getAccessToken } from '@/lib/auth'
import type { ChatMessage, ConnectionStatus, QueryStatus } from '@/types/chat'

const MIN_RECONNECT_DELAY = 2000
const MAX_RECONNECT_DELAY = 30000

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useAgentChat(port: number | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [queryStatus, setQueryStatus] = useState<QueryStatus>('idle')

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(MIN_RECONNECT_DELAY)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const streamingIdRef = useRef<string | null>(null)

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!port || !mountedRef.current) return

    const token = getAccessToken()
    if (!token) {
      setConnectionStatus('error')
      return
    }

    cleanup()
    setConnectionStatus('connecting')

    const wsUrl = `ws://${window.location.hostname}:${port}/ws/chat?token=${token}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnectionStatus('connected')
      reconnectDelayRef.current = MIN_RECONNECT_DELAY
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnectionStatus('disconnected')
      streamingIdRef.current = null
      setQueryStatus('idle')

      // Auto-reconnect with exponential backoff
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, reconnectDelayRef.current)

      reconnectDelayRef.current = Math.min(
        reconnectDelayRef.current * 2,
        MAX_RECONNECT_DELAY,
      )
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      setConnectionStatus('error')
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return

      let msg: { type: string; data?: string }
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      switch (msg.type) {
        case 'status': {
          const status = msg.data as 'querying' | 'idle'
          setQueryStatus(status === 'querying' ? 'querying' : 'idle')
          if (status === 'idle') {
            streamingIdRef.current = null
          }
          break
        }

        case 'text': {
          if (!streamingIdRef.current) {
            const id = generateId()
            streamingIdRef.current = id
            setMessages((prev) => [
              ...prev,
              { id, role: 'assistant', content: msg.data ?? '', timestamp: Date.now(), isStreaming: true },
            ])
          } else {
            const sid = streamingIdRef.current
            setMessages((prev) =>
              prev.map((m) =>
                m.id === sid ? { ...m, content: m.content + (msg.data ?? '') } : m,
              ),
            )
          }
          break
        }

        case 'final': {
          if (streamingIdRef.current) {
            const sid = streamingIdRef.current
            setMessages((prev) =>
              prev.map((m) =>
                m.id === sid ? { ...m, isStreaming: false, content: msg.data ?? m.content } : m,
              ),
            )
            streamingIdRef.current = null
          }
          break
        }

        case 'tool': {
          if (streamingIdRef.current) {
            const sid = streamingIdRef.current
            setMessages((prev) =>
              prev.map((m) =>
                m.id === sid ? { ...m, toolName: msg.data } : m,
              ),
            )
          }
          break
        }

        case 'error': {
          const id = generateId()
          setMessages((prev) => [
            ...prev,
            { id, role: 'assistant', content: `Error: ${msg.data ?? 'Unknown error'}`, timestamp: Date.now() },
          ])
          streamingIdRef.current = null
          setQueryStatus('idle')
          break
        }
      }
    }
  }, [port, cleanup])

  // Connect/disconnect on port change
  useEffect(() => {
    mountedRef.current = true

    if (port) {
      connect()
    } else {
      cleanup()
      setConnectionStatus('disconnected')
    }

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [port, connect, cleanup])

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

      const msg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, msg])
      wsRef.current.send(JSON.stringify({ type: 'message', text: trimmed }))
    },
    [],
  )

  const stopQuery = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    streamingIdRef.current = null
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear' }))
    }
  }, [])

  return { messages, connectionStatus, queryStatus, sendMessage, stopQuery, clearChat }
}
