// src/lib/actions/members.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function joinTripAction(inviteToken: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${inviteToken}`)}`)

  const { data, error } = await supabase.rpc('join_trip', {
    p_invite_token: inviteToken,
  })

  if (error) {
    if (error.message.includes('INVALID_TOKEN')) {
      redirect('/join/invalid')
    }
    return { error: error.message }
  }

  revalidatePath('/trips')
  revalidatePath(`/trips/${data}`)
  redirect(`/trips/${data}`)
}
