import type { SplitInput } from '@/types/database'

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
