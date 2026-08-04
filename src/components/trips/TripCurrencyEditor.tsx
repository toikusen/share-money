'use client'

import { useState } from 'react'
import { FOREIGN_CURRENCIES } from '@/lib/utils/currency'
import { updateTripCurrencyAction } from '@/lib/actions/trips'
import type { ForeignCurrency } from '@/types/database'

type Props = {
  tripId: string
  /** null = 還沒開外幣的帳本,先收起成一行入口 */
  currency: ForeignCurrency | null
  rate: number | null
  rates: Record<ForeignCurrency, number | null>
}

const DEFAULT_CURRENCY: ForeignCurrency = 'JPY'

/**
 * Rate toolbar shown while a trip's currency is still switchable: the foreign
 * currency is a dropdown, and switching it refills the rate from the pre-fetched
 * live table. Two entry states:
 * - currency = null: ledger is pure TWD, render a collapsed "開啟外幣記帳" link.
 * - currency set: the trip has no expenses yet, so the currency can still change.
 * Once a foreign ledger has expenses the trip page renders the currency as text.
 */
export function TripCurrencyEditor({ tripId, currency: initialCurrency, rate: initialRate, rates }: Props) {
  const [open, setOpen] = useState(initialCurrency != null)
  const [currency, setCurrency] = useState<ForeignCurrency>(initialCurrency ?? DEFAULT_CURRENCY)
  const [rate, setRate] = useState(String(initialRate ?? rates[DEFAULT_CURRENCY] ?? ''))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function onCurrencyChange(next: ForeignCurrency) {
    setCurrency(next)
    const live = rates[next]
    if (live != null) setRate(String(live))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const res = await updateTripCurrencyAction(tripId, currency, parseFloat(rate))
    setPending(false)
    if (res?.error) setError(res.error)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs text-ink-3 hover:text-accent transition-colors"
      >
        ＋ 開啟外幣記帳
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3 mt-3">
      <span>匯率 1</span>
      <select
        value={currency}
        onChange={e => onCurrencyChange(e.target.value as ForeignCurrency)}
        aria-label="外幣幣別"
        className="bg-fill border-0 rounded-md px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
      >
        {FOREIGN_CURRENCIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <span>=</span>
      <input
        value={rate}
        onChange={e => setRate(e.target.value)}
        type="number"
        step="0.0001"
        min="0.0001"
        aria-label="匯率"
        className="w-20 bg-fill border-0 rounded-md px-2 py-1 text-xs text-ink text-right font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/35"
      />
      <span>TWD</span>
      <button
        type="submit"
        disabled={pending}
        className="ml-1 text-accent hover:text-accent-deep text-xs font-medium transition-colors disabled:opacity-50"
      >
        {initialCurrency == null ? '開啟' : '更新'}
      </button>
      {initialCurrency == null && (
        <p className="w-full text-ink-4">已記錄的台幣支出維持台幣，不會被換算</p>
      )}
      {error && <span className="text-owe w-full" role="alert">{error}</span>}
    </form>
  )
}
