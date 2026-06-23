import { buildPushPayload } from '@block65/webcrypto-web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationPayload } from '@/lib/notify'

const vapid = () => ({
  subject: process.env.VAPID_SUBJECT!,
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  privateKey: process.env.VAPID_PRIVATE_KEY!,
})

/**
 * Best-effort fan-out. Reads recipients' subscriptions via service role,
 * sends each, and prunes subscriptions the push service reports as gone
 * (404/410). NEVER throws — callers fire-and-forget so the main action
 * is unaffected by push failures.
 */
export async function sendPushToUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
  try {
    if (userIds.length === 0) return
    const admin = createAdminClient()
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', userIds)
    if (error || !subs?.length) return

    // data accepts Jsonifiable — pass the object directly (not JSON.stringify)
    const message = { data: payload, options: { ttl: 60 } }

    await Promise.all(subs.map(async sub => {
      try {
        // PushSubscription requires expirationTime per the library's type definition
        const subscription = {
          endpoint: sub.endpoint,
          expirationTime: null,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }
        const req = await buildPushPayload(message, subscription, vapid())
        // Cast: lib returns Uint8Array<ArrayBufferLike> body; DOM types expect plain
        // Uint8Array but both are valid BodyInit at runtime (CF Workers + browsers).
        const res = await fetch(sub.endpoint, req as RequestInit)
        if (res.status === 404 || res.status === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      } catch (err) {
        console.error('push send failed', { endpoint: sub.endpoint, err })
      }
    }))
  } catch (err) {
    console.error('sendPushToUsers failed', err)
  }
}
