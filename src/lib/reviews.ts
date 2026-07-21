import { createClient, getAuthUser } from '@/lib/supabase/server'
import { isExpenseRejected, approvalProgress } from '@/lib/utils/expenses'
import type { Currency, ExpenseKind } from '@/types/database'

export type PendingReview = {
  expenseId: string
  tripId: string
  tripName: string
  title: string
  amount: number
  currency: Currency
  paidAt: string
  payerName: string
  myShare: number
  approved: number
  total: number
  kind: ExpenseKind
}

type Row = {
  amount: number
  expense: {
    id: string
    title: string
    amount: number
    currency: Currency
    paid_at: string
    trip_id: string
    kind: ExpenseKind
    trip: { name: string } | null
    payer: { display_name: string } | null
    splits: { approval_status: 'pending' | 'approved' | 'rejected' }[]
  } | null
}

/**
 * Expenses awaiting the current user's approval: my split is pending AND the
 * expense has no rejected split (rejected is terminal — see approval design).
 * Single source of truth for both the /review page and the nav badge so their
 * counts never diverge.
 */
export async function getPendingReviews(): Promise<PendingReview[]> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('expense_splits')
    .select(`
      amount,
      expense:expenses!inner(
        id, title, amount, currency, paid_at, trip_id, kind,
        trip:trips!inner(name),
        payer:profiles!paid_by(display_name),
        splits:expense_splits(approval_status)
      )
    `)
    .eq('user_id', user.id)
    .eq('approval_status', 'pending')

  if (error) {
    console.error('Failed to load pending reviews', error)
    throw new Error('無法載入待審清單')
  }

  return ((data ?? []) as unknown as Row[])
    .filter((r): r is Row & { expense: NonNullable<Row['expense']> } => r.expense != null)
    .filter(r => !isExpenseRejected(r.expense.splits))
    .map(r => {
      const { approved, total } = approvalProgress(r.expense.splits)
      return {
        expenseId: r.expense.id,
        tripId: r.expense.trip_id,
        tripName: r.expense.trip?.name ?? '帳本',
        title: r.expense.title,
        amount: r.expense.amount,
        currency: r.expense.currency,
        paidAt: r.expense.paid_at,
        payerName: r.expense.payer?.display_name ?? '未知',
        myShare: r.amount,
        approved,
        total,
        kind: r.expense.kind,
      }
    })
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
}

/**
 * Lightweight badge query for the ledger list. The full review projection
 * joins trips, profiles, and every split; the startup screen only needs a
 * number, so keep that work inside Postgres and return one integer.
 */
export async function getPendingReviewCount(): Promise<number> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return 0

  const { data, error } = await supabase.rpc('get_pending_review_count')
  if (!error) return typeof data === 'number' ? data : Number(data ?? 0)

  // Keep deploys backward-compatible if application code reaches production
  // before the database migration. This path disappears once 0021 is applied.
  if (error.code === 'PGRST202' || error.code === '42883') {
    return (await getPendingReviews()).length
  }

  console.error('Failed to load pending review count', error)
  throw new Error('無法載入待審數量')
}
