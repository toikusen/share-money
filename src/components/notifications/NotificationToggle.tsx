'use client'

import { useEffect, useState } from 'react'
import { isPushSupported, enablePush, disablePush } from '@/lib/push-client'

type State = 'loading' | 'unsupported' | 'on' | 'off' | 'blocked'

export function NotificationToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('blocked'); return }
    navigator.serviceWorker.getRegistration('/sw.js')
      .then(reg => reg?.pushManager.getSubscription())
      .then(sub => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'))
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      if (state === 'on') { await disablePush(); setState('off') }
      else {
        const res = await enablePush()
        setState(res === 'enabled' ? 'on' : res === 'denied' ? 'blocked' : 'unsupported')
      }
    } finally { setBusy(false) }
  }

  if (state === 'loading') return null
  if (state === 'unsupported')
    return <p className="text-xs text-ink-4">此裝置不支援推播(iOS 需先將 App 加入主畫面)。</p>
  if (state === 'blocked')
    return <p className="text-xs text-ink-4">通知已被瀏覽器封鎖,請到瀏覽器設定開啟。</p>

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-ink">推播通知</p>
        <p className="text-xs text-ink-4 mt-0.5">有人找你審核、或你的費用被退回/通過時提醒你</p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={state === 'on'}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${state === 'on' ? 'bg-accent' : 'bg-line'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${state === 'on' ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
