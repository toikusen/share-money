'use client'

import { useEffect, useRef } from 'react'

const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/**
 * One responsive AdSense display unit, reusing a single ad unit id across placements.
 * Renders nothing unless both env vars are set, so dev/preview stay ad-free.
 *
 * The push must happen in an effect: soft navigation inserts this element without a
 * page load, and `adsbygoogle` is a queue that the loader drains once it arrives.
 */
export function AdUnit({ className = '' }: { className?: string }) {
  const filled = useRef(false)

  useEffect(() => {
    if (!client || !slot || filled.current) return
    filled.current = true
    const queue = (window.adsbygoogle ||= [])
    queue.push({})
  }, [])

  if (!client || !slot) return null

  return (
    <ins
      className={`adsbygoogle block ${className}`}
      style={{ display: 'block' }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  )
}
