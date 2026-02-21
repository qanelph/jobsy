export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: {
    id: number
    username: string
    first_name: string
    last_name: string | null
  }
}

export interface TokenPayload {
  sub: string
  exp: number
  telegram_user_id: number
}
