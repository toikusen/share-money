// src/lib/actions/expenses.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SplitInput, Currency } from '@/types/database'

export async function createExpenseAction(params: {
  tripId: string
  title: string
  amount: number
  currency: Currency
  paidBy: string
  splits: SplitInput[]
}) {
  const { tripId, title, amount, currency, paidBy, splits } = params

  if (!title.trim()) return { error: '請輸入費用名稱' }
  if (amount <= 0) return { error: '金額必須大於 0' }
  if (splits.length === 0) return { error: '請選擇分擔成員' }

  const splitSum = splits.reduce((s, sp) => s + sp.amount, 0)
  if (Math.abs(splitSum - amount) > 0.005) return { error: '分擔金額總和不等於費用金額' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_expense_with_splits', {
    p_trip_id: tripId,
    p_title: title.trim(),
    p_amount: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_splits: splits,
  })

  if (error) {
    const msg: Record<string, string> = {
      NOT_MEMBER: '你不是此行程成員',
      PAID_BY_NOT_MEMBER: '付款人不是行程成員',
      SPLIT_USER_NOT_MEMBER: '分擔成員中有非行程成員',
      SPLIT_SUM_MISMATCH: '分擔金額總和不等於費用金額',
      JPY_SPLIT_NOT_INTEGER: 'JPY 金額必須為整數',
    }
    const key = Object.keys(msg).find(k => error.message.includes(k))
    return { error: key ? msg[key] : error.message }
  }

  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}

export async function deleteExpenseAction(expenseId: string, tripId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)

  if (error) return { error: error.message }
  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}
