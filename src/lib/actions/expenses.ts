// src/lib/actions/expenses.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateExpenseInput } from '@/lib/utils/expenses'
import type { SplitInput, Currency } from '@/types/database'

const RPC_ERROR_MESSAGES: Record<string, string> = {
  NOT_MEMBER: '你不是此行程成員',
  NOT_OWNER: '只有建立者可以編輯或刪除此費用',
  PAID_BY_NOT_MEMBER: '付款人不是行程成員',
  SPLIT_USER_NOT_MEMBER: '分擔成員中有非行程成員',
  SPLIT_SUM_MISMATCH: '分擔金額總和不等於費用金額',
  JPY_SPLIT_NOT_INTEGER: 'JPY 金額必須為整數',
  PAID_AT_REQUIRED: '請選擇付款時間',
}

function mapRpcError(message: string): string {
  const key = Object.keys(RPC_ERROR_MESSAGES).find(k => message.includes(k))
  return key ? RPC_ERROR_MESSAGES[key] : message
}

function normalizePaidAt(paidAt: string): string | null {
  const paidAtDate = new Date(paidAt)
  return paidAt && !Number.isNaN(paidAtDate.getTime()) ? paidAtDate.toISOString() : null
}

export async function createExpenseAction(params: {
  tripId: string
  title: string
  amount: number
  currency: Currency
  paidBy: string
  paidAt: string
  splits: SplitInput[]
}) {
  const { tripId, title, amount, currency, paidBy, paidAt, splits } = params

  const validationError = validateExpenseInput({ title, amount, splits })
  if (validationError) return { error: validationError }

  const paidAtIso = normalizePaidAt(paidAt)
  if (!paidAtIso) return { error: '請選擇付款時間' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_expense_with_splits', {
    p_trip_id: tripId,
    p_title: title.trim(),
    p_amount: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_paid_at: paidAtIso,
    p_splits: splits,
  })

  if (error) return { error: mapRpcError(error.message) }

  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}

export async function updateExpenseAction(params: {
  expenseId: string
  tripId: string
  title: string
  amount: number
  currency: Currency
  paidBy: string
  paidAt: string
  splits: SplitInput[]
}) {
  const { expenseId, tripId, title, amount, currency, paidBy, paidAt, splits } = params

  const validationError = validateExpenseInput({ title, amount, splits })
  if (validationError) return { error: validationError }

  const paidAtIso = normalizePaidAt(paidAt)
  if (!paidAtIso) return { error: '請選擇付款時間' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_expense_with_splits', {
    p_expense_id: expenseId,
    p_title: title.trim(),
    p_amount: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_paid_at: paidAtIso,
    p_splits: splits,
  })

  if (error) return { error: mapRpcError(error.message) }

  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}

export async function deleteExpenseAction(expenseId: string, tripId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_expense', {
    p_expense_id: expenseId,
  })

  if (error) return { error: mapRpcError(error.message) }
  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}
