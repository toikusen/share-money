// src/lib/actions/profile.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { validateDisplayName } from '@/lib/utils/profile'
import { revalidatePath } from 'next/cache'

export async function updateDisplayNameAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '請先登入' }

  const validation = validateDisplayName(formData.get('display_name'))
  if (!validation.ok) return { error: validation.error }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: validation.value })
    .eq('id', user.id)

  if (error) {
    console.error('Failed to update display name', error)
    return { error: '更新失敗，請稍後再試' }
  }

  // Display name appears across trips, expenses, and balance pages
  revalidatePath('/', 'layout')
  return { success: true }
}
