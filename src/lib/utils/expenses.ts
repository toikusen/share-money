import type { ApprovalStatus, SplitInput } from '@/types/database'

/** An expense counts toward settlement only when every split is approved. */
export function isExpenseApproved(splits: { approval_status: ApprovalStatus }[]): boolean {
  return splits.length > 0 && splits.every(s => s.approval_status === 'approved')
}

/** An expense is rejected when any split is rejected (terminal until edited). */
export function isExpenseRejected(splits: { approval_status: ApprovalStatus }[]): boolean {
  return splits.some(s => s.approval_status === 'rejected')
}

/**
 * Set of expense ids that are fully approved, from a flat splits list
 * (balance page fetches expenses and splits separately).
 */
export function approvedExpenseIds(
  splits: { expense_id: string; approval_status: ApprovalStatus }[]
): Set<string> {
  const allApproved = new Map<string, boolean>()
  for (const s of splits) {
    const prev = allApproved.get(s.expense_id) ?? true
    allApproved.set(s.expense_id, prev && s.approval_status === 'approved')
  }
  return new Set([...allApproved].filter(([, ok]) => ok).map(([id]) => id))
}

/** Approval counts for the expense-list status badge, e.g. "待審 1/2". */
export function approvalProgress(splits: { approval_status: ApprovalStatus }[]) {
  const total = splits.length
  const approved = splits.filter(s => s.approval_status === 'approved').length
  return { approved, total }
}

/**
 * Validates expense input shared by create/update actions.
 * Returns an error message, or null when valid.
 */
export function validateExpenseInput(params: {
  title: string
  amount: number
  splits: SplitInput[]
}): string | null {
  const { title, amount, splits } = params
  if (!title.trim()) return '請輸入費用名稱'
  if (!(amount > 0)) return '金額必須大於 0'
  if (splits.length === 0) return '請選擇分擔成員'

  const splitSum = splits.reduce((s, sp) => s + sp.amount, 0)
  if (Math.abs(splitSum - amount) > 0.005) return '分擔金額總和不等於費用金額'

  return null
}
