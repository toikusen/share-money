// src/lib/supabase/server.ts
import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const createClient = cache(async () => {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
})

/**
 * Request-deduped auth lookup. Uses getClaims() so that — once the Supabase
 * project signs JWTs with an asymmetric key (ES256/RS256) — the access token
 * is verified locally via WebCrypto with zero network round trip, instead of
 * calling Supabase Auth on every page render. Under legacy HS256 keys
 * getClaims() transparently falls back to a getUser() network call, so this is
 * safe today and gets faster automatically once the JWT keys are migrated.
 * Only id/email are consumed by callers (verified 2026-07-10).
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null
  const { sub, email } = data.claims
  return { id: sub as string, email: email as string | undefined }
})
