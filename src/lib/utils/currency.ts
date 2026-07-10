import type { Currency, ForeignCurrency } from '@/types/database'

export const CURRENCIES: Record<Currency, { label: string; symbol: string; decimals: number }> = {
  JPY: { label: '日圓', symbol: '¥', decimals: 0 },
  KRW: { label: '韓元', symbol: '₩', decimals: 0 },
  VND: { label: '越南盾', symbol: '₫', decimals: 0 },
  USD: { label: '美金', symbol: '$', decimals: 2 },
  HKD: { label: '港幣', symbol: 'HK$', decimals: 2 },
  CNY: { label: '人民幣', symbol: 'CN¥', decimals: 2 },
  EUR: { label: '歐元', symbol: '€', decimals: 2 },
  THB: { label: '泰銖', symbol: '฿', decimals: 2 },
  GBP: { label: '英鎊', symbol: '£', decimals: 2 },
  TWD: { label: '台幣', symbol: 'NT$', decimals: 2 },
}

export const FOREIGN_CURRENCIES: ForeignCurrency[] =
  (Object.keys(CURRENCIES) as Currency[]).filter((c): c is ForeignCurrency => c !== 'TWD')

/** 從 USD 基準匯率表算出 外幣→TWD 匯率；家用幣或缺資料回傳 null。 */
export function foreignToTwdRate(usdRates: Record<string, number>, currency: Currency): number | null {
  if (currency === 'TWD') return null
  const usdTwd = usdRates['USDTWD']
  const usdCur = usdRates[`USD${currency}`]
  if (!usdTwd || !usdCur) return null
  return Math.round((usdTwd / usdCur) * 10000) / 10000
}

export function convertToTWD(amount: number, currency: Currency, rate: number): number {
  if (currency === 'TWD') return amount
  return Math.round(amount * rate * 100) / 100
}

export function formatAmount(amount: number, currency: Currency): string {
  const { symbol, decimals } = CURRENCIES[currency]
  const value = decimals === 0
    ? Math.round(amount).toLocaleString()
    : amount.toFixed(decimals)
  return `${symbol}${value}`
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
 * `custom: null` share the remaining total equally (zero-decimal vs 2-decimal
 * rounding follows splitEqually). Invalid when custom amounts exceed the total, or when
 * everyone is custom and the sum doesn't match the total.
 */
export function splitWithRemainder(
  total: number,
  currency: Currency,
  entries: HybridSplitEntry[],
): HybridSplitResult {
  const decimals = CURRENCIES[currency].decimals
  const round = (n: number) =>
    decimals === 0 ? Math.round(n) : Math.round(n * 100) / 100

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
  if (CURRENCIES[currency].decimals === 0) {
    const base = Math.floor(total / count)
    const remainder = Math.round(total) - base * count
    return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base))
  }
  const base = Math.floor((total / count) * 100) / 100
  const remainder = Math.round((total - base * count) * 100) / 100
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? Math.round((base + remainder) * 100) / 100 : base
  )
}
