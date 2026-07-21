'use client'

import { useState } from 'react'
import { isPushSupported, enablePush } from '@/lib/push-client'

const DISMISS_KEY = 'push-prompt-dismissed'

export function NotificationPrompt() {
  const [show, setShow] = useState(() => (
    isPushSupported()
    && Notification.permission === 'default'
    && !localStorage.getItem(DISMISS_KEY)
  ))
  const [busy, setBusy] = useState(false)

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
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-card-hover p-4">
        <p className="text-sm font-medium text-ink">開啟通知</p>
        <p className="text-xs text-ink-4 mt-0.5">有人找你審核、或你的費用有結果時提醒你</p>
        <div className="flex items-center justify-end gap-2 mt-3">
          <button type="button" onClick={dismiss}
            className="text-[13px] text-ink-4 px-3 py-1.5 rounded-lg hover:bg-fill transition-colors">
            稍後
          </button>
          <button type="button" onClick={enable} disabled={busy}
            className="text-[13px] font-semibold text-white bg-accent rounded-lg px-4 py-1.5 hover:bg-accent-deep transition-colors disabled:opacity-50">
            開啟
          </button>
        </div>
      </div>
    </div>
  )
}
