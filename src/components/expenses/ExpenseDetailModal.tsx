'use client'

import { useEffect, useRef } from 'react'
import { formatAmount } from '@/lib/utils/currency'
import { formatExpenseDateTime } from '@/lib/utils/datetime'
import type { Currency } from '@/types/database'

type MemberProfile = { id: string; display_name: string; avatar_url: string | null; created_at: string }

type Props = {
  expense: {
    id: string
    title: string
    amount: number
    currency: Currency
    paid_at: string
    note: string | null
    payer: MemberProfile | null
    expense_splits: Array<{ user_id: string; amount: number }>
  }
  members: MemberProfile[]
  timeZone?: string
  onClose: () => void
}

export function ExpenseDetailModal({ expense, members, timeZone, onClose }: Props) {
  const memberMap = Object.fromEntries(members.map(m => [m.id, m.display_name]))
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

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

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-detail-title"
        className="bg-white text-ink rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 sm:p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="expense-detail-title" className="font-bold text-[17px]">{expense.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-ink-4 hover:text-ink-2 p-1 transition-colors"
          >
            關閉
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <Row label="金額" value={formatAmount(expense.amount, expense.currency)} mono />
          <Row label="由誰付款" value={expense.payer?.display_name ?? '—'} />
          <Row
            label="付款時間"
            value={formatExpenseDateTime(expense.paid_at, timeZone)}
          />
        </div>

        {expense.note && (
          <div>
            <p className="text-xs font-medium text-ink-3 mb-1.5">備註</p>
            <p className="text-[13.5px] text-ink whitespace-pre-wrap break-words bg-fill rounded-[10px] px-3 py-2.5">{expense.note}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-ink-3 mb-2">分帳明細</p>
          <div className="flex flex-col gap-1.5">
            {expense.expense_splits.map(split => (
              <div key={split.user_id} className="flex items-center justify-between bg-fill rounded-[10px] px-3 py-2">
                <span className="text-[13.5px] text-ink">{memberMap[split.user_id] ?? split.user_id}</span>
                <span className="text-[13.5px] font-semibold font-mono tabular-nums text-ink">
                  {formatAmount(split.amount, expense.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-3 shrink-0">{label}</span>
      <span className={`text-[13.5px] text-ink text-right ${mono ? 'font-mono tabular-nums font-semibold' : ''}`}>
        {value}
      </span>
    </div>
  )
}
