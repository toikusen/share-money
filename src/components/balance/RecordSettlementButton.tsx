'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSettlementAction } from '@/lib/actions/expenses'
import { CURRENCIES, formatAmount } from '@/lib/utils/currency'
import { toDateTimeLocalValue } from '@/lib/utils/datetime'
import { bankLabel } from '@/lib/utils/banks'
import { maskAccountNumber } from '@/lib/utils/payment-account'
import type { Currency } from '@/types/database'

type RecipientAccount = {
  bank_code: string
  account_number: string
  account_holder: string | null
}

type Props = {
  tripId: string
  toUserId: string
  toName: string
  suggestedTWD: number
  /** null = 純 TWD 帳本:幣別切換隱藏,一律 TWD */
  foreignCurrency: Currency | null
  exchangeRate: number
  recipientAccount: RecipientAccount | null
}

/** 複製到剪貼簿的小按鈕,按下後短暫顯示「已複製」 */
function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }).catch(() => {})
      }}
      className="rounded-full bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent hover:bg-accent/15 transition-colors"
    >
      {copied ? '已複製 ✓' : label}
    </button>
  )
}

const inputClass =
  'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/35'

/** 依幣別小數位把建議金額轉成輸入框預設值字串 */
function suggestedFor(currency: Currency, suggestedTWD: number, exchangeRate: number): string {
  const raw = currency === 'TWD' ? suggestedTWD : suggestedTWD / exchangeRate
  return CURRENCIES[currency].decimals === 0 ? String(Math.round(raw)) : raw.toFixed(2)
}

export function RecordSettlementButton({ tripId, toUserId, toName, suggestedTWD, foreignCurrency, exchangeRate, recipientAccount }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState<Currency>('TWD')
  const [amount, setAmount] = useState(() => suggestedFor('TWD', suggestedTWD, exchangeRate))
  const [paidAt, setPaidAt] = useState(() => toDateTimeLocalValue())

  function switchCurrency(next: Currency) {
    setCurrency(next)
    setAmount(suggestedFor(next, suggestedTWD, exchangeRate))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createSettlementAction({
        tripId,
        toUser: toUserId,
        amount: parseFloat(amount),
        currency,
        paidAt: new Date(paidAt).toISOString(),
      })
      if (res?.error) { setError(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setCurrency('TWD')
          setAmount(suggestedFor('TWD', suggestedTWD, exchangeRate))
          setPaidAt(toDateTimeLocalValue())
          setError(null)
          setOpen(true)
        }}
        className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent hover:bg-accent/15 transition-colors"
      >
        記錄還款
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={() => setOpen(false)}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-form-title"
        className="bg-white text-ink rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 sm:p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="settle-form-title" className="font-bold text-[17px]">還款給 {toName}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13px] text-ink-4 hover:text-ink-2 p-1 transition-colors"
          >
            取消
          </button>
        </div>

        {recipientAccount ? (
          <div className="bg-fill rounded-xl p-3.5 flex flex-col gap-2">
            <p className="text-xs font-medium text-ink-3">{toName} 的收款帳戶</p>
            <p className="text-sm text-ink">
              {bankLabel(recipientAccount.bank_code)}
              <span className="font-mono tabular-nums ml-2">{maskAccountNumber(recipientAccount.account_number)}</span>
              {recipientAccount.account_holder && (
                <span className="text-ink-3 ml-2">戶名 {recipientAccount.account_holder}</span>
              )}
            </p>
            <div className="flex gap-2">
              <CopyChip label="複製代碼" value={recipientAccount.bank_code} />
              <CopyChip label="複製帳號" value={recipientAccount.account_number} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-4 bg-fill rounded-xl px-3.5 py-2.5">
            {toName} 尚未提供收款帳戶，請直接聯絡對方。
          </p>
        )}

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label htmlFor="settle-amount" className="block text-xs font-medium text-ink-3 mb-1.5">金額</label>
            <input
              id="settle-amount"
              value={amount} onChange={e => setAmount(e.target.value)}
              type="number" min="0" step={CURRENCIES[currency].decimals === 0 ? '1' : '0.01'} required
              className={`${inputClass} font-mono tabular-nums`}
            />
          </div>
          {foreignCurrency && (
            <div>
              <label htmlFor="settle-currency" className="block text-xs font-medium text-ink-3 mb-1.5">幣別</label>
              <select
                id="settle-currency"
                value={currency} onChange={e => switchCurrency(e.target.value as Currency)}
                className="bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
              >
                <option value="TWD">TWD</option>
                <option value={foreignCurrency}>{foreignCurrency}</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="settle-paid-at" className="block text-xs font-medium text-ink-3 mb-1.5">還款時間</label>
          <input
            id="settle-paid-at"
            value={paidAt} onChange={e => setPaidAt(e.target.value)}
            type="datetime-local" required
            className={inputClass}
          />
        </div>

        <p className="text-xs text-ink-4">
          建議金額 {formatAmount(suggestedTWD, 'TWD')},可改少(部分還款)。送出後待 {toName} 確認才計入結算。
        </p>

        {error && <p className="text-sm text-owe bg-owe/5 rounded-lg px-3 py-2">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-accent text-white text-sm font-semibold py-3 hover:bg-accent-deep transition-colors disabled:opacity-50"
        >
          {isPending ? '送出中…' : '記錄還款'}
        </button>
      </form>
    </div>
  )
}
