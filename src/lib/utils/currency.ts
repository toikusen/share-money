import type { Currency } from '@/types/database'

export function convertToTWD(amount: number, currency: Currency, rate: number): number {
  if (currency === 'TWD') return amount
  return Math.round(amount * rate * 100) / 100
}

export function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'JPY') return `¥${Math.round(amount).toLocaleString()}`
  return `NT$${amount.toFixed(2)}`
}

/**
 * Checks whether existing split amounts match what splitEqually would
 * produce, so an expense can be reopened in "equal" mode when editing.
 */
export function isEqualSplit(total: number, currency: Currency, amounts: number[]): boolean {
  if (amounts.length === 0) return false
  const expected = splitEqually(total, amounts.length, currency)
  const sorted = [...amounts].sort((a, b) => a - b)
  const expectedSorted = [...expected].sort((a, b) => a - b)
  return sorted.every((amt, i) => Math.abs(amt - expectedSorted[i]) < 0.005)
}

export type HybridSplitEntry = { id: string; custom: number | null }

export type HybridSplitResult = {
  splits: Array<{ user_id: string; amount: number }>
  customSum: number
  remaining: number
  autoCount: number
  valid: boolean
}

/**
 * Hybrid split: members with a custom amount pay exactly that; members with
 * `custom: null` share the remaining total equally (JPY/TWD rounding rules
 * follow splitEqually). Invalid when custom amounts exceed the total, or when
 * everyone is custom and the sum doesn't match the total.
 */
export function splitWithRemainder(
  total: number,
  currency: Currency,
  entries: HybridSplitEntry[],
): HybridSplitResult {
  const round = (n: number) =>
    currency === 'JPY' ? Math.round(n) : Math.round(n * 100) / 100

  const customSum = round(entries.reduce((sum, e) => sum + (e.custom ?? 0), 0))
  const remaining = round(total - customSum)
  const autoEntries = entries.filter(e => e.custom == null)
  const autoAmounts = splitEqually(Math.max(remaining, 0), autoEntries.length, currency)

  let autoIndex = 0
  const splits = entries.map(e => ({
    user_id: e.id,
    amount: e.custom ?? autoAmounts[autoIndex++],
  }))

  const valid = autoEntries.length > 0
    ? remaining >= -0.005
    : Math.abs(customSum - total) < 0.005

  return { splits, customSum, remaining, autoCount: autoEntries.length, valid }
}

export function splitEqually(total: number, count: number, currency: Currency): number[] {
  if (count === 0) return []
  if (currency === 'JPY') {
    const base = Math.floor(total / count)
    const remainder = Math.round(total) - base * count
    return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base))
  }
  // TWD: 2 decimal places
  const base = Math.floor((total / count) * 100) / 100
  const remainder = Math.round((total - base * count) * 100) / 100
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? Math.round((base + remainder) * 100) / 100 : base
  )
}
