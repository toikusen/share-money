'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  approveExpenseAction,
  rejectExpenseAction,
  approveAllPendingAction,
} from '@/lib/actions/expenses'
import { formatAmount } from '@/lib/utils/currency'
import type { PendingReview } from '@/lib/reviews'

export function ReviewList({ reviews }: { reviews: PendingReview[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Track the row whose buttons are mid-flight so only it shows a busy state.
  const [busyId, setBusyId] = useState<string | null>(null)

  function run(action: () => Promise<{ error?: string; success?: boolean }>, id: string | null) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await action()
      setBusyId(null)
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => approveAllPendingAction(), 'all')}
        className="w-full rounded-xl bg-accent text-white text-sm font-semibold py-3 hover:bg-accent-deep transition-colors disabled:opacity-50"
      >
        {busyId === 'all' ? '處理中…' : `全部同意（${reviews.length} 筆）`}
      </button>

      {error && (
        <p className="text-sm text-owe bg-owe/5 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex flex-col gap-2.5">
        {reviews.map(r => {
          const busy = pending && (busyId === r.expenseId || busyId === 'all')
          return (
            <div key={r.expenseId} className="bg-white rounded-2xl shadow-card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/trips/${r.tripId}`}
                    className="text-[11.5px] text-accent hover:text-accent-deep font-medium"
                  >
                    {r.tripName}
                  </Link>
                  <div className="font-medium text-[15px] text-ink break-words mt-0.5">{r.title}</div>
                  <div className="text-xs text-ink-4 mt-0.5">
                    {r.payerName} 付 · 你分擔 <span className="font-mono tabular-nums">{formatAmount(r.myShare, r.currency)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[15px] font-semibold font-mono tabular-nums text-ink whitespace-nowrap">
                    {formatAmount(r.amount, r.currency)}
                  </div>
                  <div className="text-[11px] text-ink-4 mt-0.5">已同意 {r.approved}/{r.total}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => rejectExpenseAction(r.expenseId, r.tripId), r.expenseId)}
                  className="flex-1 rounded-lg border border-line text-[13px] font-medium text-ink-2 py-2 hover:bg-fill transition-colors disabled:opacity-50"
                >
                  拒絕
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => approveExpenseAction(r.expenseId, r.tripId), r.expenseId)}
                  className="flex-1 rounded-lg bg-gain/10 text-[13px] font-semibold text-gain py-2 hover:bg-gain/15 transition-colors disabled:opacity-50"
                >
                  同意
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
