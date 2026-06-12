'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createThrottleGate } from '@/lib/utils/timing'

/**
 * Re-fetches server data when the app returns to the foreground,
 * so PWA users don't keep staring at stale data after switching back.
 */
export function RefreshOnFocus() {
  const router = useRouter()

  useEffect(() => {
    const gate = createThrottleGate(5000)
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (gate()) router.refresh()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [router])

  return null
}
