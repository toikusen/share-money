'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CURRENCIES, FOREIGN_CURRENCIES } from '@/lib/utils/currency'
import { ledgerTypeMeta, type DateMode } from '@/lib/utils/ledger-type'
import { toDateTimeLocalValue } from '@/lib/utils/datetime'
import { LedgerTypeGrid } from '@/components/trips/LedgerTypeGrid'
import { createTripAction } from '@/lib/actions/trips'
import type { ForeignCurrency, LedgerType } from '@/types/database'

const inputClass =
  'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/35'

const DATE_MODES: ReadonlyArray<[DateMode, string]> = [
  ['single', '單日'],
  ['range', '多天區間'],
  ['none', '不指定'],
]

type Props = { rates: Record<ForeignCurrency, number | null> }

export function NewTripForm({ rates }: Props) {
  const [type, setType] = useState<LedgerType>('travel')
  const [dateMode, setDateMode] = useState<DateMode>('range')
  const [dateTouched, setDateTouched] = useState(false)
  const [fxOn, setFxOn] = useState(true)
  const [fxTouched, setFxTouched] = useState(false)
  const [currency, setCurrency] = useState<ForeignCurrency>('JPY')
  const [rate, setRate] = useState<string>(rates['JPY'] != null ? String(rates['JPY']) : '')

  const meta = ledgerTypeMeta(type)

  // 換類型只帶動使用者還沒動過的欄位;動過就不覆蓋。
  function onTypeChange(next: LedgerType) {
    setType(next)
    const nextMeta = ledgerTypeMeta(next)
    if (!dateTouched) setDateMode(nextMeta.dateMode)
    if (!fxTouched) setFxOn(nextMeta.defaultForeign)
  }

  function onCurrencyChange(next: ForeignCurrency) {
    setCurrency(next)
    const live = rates[next]
    setRate(live != null ? String(live) : '')
  }

  const liveRate = rates[currency]
  const today = toDateTimeLocalValue().slice(0, 10)

  async function handleSubmit(formData: FormData) {
    await createTripAction(formData)
  }

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-6">
        <Link href="/trips" aria-label="返回帳本" className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-base font-bold text-ink">新帳本</h1>
      </div>

      <form action={handleSubmit} className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="date_mode" value={dateMode} />

        <LedgerTypeGrid value={type} onChange={onTypeChange} />

        <div>
          <label htmlFor="new-trip-name" className="block text-xs font-medium text-ink-3 mb-1.5">名稱</label>
          <input id="new-trip-name" name="name" type="text" required placeholder={meta.placeholder} className={inputClass} />
        </div>

        <div>
          <p className="text-xs font-medium text-ink-3 mb-1.5">日期<span className="text-ink-4 font-normal ml-1">（選填）</span></p>
          <div className="flex bg-fill rounded-[9px] p-0.5 gap-0.5 mb-2">
            {DATE_MODES.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setDateMode(mode); setDateTouched(true) }}
                aria-pressed={dateMode === mode}
                className={`flex-1 text-xs font-semibold whitespace-nowrap rounded-[7px] px-3 py-[5px] transition-all ${
                  dateMode === mode ? 'bg-white text-ink shadow-card' : 'text-ink-3'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {dateMode === 'single' && (
            <input name="start_date" type="date" defaultValue={today} aria-label="日期" className={inputClass} />
          )}
          {dateMode === 'range' && (
            <div className="flex items-center gap-2">
              <input name="start_date" type="date" defaultValue={today} aria-label="開始日期" className={`${inputClass} flex-1`} />
              <span className="text-ink-4 text-sm shrink-0" aria-hidden="true">–</span>
              <input name="end_date" type="date" defaultValue={today} aria-label="結束日期" className={`${inputClass} flex-1`} />
            </div>
          )}
          {/* 只在 range 提:DailySpendChart 少於 2 天或超過 16 天都不畫,單日帳本永遠沒有圖 */}
          {dateMode === 'range' && (
            <p className="text-xs text-ink-4 mt-1.5">跨 2～16 天的區間，帳本頁會多一張「每日支出」圖</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <label htmlFor="new-trip-fx" className="text-sm text-ink">使用外幣記帳</label>
            {/* ponytail: 關掉時把「本來就是台幣」講出來，省掉一個只有一個選項的主幣別選單 */}
            <p className="text-xs text-ink-4 mt-0.5">
              {fxOn ? '以外幣輸入金額，結算仍換算成新台幣（TWD）' : '這本帳以新台幣（TWD）記帳'}
            </p>
          </div>
          <button
            id="new-trip-fx"
            type="button"
            role="switch"
            aria-checked={fxOn}
            onClick={() => { setFxOn(!fxOn); setFxTouched(true) }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${fxOn ? 'bg-accent' : 'bg-line'}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${fxOn ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {fxOn && (
          <>
            <div>
              <label htmlFor="new-trip-currency" className="block text-xs font-medium text-ink-3 mb-1.5">外幣</label>
              <select
                id="new-trip-currency"
                name="foreign_currency"
                value={currency}
                onChange={e => onCurrencyChange(e.target.value as ForeignCurrency)}
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
          </>
        )}

        <button type="submit" className="w-full bg-accent text-white py-3 rounded-xl text-sm font-semibold hover:bg-accent-deep transition-colors">
          建立
        </button>
      </form>
    </main>
  )
}
