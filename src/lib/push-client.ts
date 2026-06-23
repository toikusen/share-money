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

function extractKeys(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON()
  return { endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth }
}

export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })
  await saveSubscriptionAction(extractKeys(sub))
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
