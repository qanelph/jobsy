export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
  toolName?: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type QueryStatus = 'idle' | 'querying'
