'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Upsert the caller's subscription via service role keyed on endpoint, so a
 * device re-used across accounts gets reassigned to the current user
 * (endpoint is UNIQUE; a plain RLS upsert would be blocked when the row still
 * belongs to the previous account).
 */
export async function saveSubscriptionAction(sub: { endpoint: string; p256dh: string; auth: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { onConflict: 'endpoint' },
    )
  if (error) {
    console.error('saveSubscription failed', error)
    return { error: '無法儲存通知訂閱' }
  }
  return { success: true }
}

export async function deleteSubscriptionAction(endpoint: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: true }
  // RLS delete policy scopes this to the caller's own rows.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return { success: true }
}
