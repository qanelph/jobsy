'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authStorage } from '@/lib/auth'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    if (authStorage.isAuthenticated()) {
      router.push('/agents')
    } else {
      router.push('/auth/login')
    }
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Загрузка...</h1>
      </div>
    </div>
  )
}
