// src/lib/actions/profile.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateDisplayName } from '@/lib/utils/profile'
import { validatePaymentAccount } from '@/lib/utils/payment-account'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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

export async function upsertPaymentAccountAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '請先登入' }

  const validation = validatePaymentAccount({
    bankCode: formData.get('bank_code'),
    accountNumber: formData.get('account_number'),
    accountHolder: formData.get('account_holder'),
  })
  if (!validation.ok) return { error: validation.error }

  const { error } = await supabase
    .from('payment_accounts')
    .upsert({ user_id: user.id, ...validation.value, updated_at: new Date().toISOString() })

  if (error) {
    // never log account details — error object alone is enough
    console.error('Failed to upsert payment account', error.code)
    return { error: '儲存失敗，請稍後再試' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function deletePaymentAccountAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '請先登入' }

  const { error } = await supabase
    .from('payment_accounts')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    console.error('Failed to delete payment account', error.code)
    return { error: '刪除失敗，請稍後再試' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

/**
 * Deletes the caller's account. The auth user (and OAuth identity) is
 * removed; the profiles row stays as an anonymized tombstone so shared
 * trip ledgers keep computing and display「已刪除使用者」.
 */
export async function deleteAccountAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '請先登入' }

  const admin = createAdminClient()

  const { error: pushError } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
  if (pushError) {
    console.error('Failed to delete push subscriptions', pushError)
    return { error: '刪除失敗，請稍後再試' }
  }

  // The profiles row survives as a tombstone, so the payment_accounts FK
  // cascade never fires — delete the bank account explicitly.
  const { error: paymentError } = await admin
    .from('payment_accounts')
    .delete()
    .eq('user_id', user.id)
  if (paymentError) {
    console.error('Failed to delete payment account', paymentError.code)
    return { error: '刪除失敗，請稍後再試' }
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      display_name: '已刪除使用者',
      avatar_url: null,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', user.id)
  if (profileError) {
    console.error('Failed to anonymize profile', profileError)
    return { error: '刪除失敗，請稍後再試' }
  }

  const { error: authError } = await admin.auth.admin.deleteUser(user.id)
  if (authError) {
    console.error('Failed to delete auth user', authError)
    return { error: '刪除失敗，請稍後再試' }
  }

  // Auth user is gone — only clear local session cookies.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  redirect('/login')
}
