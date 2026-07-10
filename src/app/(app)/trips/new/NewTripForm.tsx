'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CURRENCIES, FOREIGN_CURRENCIES } from '@/lib/utils/currency'
import { createTripAction } from '@/lib/actions/trips'
import type { Currency } from '@/types/database'

const inputClass =
  'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/35'

type Props = { rates: Record<Currency, number | null> }

export function NewTripForm({ rates }: Props) {
  const [currency, setCurrency] = useState<Currency>('JPY')
  const [rate, setRate] = useState<string>(rates['JPY'] != null ? String(rates['JPY']) : '')

  function onCurrencyChange(next: Currency) {
    setCurrency(next)
    const live = rates[next]
    setRate(live != null ? String(live) : '')
  }

  const liveRate = rates[currency]

  async function handleSubmit(formData: FormData) {
    await createTripAction(formData)
  }

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-6">
        <Link href="/trips" aria-label="返回行程" className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-base font-bold text-ink">新增行程</h1>
      </div>

      <form action={handleSubmit} className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
        <div>
          <label htmlFor="new-trip-name" className="block text-xs font-medium text-ink-3 mb-1.5">行程名稱</label>
          <input id="new-trip-name" name="name" type="text" required placeholder="東京五日遊" className={inputClass} />
        </div>

        <div>
          <p className="text-xs font-medium text-ink-3 mb-1.5">日期區間<span className="text-ink-4 font-normal ml-1">（選填）</span></p>
          <div className="flex items-center gap-2">
            <input name="start_date" type="date" aria-label="開始日期（選填）" className={`${inputClass} flex-1`} />
            <span className="text-ink-4 text-sm shrink-0" aria-hidden="true">–</span>
            <input name="end_date" type="date" aria-label="結束日期（選填）" className={`${inputClass} flex-1`} />
          </div>
          <p className="text-xs text-ink-4 mt-1.5">填了日期，行程頁會多一張「每日支出」圖</p>
        </div>

        <div>
          <label htmlFor="new-trip-currency" className="block text-xs font-medium text-ink-3 mb-1.5">外幣</label>
          <select
            id="new-trip-currency"
            name="foreign_currency"
            value={currency}
            onChange={e => onCurrencyChange(e.target.value as Currency)}
            className="w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
          >
            {FOREIGN_CURRENCIES.map(c => (
              <option key={c} value={c}>{c}・{CURRENCIES[c].label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="new-trip-rate" className="block text-xs font-medium text-ink-3 mb-1.5">
            匯率（1 {currency} = ? TWD）
          </label>
          <input
            id="new-trip-rate"
            name="exchange_rate"
            type="number"
            step="0.0001"
            min="0.0001"
            required
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="請手動輸入"
            className={`${inputClass} font-mono tabular-nums`}
          />
          {liveRate != null ? (
            <p className="text-xs text-ink-4 mt-1.5">已自動填入即時匯率，可手動修改</p>
          ) : (
            <p className="text-xs text-owe mt-1.5">無法取得 {currency} 即時匯率，請手動輸入</p>
          )}
        </div>

        <button type="submit" className="w-full bg-accent text-white py-3 rounded-xl text-sm font-semibold hover:bg-accent-deep transition-colors">
          建立行程
        </button>
      </form>
    </main>
  )
}
