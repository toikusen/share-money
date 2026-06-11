import type { Currency } from '@/types/database'

export function convertToTWD(amount: number, currency: Currency, rate: number): number {
  if (currency === 'TWD') return amount
  return Math.round(amount * rate * 100) / 100
}

export function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'JPY') return `¥${Math.round(amount).toLocaleString()}`
  return `NT$${amount.toFixed(2)}`
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
