'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
      </motion.div>
    </div>
  )
}
