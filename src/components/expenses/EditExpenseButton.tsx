'use client'

import { useState } from 'react'
import { updateExpenseAction } from '@/lib/actions/expenses'
import { ExpenseForm } from './ExpenseForm'
import type { Profile, Currency, SplitInput } from '@/types/database'

type Props = {
  tripId: string
  members: Profile[]
  currentUserId: string
  expense: {
    id: string
    title: string
    amount: number
    currency: Currency
    paid_by: string
    paid_at: string
    splits: SplitInput[]
  }
}

export function EditExpenseButton({ tripId, members, currentUserId, expense }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
      >
        編輯
      </button>
      {open && (
        <ExpenseForm
          heading="編輯費用"
          submitLabel="儲存變更"
          pendingLabel="儲存中..."
          members={members}
          currentUserId={currentUserId}
          initial={{
            title: expense.title,
            amount: expense.amount,
            currency: expense.currency,
            paidBy: expense.paid_by,
            paidAt: expense.paid_at,
            splits: expense.splits,
          }}
          onSubmit={values => updateExpenseAction({ expenseId: expense.id, tripId, ...values })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
