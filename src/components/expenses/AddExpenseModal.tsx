'use client'

import { useState } from 'react'
import { createExpenseAction } from '@/lib/actions/expenses'
import { ExpenseForm } from './ExpenseForm'
import type { Profile } from '@/types/database'

type Props = {
  tripId: string
  members: Profile[]
  currentUserId: string
}

export function AddExpenseModal({ tripId, members, currentUserId }: Props) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-indigo-200 rounded-xl py-3 text-indigo-600 text-sm hover:border-indigo-400 hover:text-indigo-700 transition dark:border-indigo-400/50 dark:text-indigo-300 dark:hover:border-indigo-300 dark:hover:text-indigo-200"
      >
        + 新增費用
      </button>
    )
  }

  return (
    <ExpenseForm
      heading="新增費用"
      submitLabel="新增費用"
      pendingLabel="新增中..."
      members={members}
      currentUserId={currentUserId}
      onSubmit={values => createExpenseAction({ tripId, ...values })}
      onClose={() => setOpen(false)}
    />
  )
}
