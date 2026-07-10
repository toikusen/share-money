'use client'

import { useState } from 'react'
import { updateExpenseAction } from '@/lib/actions/expenses'
import { ExpenseForm } from './ExpenseForm'
import type { Profile, Currency, SplitInput } from '@/types/database'

type Props = {
  tripId: string
  members: Profile[]
  currentUserId: string
  foreignCurrency: Currency
  expense: {
    id: string
    title: string
    amount: number
    currency: Currency
    paid_by: string
    paid_at: string
    note: string | null
    splits: SplitInput[]
  }
}

export function EditExpenseButton({ tripId, members, currentUserId, foreignCurrency, expense }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="編輯費用"
        className="p-2 rounded-lg text-ink-4/70 hover:text-accent hover:bg-accent/5 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      {open && (
        <ExpenseForm
          heading="編輯費用"
          submitLabel="儲存變更"
          pendingLabel="儲存中..."
          members={members}
          currentUserId={currentUserId}
          foreignCurrency={foreignCurrency}
          initial={{
            title: expense.title,
            amount: expense.amount,
            currency: expense.currency,
            paidBy: expense.paid_by,
            paidAt: expense.paid_at,
            note: expense.note ?? '',
            splits: expense.splits,
          }}
          onSubmit={values => updateExpenseAction({ expenseId: expense.id, tripId, ...values })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
