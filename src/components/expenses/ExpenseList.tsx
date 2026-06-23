'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { EditExpenseButton } from '@/components/expenses/EditExpenseButton'
import { ExpenseDetailModal } from '@/components/expenses/ExpenseDetailModal'
import { deleteExpenseAction } from '@/lib/actions/expenses'
import { convertToTWD, formatAmount } from '@/lib/utils/currency'
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
  note: string | null
  expense_splits: Array<{ user_id: string; amount: number }>
  payer: MemberProfile | null
}

type Props = {
  tripId: string
  expenses: ExpenseDisplayRow[]
  members: MemberProfile[]
  currentUserId: string
  exchangeRate: number
}

// Device time zone never changes within a session; nothing to subscribe to.
const subscribeNoop = () => () => {}

export function ExpenseList({ tripId, expenses, members, currentUserId, exchangeRate }: Props) {
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
  const [detailExpenseId, setDetailExpenseId] = useState<string | null>(null)

  const detailExpense = detailExpenseId ? expenses.find(e => e.id === detailExpenseId) ?? null : null

  // Today defaults open, past dates default closed.
  // toggled tracks explicit user overrides.
  const isOpen = (date: string) => toggled.has(date) ? date !== todayDate : date === todayDate

  const toggle = (date: string) =>
    setToggled(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })

  // DailySpendChart 點長條 → 展開該日群組並捲過去
  useEffect(() => {
    function onOpenDay(event: Event) {
      const date = (event as CustomEvent<string>).detail
      setToggled(prev => {
        const next = new Set(prev)
        if (date === todayDate) next.delete(date)
        else next.add(date)
        return next
      })
      requestAnimationFrame(() => {
        const el = document.getElementById(`day-${date}`)
        if (el) {
          window.scrollTo({
            top: el.getBoundingClientRect().top + window.scrollY - 88,
            behavior: 'smooth',
          })
        }
      })
    }
    window.addEventListener('sm:open-day', onOpenDay)
    return () => window.removeEventListener('sm:open-day', onOpenDay)
  }, [todayDate])

  // 當日小計:全是 JPY 顯示 ¥,混幣別退回換算後的 NT$
  function groupSum(items: ExpenseDisplayRow[]) {
    const allJPY = items.every(e => e.currency === 'JPY')
    if (allJPY) {
      const sum = items.reduce((a, e) => a + e.amount, 0)
      return `¥${Math.round(sum).toLocaleString('zh-TW')}`
    }
    const sum = items.reduce((a, e) => a + convertToTWD(e.amount, e.currency, exchangeRate), 0)
    return `≈NT$${Math.round(sum).toLocaleString('zh-TW')}`
  }

  return (
    <>
    {detailExpense && (
      <ExpenseDetailModal
        expense={detailExpense}
        members={members}
        timeZone={timeZone}
        onClose={() => setDetailExpenseId(null)}
      />
    )}
    <div className="flex flex-col gap-2 mb-3">
      {expenseGroups.map(group => {
        const open = isOpen(group.date)
        return (
        <div key={group.date} id={`day-${group.date}`} className="flex flex-col gap-2 scroll-mt-24">
          {/* 日期群組標題:純文字列 + 當日小計 */}
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => toggle(group.date)}
            aria-expanded={open}
            className="flex items-baseline justify-between w-full mt-2 px-0.5 hover:opacity-70 transition-opacity"
          >
            <span suppressHydrationWarning className="text-xs font-semibold text-ink-3">{group.date}</span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-4 font-mono tabular-nums">
              {open ? groupSum(group.items) : `${group.items.length} 筆 · ${groupSum(group.items)}`}
              <svg
                width="12" height="12"
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
            </span>
          </button>

          {/* 同一天的費用進同一張卡,髮絲線分隔 */}
          {open && (
            <div className="bg-white rounded-2xl shadow-card divide-y divide-line">
              {group.items.map(expense => (
                <div key={expense.id} className="flex justify-between items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setDetailExpenseId(expense.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="font-medium text-[14.5px] text-ink break-words">{expense.title}</div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-4 mt-0.5">
                      <time suppressHydrationWarning dateTime={expense.paid_at} title={formatExpenseDateTime(expense.paid_at, timeZone)}>
                        {formatExpenseTime(expense.paid_at, timeZone)}
                      </time>
                      <span aria-hidden="true">·</span>
                      <span>{expense.payer?.display_name} 付</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDetailExpenseId(expense.id)}
                      className="text-[15px] font-semibold font-mono tabular-nums text-ink whitespace-nowrap"
                    >
                      {formatAmount(expense.amount, expense.currency)}
                    </button>
                    {expense.created_by === currentUserId && (
                      <div className="flex items-center">
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
                            note: expense.note,
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
                            className="p-2 rounded-lg text-ink-4/70 hover:text-owe hover:bg-owe/5 transition-colors"
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
          )}
        </div>
        )
      })}
    </div>
    </>
  )
}
