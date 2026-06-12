'use client'

import { useState, useTransition } from 'react'
import { splitEqually, isEqualSplit, splitWithRemainder, formatAmount } from '@/lib/utils/currency'
import type { Profile, Currency, SplitInput } from '@/types/database'

export type ExpenseFormValues = {
  title: string
  amount: number
  currency: Currency
  paidBy: string
  paidAt: string
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

export function ExpenseForm({ heading, submitLabel, pendingLabel, members, currentUserId, initial, onSubmit, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'JPY')
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? currentUserId)
  const [paidAt, setPaidAt] = useState(() => toDateTimeLocalValue(initial?.paidAt))
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
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white text-gray-900 rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto dark:bg-gray-950 dark:text-gray-100 dark:border dark:border-gray-800"
      >
        <h2 className="font-bold text-lg">{heading}</h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">費用名稱</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)} required
            placeholder="拉麵午餐"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">付款時間</label>
          <input
            value={paidAt}
            onChange={e => setPaidAt(e.target.value)}
            type="datetime-local"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">金額</label>
            <input
              value={amount} onChange={e => setAmount(e.target.value)}
              type="number" min="0" step={currency === 'JPY' ? '1' : '0.01'} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">幣別</label>
            <select
              value={currency} onChange={e => setCurrency(e.target.value as Currency)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="JPY">JPY</option>
              <option value="TWD">TWD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">由誰付款</label>
          <select
            value={paidBy} onChange={e => setPaidBy(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.display_name}{m.id === currentUserId ? '（我）' : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex gap-2 mb-3">
            {(['equal', 'custom'] as const).map(mode => (
              <button
                key={mode} type="button"
                onClick={() => setSplitMode(mode)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition ${
                  splitMode === mode
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-700 dark:bg-indigo-500/20 dark:border-indigo-400 dark:text-indigo-200'
                    : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                {mode === 'equal' ? '均攤' : '自訂金額'}
              </button>
            ))}
          </div>

          {splitMode === 'custom' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              輸入金額＝自訂，留白＝平分剩餘金額
            </p>
          )}

          <div className="flex flex-col gap-2">
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
                <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 dark:bg-gray-900">
                  <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer dark:text-gray-100">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        setSelectedIds(prev =>
                          e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id)
                        )
                      }}
                      className="rounded"
                    />
                    {m.display_name}{m.id === currentUserId ? '（我）' : ''}
                  </label>
                  {splitMode === 'equal' ? (
                    <span className="text-sm font-medium text-indigo-600 dark:text-indigo-300">
                      {checked && numAmount > 0 && equalAmt != null
                        ? formatAmount(equalAmt, currency)
                        : '—'}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {checked && !isCustom && (
                        <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5 dark:bg-indigo-500/15 dark:text-indigo-300">
                          平分
                        </span>
                      )}
                      {checked && isCustom && (
                        <button
                          type="button"
                          aria-label={`清除 ${m.display_name} 的自訂金額`}
                          onClick={() => setCustomAmounts(prev => ({ ...prev, [m.id]: '' }))}
                          className="text-gray-400 hover:text-gray-600 text-sm leading-none dark:hover:text-gray-200"
                        >
                          ×
                        </button>
                      )}
                      <input
                        type="number" min="0" step={currency === 'JPY' ? '1' : '0.01'}
                        value={rawCustom ?? ''}
                        onChange={e => setCustomAmounts(prev => ({ ...prev, [m.id]: e.target.value }))}
                        disabled={!checked}
                        placeholder={checked && autoShare != null && numAmount > 0 ? String(autoShare) : '0'}
                        className={`w-24 text-right rounded px-2 py-1 text-sm bg-white text-gray-900 placeholder:text-gray-400 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-300 transition-colors dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                          isCustom
                            ? 'border border-indigo-400 dark:border-indigo-500'
                            : 'border border-dashed border-gray-300 dark:border-gray-700'
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
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden flex dark:bg-gray-800">
                {hybrid.valid ? (
                  <>
                    <div
                      className="bg-indigo-600 transition-all duration-300 dark:bg-indigo-500"
                      style={{ width: `${Math.min((hybrid.customSum / numAmount) * 100, 100)}%` }}
                    />
                    <div
                      className="bg-indigo-300 transition-all duration-300 dark:bg-indigo-400/40"
                      style={{ width: `${Math.max((hybrid.remaining / numAmount) * 100, 0)}%` }}
                    />
                  </>
                ) : (
                  <div className="bg-red-500 w-full transition-all duration-300" />
                )}
              </div>
              <p className={`text-xs mt-1.5 ${hybrid.valid ? 'text-gray-500 dark:text-gray-400' : 'text-red-500'}`}>
                {!hybrid.valid && hybrid.autoCount > 0 &&
                  `⚠️ 自訂金額超出總額 ${formatAmount(Math.abs(hybrid.remaining), currency)}`}
                {!hybrid.valid && hybrid.autoCount === 0 &&
                  `⚠️ 總計 ${formatAmount(hybrid.customSum, currency)}，與總額差 ${formatAmount(Math.abs(numAmount - hybrid.customSum), currency)}`}
                {hybrid.valid && hybrid.autoCount > 0 &&
                  `已自訂 ${formatAmount(hybrid.customSum, currency)} · 剩餘 ${formatAmount(hybrid.remaining, currency)} 由 ${hybrid.autoCount} 人平分`}
                {hybrid.valid && hybrid.autoCount === 0 && '✅ 金額總和正確'}
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button" onClick={onClose}
            className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50 transition dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            取消
          </button>
          <button
            type="submit" disabled={isPending || splitsInvalid}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {isPending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
