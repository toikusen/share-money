'use client'

import { useState } from 'react'
import { createExpenseAction } from '@/lib/actions/expenses'
import { ExpenseForm } from './ExpenseForm'
import type { Profile } from '@/types/database'

type Props = {
  tripId: string
  members: Profile[]
  currentUserId: string
  compact?: boolean
}

export function AddExpenseModal({ tripId, members, currentUserId, compact }: Props) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return compact ? (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 active:scale-95 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        新增費用
      </button>
    ) : (
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
