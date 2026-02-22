import type { TelegramUser, TokenPayload } from '@/types/auth'

const TOKEN_KEY = 'jobsy_token'
const REFRESH_KEY = 'jobsy_refresh_token'

export const authStorage = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_KEY)
  },

  setToken(token: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(TOKEN_KEY, token)
  },

  removeToken(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(TOKEN_KEY)
  },

  isTokenExpired(token: string): boolean {
    const payload = this.decodeToken(token)
    if (!payload) return true
    return Date.now() >= payload.exp * 1000
  },

  decodeToken(token: string): TokenPayload | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded) as TokenPayload
  },

  isAuthenticated(): boolean {
    const token = this.getToken()
    if (!token) return false
    return !this.isTokenExpired(token)
  },
}

// Простые функции для совместимости
export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
  // Дублируем в cookies для Next.js middleware
  document.cookie = `${TOKEN_KEY}=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`
}

export function loadTelegramWidget(onAuth: (user: TelegramUser) => void): void {
  if (typeof window === 'undefined') return

  const script = document.createElement('script')
  script.src = 'https://telegram.org/js/telegram-widget.js?22'
  script.setAttribute('data-telegram-login', process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'jobsy_bot')
  script.setAttribute('data-size', 'large')
  script.setAttribute('data-onauth', 'onTelegramAuth(user)')
  script.setAttribute('data-request-access', 'write')
  script.async = true

  ;(window as any).onTelegramAuth = onAuth

  document.getElementById('telegram-login-container')?.appendChild(script)
}
