'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { splitEqually, isEqualSplit, splitWithRemainder, formatAmount } from '@/lib/utils/currency'
import type { Profile, Currency, SplitInput } from '@/types/database'

export type ExpenseFormValues = {
  title: string
  amount: number
  currency: Currency
  paidBy: string
  paidAt: string
  note?: string
  splits: SplitInput[]
}

type Props = {
  heading: string
  submitLabel: string
  pendingLabel: string
  members: Profile[]
  currentUserId: string
  initial?: ExpenseFormValues
  onSubmit: (values: ExpenseFormValues) => Promise<{ error?: string; success?: boolean } | undefined>
  onClose: () => void
}

function toDateTimeLocalValue(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

const inputClass =
  'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/35'

export function ExpenseForm({ heading, submitLabel, pendingLabel, members, currentUserId, initial, onSubmit, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'JPY')
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? currentUserId)
  const [paidAt, setPaidAt] = useState(() => toDateTimeLocalValue(initial?.paidAt))
  const [note, setNote] = useState(initial?.note ?? '')
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>(() =>
    initial && !isEqualSplit(initial.amount, initial.currency, initial.splits.map(s => s.amount))
      ? 'custom'
      : 'equal'
  )
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial ? initial.splits.map(s => s.user_id) : members.map(m => m.id)
  )
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(
    initial ? Object.fromEntries(initial.splits.map(s => [s.user_id, String(s.amount)])) : {}
  )

  const formRef = useRef<HTMLFormElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const form = formRef.current
    if (!form) return

    const focusable = form.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [])

  function hybridResult() {
    const numAmount = parseFloat(amount) || 0
    const selected = members.filter(m => selectedIds.includes(m.id))
    return splitWithRemainder(
      numAmount,
      currency,
      selected.map(m => {
        const raw = customAmounts[m.id]
        return { id: m.id, custom: raw == null || raw === '' ? null : parseFloat(raw) || 0 }
      }),
    )
  }

  function computedSplits() {
    const numAmount = parseFloat(amount) || 0
    if (splitMode === 'equal') {
      const selected = members.filter(m => selectedIds.includes(m.id))
      const amounts = splitEqually(numAmount, selected.length, currency)
      return selected.map((m, i) => ({ user_id: m.id, amount: amounts[i] }))
    }
    return hybridResult().splits
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const paidAtDate = new Date(paidAt)
    if (!paidAt || Number.isNaN(paidAtDate.getTime())) {
      setError('請選擇付款時間')
      return
    }
    if (splitMode === 'custom' && !hybridResult().valid) {
      setError('分帳金額不正確，請確認自訂金額')
      return
    }

    let result: { error?: string; success?: boolean } | undefined
    await new Promise<void>(resolve => {
      startTransition(async () => {
        result = await onSubmit({
          title,
          amount: parseFloat(amount),
          currency,
          paidBy,
          paidAt: paidAtDate.toISOString(),
          note: note.trim(),
          splits: computedSplits(),
        }) ?? { success: true }
        resolve()
      })
    })
    if (result?.error) { setError(result.error); return }
    onClose()
  }

  const numAmount = parseFloat(amount) || 0
  const hybrid = splitMode === 'custom' ? hybridResult() : null
  const splitsInvalid = splitMode === 'custom' && numAmount > 0 && hybrid != null && !hybrid.valid

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={onClose}
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-form-title"
        className="bg-white text-ink rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 sm:p-6 flex flex-col gap-4 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="expense-form-title" className="font-bold text-[17px]">{heading}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-ink-4 hover:text-ink-2 p-1 transition-colors"
          >
            取消
          </button>
        </div>

        <div>
          <label htmlFor="ef-title" className="block text-xs font-medium text-ink-3 mb-1.5">費用名稱</label>
          <input
            id="ef-title"
            value={title} onChange={e => setTitle(e.target.value)} required
            placeholder="拉麵午餐"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="ef-paid-at" className="block text-xs font-medium text-ink-3 mb-1.5">付款時間</label>
          <input
            id="ef-paid-at"
            value={paidAt}
            onChange={e => setPaidAt(e.target.value)}
            type="datetime-local"
            required
            className={inputClass}
          />
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label htmlFor="ef-amount" className="block text-xs font-medium text-ink-3 mb-1.5">金額</label>
            <input
              id="ef-amount"
              value={amount} onChange={e => setAmount(e.target.value)}
              type="number" min="0" step={currency === 'JPY' ? '1' : '0.01'} required
              className={`${inputClass} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="ef-currency" className="block text-xs font-medium text-ink-3 mb-1.5">幣別</label>
            <select
              id="ef-currency"
              value={currency} onChange={e => setCurrency(e.target.value as Currency)}
              className="bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
            >
              <option value="JPY">JPY</option>
              <option value="TWD">TWD</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="ef-paid-by" className="block text-xs font-medium text-ink-3 mb-1.5">由誰付款</label>
          <select
            id="ef-paid-by"
            value={paidBy} onChange={e => setPaidBy(e.target.value)}
            className={inputClass}
          >
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.display_name}{m.id === currentUserId ? '（我）' : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="ef-note" className="block text-xs font-medium text-ink-3 mb-1.5">備註<span className="text-ink-4 font-normal">（選填）</span></label>
          <textarea
            id="ef-note"
            value={note} onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="補充說明…"
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <div className="flex bg-fill rounded-[10px] p-[3px] gap-0.5 mb-3" role="group" aria-label="分帳模式">
            {(['equal', 'custom'] as const).map(mode => (
              <button
                key={mode} type="button"
                onClick={() => setSplitMode(mode)}
                aria-pressed={splitMode === mode}
                className={`flex-1 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                  splitMode === mode
                    ? 'bg-white text-ink shadow-card'
                    : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {mode === 'equal' ? '均攤' : '自訂金額'}
              </button>
            ))}
          </div>

          {splitMode === 'custom' && (
            <p className="text-[11.5px] text-ink-4 mb-2">
              輸入金額＝自訂，留白＝平分剩餘金額
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {members.map(m => {
              const checked = selectedIds.includes(m.id)
              const selectedMembers = members.filter(x => selectedIds.includes(x.id))
              const equalAmounts = splitMode === 'equal' && numAmount > 0
                ? splitEqually(numAmount, selectedMembers.length, currency)
                : null
              const equalAmt = equalAmounts && checked
                ? equalAmounts[selectedMembers.findIndex(x => x.id === m.id)]
                : null
              const rawCustom = customAmounts[m.id]
              const isCustom = rawCustom != null && rawCustom !== ''
              const autoShare = hybrid?.splits.find(s => s.user_id === m.id)?.amount
              return (
                <div key={m.id} className="flex items-center justify-between gap-2.5 bg-fill rounded-[10px] px-3 py-2">
                  <label className="flex items-center gap-2.5 text-[13.5px] text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        setSelectedIds(prev =>
                          e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id)
                        )
                      }}
                      className="size-4 rounded accent-accent cursor-pointer"
                    />
                    {m.display_name}{m.id === currentUserId ? '（我）' : ''}
                  </label>
                  {splitMode === 'equal' ? (
                    <span className={`text-[13.5px] font-semibold font-mono tabular-nums ${checked && numAmount > 0 ? 'text-ink' : 'text-ink-4/60'}`}>
                      {checked && numAmount > 0 && equalAmt != null
                        ? formatAmount(equalAmt, currency)
                        : '—'}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {checked && isCustom && (
                        <button
                          type="button"
                          aria-label={`清除 ${m.display_name} 的自訂金額`}
                          onClick={() => setCustomAmounts(prev => ({ ...prev, [m.id]: '' }))}
                          className="text-ink-4 hover:text-ink-2 text-sm leading-none transition-colors"
                        >
                          ×
                        </button>
                      )}
                      <input
                        type="number" min="0" step={currency === 'JPY' ? '1' : '0.01'}
                        value={rawCustom ?? ''}
                        onChange={e => setCustomAmounts(prev => ({ ...prev, [m.id]: e.target.value }))}
                        disabled={!checked}
                        aria-label={`${m.display_name} 的分帳金額`}
                        placeholder={checked && autoShare != null && numAmount > 0 ? String(autoShare) : '0'}
                        className={`w-24 text-right rounded-lg px-2 py-1.5 text-sm font-mono tabular-nums bg-white text-ink placeholder:text-ink-4/70 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors ${
                          isCustom
                            ? 'border border-accent'
                            : 'border border-dashed border-edge'
                        }`}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {splitMode === 'custom' && numAmount > 0 && hybrid && (
            <div className="mt-3">
              <div className="h-[5px] rounded-full bg-line overflow-hidden flex">
                {hybrid.valid ? (
                  <>
                    <div
                      className="bg-accent transition-all duration-300"
                      style={{ width: `${Math.min((hybrid.customSum / numAmount) * 100, 100)}%` }}
                    />
                    <div
                      className="bg-accent-soft/60 transition-all duration-300"
                      style={{ width: `${Math.max((hybrid.remaining / numAmount) * 100, 0)}%` }}
                    />
                  </>
                ) : (
                  <div className="bg-owe w-full transition-all duration-300" />
                )}
              </div>
              <p className={`text-[11.5px] mt-1.5 ${hybrid.valid ? 'text-ink-3' : 'text-owe'}`}>
                {!hybrid.valid && hybrid.autoCount > 0 &&
                  `自訂金額超出總額 ${formatAmount(Math.abs(hybrid.remaining), currency)}`}
                {!hybrid.valid && hybrid.autoCount === 0 &&
                  `總計 ${formatAmount(hybrid.customSum, currency)}，與總額差 ${formatAmount(Math.abs(numAmount - hybrid.customSum), currency)}`}
                {hybrid.valid && hybrid.autoCount > 0 &&
                  `已自訂 ${formatAmount(hybrid.customSum, currency)} · 剩餘 ${formatAmount(hybrid.remaining, currency)} 由 ${hybrid.autoCount} 人平分`}
                {hybrid.valid && hybrid.autoCount === 0 && '金額總和正確'}
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-owe" role="alert">{error}</p>}

        <button
          type="submit" disabled={isPending || splitsInvalid}
          className="w-full bg-accent text-white rounded-xl py-3 text-sm font-semibold hover:bg-accent-deep disabled:opacity-50 transition-colors"
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      </form>
    </div>
  )
}
