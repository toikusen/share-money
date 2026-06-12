'use client'

import { useSyncExternalStore } from 'react'
import { EditExpenseButton } from '@/components/expenses/EditExpenseButton'
import { deleteExpenseAction } from '@/lib/actions/expenses'
import { formatAmount } from '@/lib/utils/currency'
import { formatExpenseDateTime, formatExpenseTime, groupByPaidDate } from '@/lib/utils/datetime'
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

  return (
    <div className="flex flex-col gap-2 mb-3">
      {expenseGroups.map(group => (
        <div key={group.date} className="flex flex-col gap-2">
          <div suppressHydrationWarning className="pt-2 pb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
            {group.date}
          </div>
          {group.items.map(expense => (
            <div key={expense.id} className="bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-gray-900 break-words dark:text-gray-100">{expense.title}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                    <time suppressHydrationWarning dateTime={expense.paid_at} title={formatExpenseDateTime(expense.paid_at, timeZone)}>
                      {formatExpenseTime(expense.paid_at, timeZone)}
                    </time>
                    {' · '}
                    {formatAmount(expense.amount, expense.currency)} ·{' '}
                    {expense.payer?.display_name} 付
                  </div>
                </div>
                {expense.created_by === currentUserId && (
                  <div className="flex items-center gap-3 shrink-0">
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
                    <form action={deleteExpenseAction.bind(null, expense.id, tripId) as unknown as (formData: FormData) => Promise<void>}>
                      <button type="submit" className="text-xs text-red-400 hover:text-red-600">刪除</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
