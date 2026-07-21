import { saveSubscriptionAction, deleteSubscriptionAction } from '@/lib/actions/push'

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

// VAPID public key (URL-safe base64) → Uint8Array for applicationServerKey.
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function toBase64Url(buf: ArrayBuffer | null): string | null {
  if (!buf || buf.byteLength === 0) return null
  let bin = ''
  for (const byte of new Uint8Array(buf)) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function extractKeys(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  // Safari/iOS may omit `keys` from toJSON() — getKey() is the reliable path.
  const p256dh = toBase64Url(sub.getKey('p256dh'))
  const auth = toBase64Url(sub.getKey('auth'))
  if (!p256dh || !auth) throw new Error('瀏覽器未提供推播金鑰,請更新 iOS/Safari 後再試')
  return { endpoint: sub.endpoint, p256dh, auth }
}

export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported' | 'error'> {
  if (!isPushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('推播金鑰未設定(NEXT_PUBLIC_VAPID_PUBLIC_KEY)')

  await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  })
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  })
  const saved = await saveSubscriptionAction(extractKeys(sub))
  if (saved && 'error' in saved) {
    // Server rejected the subscription — undo the local one so the toggle
    // doesn't read a browser subscription the server will never push to.
    await sub.unsubscribe().catch(() => {})
    return 'error'
  }
  return 'enabled'
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await deleteSubscriptionAction(sub.endpoint)
    await sub.unsubscribe()
  }
}
