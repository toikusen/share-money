// src/lib/actions/members.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function joinTripAction(inviteToken: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('join_trip', {
    p_invite_token: inviteToken,
  })

  if (error) {
    if (error.message.includes('INVALID_TOKEN')) {
      redirect('/join/invalid')
    }
    return { error: error.message }
  }

  redirect(`/trips/${data}`)
}
