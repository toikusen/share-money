// src/lib/actions/expenses.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateExpenseInput } from '@/lib/utils/expenses'
import type { SplitInput, Currency } from '@/types/database'
import { sendPushToUsers } from '@/lib/push'
import { pendingRecipients, approvalNeededPayload, rejectedPayload, approvedPayload } from '@/lib/notify'

const RPC_ERROR_MESSAGES: Record<string, string> = {
  NOT_MEMBER: '你不是此行程成員',
  NOT_OWNER: '只有建立者可以編輯或刪除此費用',
  PAID_BY_NOT_MEMBER: '付款人不是行程成員',
  SPLIT_USER_NOT_MEMBER: '分擔成員中有非行程成員',
  SPLIT_SUM_MISMATCH: '分擔金額總和不等於費用金額',
  JPY_SPLIT_NOT_INTEGER: 'JPY 金額必須為整數',
  PAID_AT_REQUIRED: '請選擇付款時間',
  EXPENSE_REJECTED: '此費用已被拒絕,請等建立者修改後再審核',
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
  note?: string
  splits: SplitInput[]
}) {
  const { tripId, title, amount, currency, paidBy, paidAt, note, splits } = params

  const validationError = validateExpenseInput({ title, amount, splits })
  if (validationError) return { error: validationError }

  const paidAtIso = normalizePaidAt(paidAt)
  if (!paidAtIso) return { error: '請選擇付款時間' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: expenseId, error } = await supabase.rpc('create_expense_with_splits', {
    p_trip_id: tripId,
    p_title: title.trim(),
    p_amount: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_paid_at: paidAtIso,
    p_splits: splits,
    p_note: note ?? null,
  })

  if (error) return { error: mapRpcError(error.message) }

  if (user && expenseId) {
    const recipients = pendingRecipients(splits, user.id)
    await sendPushToUsers(recipients, approvalNeededPayload(title.trim()))
  }

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
  note?: string
  splits: SplitInput[]
}) {
  const { expenseId, tripId, title, amount, currency, paidBy, paidAt, note, splits } = params

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
    p_note: note ?? null,
  })

  if (error) return { error: mapRpcError(error.message) }

  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}

/**
 * Revalidate every surface that reflects approval state: the review page,
 * the trip and its balance, plus the layout for the nav badge count.
 */
function revalidateApprovalSurfaces(tripId?: string) {
  revalidatePath('/review')
  revalidatePath('/', 'layout')
  if (tripId) {
    revalidatePath(`/trips/${tripId}`)
    revalidatePath(`/trips/${tripId}/balance`)
  }
}

export async function approveExpenseAction(expenseId: string, tripId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: fullyApprovedId, error } = await supabase.rpc('approve_expense', { p_expense_id: expenseId })
  if (error) return { error: mapRpcError(error.message) }

  if (fullyApprovedId) {
    const { data: exp } = await supabase
      .from('expenses')
      .select('title, trip_id, created_by')
      .eq('id', fullyApprovedId)
      .single()
    if (exp && exp.created_by !== user?.id) {
      await sendPushToUsers([exp.created_by], approvedPayload(exp.title, exp.trip_id))
    }
  }

  revalidateApprovalSurfaces(tripId)
  return { success: true }
}

export async function rejectExpenseAction(expenseId: string, tripId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: didReject, error } = await supabase.rpc('reject_expense', { p_expense_id: expenseId })
  if (error) return { error: mapRpcError(error.message) }

  if (didReject) {
    const { data: exp } = await supabase
      .from('expenses')
      .select('title, trip_id, created_by')
      .eq('id', expenseId)
      .single()
    if (exp && exp.created_by !== user?.id) {
      await sendPushToUsers([exp.created_by], rejectedPayload(exp.title, exp.trip_id))
    }
  }

  revalidateApprovalSurfaces(tripId)
  return { success: true }
}

export async function approveAllPendingAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: ids, error } = await supabase.rpc('approve_all_pending')
  if (error) return { error: mapRpcError(error.message) }

  // PostgREST can return SETOF uuid as string[] OR as { approve_all_pending: string }[]
  // depending on version. Normalize defensively to string[] before use.
  const rawIds = (ids ?? []) as unknown[]
  const approvedIds = rawIds.map(r =>
    typeof r === 'string' ? r : ((r as Record<string, unknown>).approve_all_pending ?? (r as Record<string, unknown>).expense_id ?? Object.values(r as Record<string, unknown>)[0]) as string
  )

  if (approvedIds.length > 0) {
    const { data: exps } = await supabase
      .from('expenses')
      .select('title, trip_id, created_by')
      .in('id', approvedIds)
    for (const exp of exps ?? []) {
      if (exp.created_by !== user?.id) {
        await sendPushToUsers([exp.created_by], approvedPayload(exp.title, exp.trip_id))
      }
    }
  }

  revalidateApprovalSurfaces()
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
