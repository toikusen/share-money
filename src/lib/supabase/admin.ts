import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client — bypasses RLS. Use ONLY in trusted server code
 * (sending push to other users, reassigning subscription endpoints).
 * Never expose the key to the client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
