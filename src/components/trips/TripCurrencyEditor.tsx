'use client'

import { useState } from 'react'
import { FOREIGN_CURRENCIES } from '@/lib/utils/currency'
import { updateTripCurrencyAction } from '@/lib/actions/trips'
import type { ForeignCurrency } from '@/types/database'

type Props = {
  tripId: string
  currency: ForeignCurrency
  rate: number
  rates: Record<ForeignCurrency, number | null>
}

/**
 * Rate toolbar shown while a trip has no expenses yet: the foreign currency is
 * still a dropdown, and switching it refills the rate from the pre-fetched live
 * table. Once expenses exist the trip page renders the currency as static text.
 */
export function TripCurrencyEditor({ tripId, currency: initialCurrency, rate: initialRate, rates }: Props) {
  const [currency, setCurrency] = useState<ForeignCurrency>(initialCurrency)
  const [rate, setRate] = useState(String(initialRate))
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
        更新
      </button>
      {error && <span className="text-owe w-full" role="alert">{error}</span>}
    </form>
  )
}
