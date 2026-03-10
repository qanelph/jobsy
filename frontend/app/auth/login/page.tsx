'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setTokens } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        throw new Error('Неверный email или пароль')
      }

      const data = await response.json()
      setTokens(data.access_token, data.refresh_token)
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-void">
      <div className="w-full max-w-[320px]">
        <div className="mb-8">
          <h1 className="text-text-bright font-mono text-lg tracking-tight">jobsy</h1>
          <p className="text-text-dim text-sm mt-1">вход</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-rose text-sm">{error}</div>
          )}

          <div>
            <label htmlFor="email" className="block text-text-dim text-xs mb-1.5">email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@jobsy.dev"
              className="w-full h-9 bg-panel border border-line-faint rounded px-3 text-sm text-text-main placeholder:text-text-dim focus:outline-none focus:border-line-subtle"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-text-dim text-xs mb-1.5">пароль</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-9 bg-panel border border-line-faint rounded px-3 text-sm text-text-main placeholder:text-text-dim focus:outline-none focus:border-line-subtle"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-9 bg-text-bright text-void text-sm font-medium rounded hover:bg-text-main disabled:opacity-40 transition-colors"
          >
            {loading ? '...' : 'войти'}
          </button>

          <p className="text-text-dim text-xs text-center">
            admin@jobsy.dev / admin123
          </p>
        </form>
      </div>
    </div>
  )
}
