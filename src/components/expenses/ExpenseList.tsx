'use client'

import { useState, useSyncExternalStore } from 'react'
import { EditExpenseButton } from '@/components/expenses/EditExpenseButton'
import { deleteExpenseAction } from '@/lib/actions/expenses'
import { formatAmount } from '@/lib/utils/currency'
import { formatExpenseDate, formatExpenseDateTime, formatExpenseTime, groupByPaidDate } from '@/lib/utils/datetime'
import type { Currency } from '@/types/database'

type MemberProfile = { id: string; display_name: string; avatar_url: string | null; created_at: string }

export type ExpenseDisplayRow = {
  id: string
  title: string
  amount: number
  currency: Currency
  paid_by: string
  created_by: string
  paid_at: string
  expense_splits: Array<{ user_id: string; amount: number }>
  payer: MemberProfile | null
}

type Props = {
  tripId: string
  expenses: ExpenseDisplayRow[]
  members: MemberProfile[]
  currentUserId: string
}

// Device time zone never changes within a session; nothing to subscribe to.
const subscribeNoop = () => () => {}

export function ExpenseList({ tripId, expenses, members, currentUserId }: Props) {
  // Server render falls back to Asia/Taipei (undefined); after hydration we
  // re-group and re-format in the viewer's device time zone so times match
  // what they typed.
  const timeZone = useSyncExternalStore(
    subscribeNoop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => undefined,
  )

  const expenseGroups = groupByPaidDate(expenses, timeZone)
  const todayDate = formatExpenseDate(new Date().toISOString(), timeZone)
  const [toggled, setToggled] = useState<Set<string>>(new Set())

  // Today defaults open, past dates default closed.
  // toggled tracks explicit user overrides.
  const isOpen = (date: string) => toggled.has(date) ? date !== todayDate : date === todayDate

  const toggle = (date: string) =>
    setToggled(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })

  return (
    <div className="flex flex-col gap-2 mb-3">
      {expenseGroups.map(group => {
        const open = isOpen(group.date)
        return (
        <div key={group.date} className="flex flex-col gap-2">
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => toggle(group.date)}
            className="flex items-center justify-between pt-2 pb-1 text-xs font-semibold text-gray-500 dark:text-gray-400 w-full text-left"
          >
            <span>{group.date}</span>
            <svg
              width="11" height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {open && group.items.map(expense => (
            <div key={expense.id} className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm dark:bg-gray-900 dark:border-gray-800">
              <div className="flex justify-between items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-gray-900 break-words dark:text-gray-100">{expense.title}</div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    <time suppressHydrationWarning dateTime={expense.paid_at} title={formatExpenseDateTime(expense.paid_at, timeZone)}>
                      {formatExpenseTime(expense.paid_at, timeZone)}
                    </time>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-gray-600 dark:text-gray-300">{formatAmount(expense.amount, expense.currency)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{expense.payer?.display_name} 付</span>
                  </div>
                </div>
                {expense.created_by === currentUserId && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <EditExpenseButton
                      tripId={tripId}
                      members={members}
                      currentUserId={currentUserId}
                      expense={{
                        id: expense.id,
                        title: expense.title,
                        amount: expense.amount,
                        currency: expense.currency,
                        paid_by: expense.paid_by,
                        paid_at: expense.paid_at,
                        splits: expense.expense_splits.map(s => ({ user_id: s.user_id, amount: s.amount })),
                      }}
                    />
                    <form
                      action={deleteExpenseAction.bind(null, expense.id, tripId) as unknown as (formData: FormData) => Promise<void>}
                      className="flex items-center"
                    >
                      <button
                        type="submit"
                        aria-label="刪除費用"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:text-gray-600 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        )
      })}
    </div>
  )
}
