'use client'

import { useEffect, useState } from 'react'
import { isPushSupported, enablePush } from '@/lib/push-client'

const DISMISS_KEY = 'push-prompt-dismissed'

export function NotificationPrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) return
    if (Notification.permission !== 'default') return
    if (localStorage.getItem(DISMISS_KEY)) return
    setShow(true)
  }, [])

  if (!show) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  async function enable() {
    setBusy(true)
    try { await enablePush() } finally {
      localStorage.setItem(DISMISS_KEY, '1')
      setShow(false)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-card-hover p-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">開啟通知</p>
          <p className="text-xs text-ink-4 mt-0.5">有人找你審核、或你的費用有結果時提醒你</p>
        </div>
        <button type="button" onClick={dismiss} className="text-[13px] text-ink-4 px-2 py-1.5">稍後</button>
        <button type="button" onClick={enable} disabled={busy}
          className="text-[13px] font-semibold text-white bg-accent rounded-lg px-3 py-1.5 disabled:opacity-50">
          開啟
        </button>
      </div>
    </div>
  )
}
