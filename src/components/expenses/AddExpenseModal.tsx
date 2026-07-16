'use client'

import { useState } from 'react'
import { createExpenseAction } from '@/lib/actions/expenses'
import { ExpenseForm } from './ExpenseForm'
import type { Profile, Currency } from '@/types/database'

type Props = {
  tripId: string
  members: Profile[]
  currentUserId: string
  foreignCurrency: Currency | null
  compact?: boolean
}

export function AddExpenseModal({ tripId, members, currentUserId, foreignCurrency, compact }: Props) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return compact ? (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:bg-accent-deep active:scale-95"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        記一筆
      </button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-dashed border-edge rounded-2xl py-3 text-ink-3 text-sm hover:border-ink-4 hover:text-ink transition-colors"
      >
        ＋ 記一筆
      </button>
    )
  }

  return (
    <ExpenseForm
      heading="記一筆"
      submitLabel="新增費用"
      pendingLabel="新增中..."
      members={members}
      currentUserId={currentUserId}
      foreignCurrency={foreignCurrency}
      onSubmit={values => createExpenseAction({ tripId, ...values })}
      onClose={() => setOpen(false)}
    />
  )
}
