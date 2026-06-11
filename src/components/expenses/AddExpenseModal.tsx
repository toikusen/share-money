'use client'

import { useState, useTransition } from 'react'
import { createExpenseAction } from '@/lib/actions/expenses'
import { splitEqually } from '@/lib/utils/currency'
import type { Profile, Currency } from '@/types/database'

type Props = {
  tripId: string
  members: Profile[]
  currentUserId: string
}

export function AddExpenseModal({ tripId, members, currentUserId }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('JPY')
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  const [selectedIds, setSelectedIds] = useState<string[]>(members.map(m => m.id))
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})

  function computedSplits() {
    const numAmount = parseFloat(amount) || 0
    if (splitMode === 'equal') {
      const selected = members.filter(m => selectedIds.includes(m.id))
      const amounts = splitEqually(numAmount, selected.length, currency)
      return selected.map((m, i) => ({ user_id: m.id, amount: amounts[i] }))
    }
    return selectedIds.map(id => ({
      user_id: id,
      amount: parseFloat(customAmounts[id] ?? '0') || 0,
    }))
  }

  function splitSum() {
    return computedSplits().reduce((s, sp) => s + sp.amount, 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const numAmount = parseFloat(amount)
    let result: { error?: string; success?: boolean } | undefined
    await new Promise<void>(resolve => {
      startTransition(async () => {
        result = await createExpenseAction({
          tripId,
          title,
          amount: numAmount,
          currency,
          paidBy,
          splits: computedSplits(),
        }) ?? { success: true }
        resolve()
      })
    })
    if (result?.error) { setError(result.error); return }
    setOpen(false)
    setTitle(''); setAmount(''); setCurrency('JPY'); setPaidBy(currentUserId)
    setSplitMode('equal'); setSelectedIds(members.map(m => m.id)); setCustomAmounts({})
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-indigo-200 rounded-xl py-3 text-indigo-500 text-sm hover:border-indigo-400 hover:text-indigo-600 transition"
      >
        + 新增費用
      </button>
    )
  }

  const numAmount = parseFloat(amount) || 0
  const sumOk = Math.abs(splitSum() - numAmount) < 0.005

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-bold text-lg">新增費用</h2>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">費用名稱</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)} required
            placeholder="拉麵午餐"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">金額</label>
            <input
              value={amount} onChange={e => setAmount(e.target.value)}
              type="number" min="0" step={currency === 'JPY' ? '1' : '0.01'} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">幣別</label>
            <select
              value={currency} onChange={e => setCurrency(e.target.value as Currency)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="JPY">JPY</option>
              <option value="TWD">TWD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">由誰付款</label>
          <select
            value={paidBy} onChange={e => setPaidBy(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                {mode === 'equal' ? '均攤' : '自訂金額'}
              </button>
            ))}
          </div>

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
              return (
                <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
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
                    <span className="text-sm font-medium text-indigo-600">
                      {checked && numAmount > 0 && equalAmt != null
                        ? (currency === 'JPY' ? `¥${equalAmt}` : `NT$${equalAmt.toFixed(2)}`)
                        : '—'}
                    </span>
                  ) : (
                    <input
                      type="number" min="0" step={currency === 'JPY' ? '1' : '0.01'}
                      value={customAmounts[m.id] ?? ''}
                      onChange={e => setCustomAmounts(prev => ({ ...prev, [m.id]: e.target.value }))}
                      disabled={!checked}
                      placeholder="0"
                      className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {splitMode === 'custom' && numAmount > 0 && (
            <p className={`text-xs mt-2 ${sumOk ? 'text-green-600' : 'text-red-500'}`}>
              {sumOk ? '✅ 金額總和正確' : `⚠️ 總計 ${splitSum().toFixed(2)} / ${numAmount} — 差額 ${Math.abs(splitSum() - numAmount).toFixed(2)}`}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button" onClick={() => setOpen(false)}
            className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            取消
          </button>
          <button
            type="submit" disabled={isPending}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {isPending ? '新增中...' : '新增費用'}
          </button>
        </div>
      </form>
    </div>
  )
}
