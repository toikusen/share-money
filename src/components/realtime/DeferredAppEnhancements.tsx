'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { RefreshOnFocus } from './RefreshOnFocus'

const RealtimeRefresher = dynamic(
  () => import('./RealtimeRefresher').then(mod => mod.RealtimeRefresher),
  { ssr: false },
)

const NotificationPrompt = dynamic(
  () => import('../notifications/NotificationPrompt').then(mod => mod.NotificationPrompt),
  { ssr: false },
)

type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

/**
 * Realtime and push are valuable after the first screen is usable, but neither
 * is needed to paint it. Loading them during idle time keeps the Supabase
 * realtime client and its WebSocket setup off the startup critical path.
 */
export function DeferredAppEnhancements() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const idleWindow = window as IdleWindow
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setReady(true), { timeout: 1500 })
      return () => idleWindow.cancelIdleCallback?.(handle)
    }

    const handle = window.setTimeout(() => setReady(true), 600)
    return () => window.clearTimeout(handle)
  }, [])

  return (
    <>
      <RefreshOnFocus />
      {ready && (
        <>
          <RealtimeRefresher />
          <NotificationPrompt />
        </>
      )}
    </>
  )
}
