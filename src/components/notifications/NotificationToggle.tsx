'use client'

import { useEffect, useState } from 'react'
import { isPushSupported, enablePush, disablePush } from '@/lib/push-client'

type State = 'loading' | 'unsupported' | 'on' | 'off' | 'blocked'

export function NotificationToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function readSubscription() {
      let nextState: State = 'off'
      if (!isPushSupported()) nextState = 'unsupported'
      else if (Notification.permission === 'denied') nextState = 'blocked'
      else {
        try {
          const reg = await navigator.serviceWorker.getRegistration('/sw.js')
          const sub = await reg?.pushManager.getSubscription()
          nextState = sub ? 'on' : 'off'
        } catch {
          nextState = 'off'
        }
      }

      if (!cancelled) setState(nextState)
    }

    void readSubscription()
    return () => { cancelled = true }
  }, [])

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (state === 'on') { await disablePush(); setState('off') }
      else {
        const res = await enablePush()
        if (res === 'error') setError('訂閱無法儲存,請稍後再試')
        setState(res === 'enabled' ? 'on' : res === 'denied' ? 'blocked' : res === 'unsupported' ? 'unsupported' : 'off')
      }
    } catch (e) {
      // Surface the real failure (e.g. pushManager.subscribe AbortError) —
      // a silent throw here is indistinguishable from a dead button.
      setError(e instanceof Error ? `開啟失敗:${e.message}` : '開啟失敗,請稍後再試')
      setState('off')
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
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={state === 'on'}
        aria-label={state === 'on' ? '關閉推播通知' : '開啟推播通知'}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${state === 'on' ? 'bg-accent' : 'bg-line'}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${state === 'on' ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}
