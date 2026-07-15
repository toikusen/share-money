'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { EditExpenseButton } from '@/components/expenses/EditExpenseButton'
import { ExpenseDetailModal } from '@/components/expenses/ExpenseDetailModal'
import { deleteExpenseAction } from '@/lib/actions/expenses'
import { convertToTWD, formatAmount } from '@/lib/utils/currency'
import { formatExpenseDate, formatExpenseDateTime, formatExpenseTime, groupByPaidDate } from '@/lib/utils/datetime'
import { isExpenseApproved, isExpenseRejected, approvalProgress, myInvolvement } from '@/lib/utils/expenses'
import type { ApprovalStatus, Currency, ExpenseKind } from '@/types/database'

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
  kind: ExpenseKind
  expense_splits: Array<{ user_id: string; amount: number; approval_status: ApprovalStatus }>
  payer: MemberProfile | null
}

/** Small status pill for pending/rejected expenses; approved shows nothing. */
function StatusBadge({ splits }: { splits: ExpenseDisplayRow['expense_splits'] }) {
  if (isExpenseApproved(splits)) return null
  if (isExpenseRejected(splits)) {
    return <span className="text-[10.5px] font-semibold text-owe bg-owe/10 rounded px-1.5 py-0.5">已拒絕</span>
  }
  const { approved, total } = approvalProgress(splits)
  return <span className="text-[10.5px] font-semibold text-amber-600 bg-amber-500/10 rounded px-1.5 py-0.5">待審 {approved}/{total}</span>
}

type Props = {
  tripId: string
  expenses: ExpenseDisplayRow[]
  members: MemberProfile[]
  currentUserId: string
  exchangeRate: number
  foreignCurrency: Currency
}

// Device time zone never changes within a session; nothing to subscribe to.
const subscribeNoop = () => () => {}

export function ExpenseList({ tripId, expenses, members, currentUserId, exchangeRate, foreignCurrency }: Props) {
  // Server render falls back to Asia/Taipei (undefined); after hydration we
  // re-group and re-format in the viewer's device time zone so times match
  // what they typed.
  const timeZone = useSyncExternalStore(
    subscribeNoop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => undefined,
  )

  const memberName = (userId?: string) => members.find(m => m.id === userId)?.display_name ?? '成員'
  const settlementLabel = (e: ExpenseDisplayRow) => `還款給 ${memberName(e.expense_splits[0]?.user_id)}`

  // 「全部 / 與我相關」切換;小計只算消費(還款不屬於墊付/應攤語意)
  const [listMode, setListMode] = useState<'all' | 'mine'>('all')
  const mine = (e: ExpenseDisplayRow) => myInvolvement(e, currentUserId)
  const mineExpenses = expenses.filter(e => mine(e).related)
  const mineSpend = mineExpenses.filter(e => e.kind === 'expense')
  const minePaidTWD = mineSpend.reduce(
    (a, e) => a + (mine(e).paid ? convertToTWD(e.amount, e.currency, exchangeRate) : 0), 0)
  const mineShareTWD = mineSpend.reduce(
    (a, e) => a + convertToTWD(mine(e).share, e.currency, exchangeRate), 0)

  const visibleExpenses = listMode === 'mine' ? mineExpenses : expenses
  const expenseGroups = groupByPaidDate(visibleExpenses, timeZone)
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

  // 當日小計:同一幣別顯示原幣,混幣別退回換算後的 NT$
  function groupSum(items: ExpenseDisplayRow[]) {
    const spendItems = items.filter(e => e.kind === 'expense')
    if (spendItems.length === 0) return `${items.length} 筆還款`
    const uniform = spendItems.every(e => e.currency === spendItems[0].currency)
    if (uniform) {
      const sum = spendItems.reduce((a, e) => a + e.amount, 0)
      return formatAmount(sum, spendItems[0].currency)
    }
    const sum = spendItems.reduce((a, e) => a + convertToTWD(e.amount, e.currency, exchangeRate), 0)
    return `≈${formatAmount(sum, 'TWD')}`
  }

  // 收合標題:消費筆數+金額,還款另計,避免筆數與金額描述不同集合
  function collapsedLabel(items: ExpenseDisplayRow[]) {
    const spendCount = items.filter(e => e.kind === 'expense').length
    const settleCount = items.length - spendCount
    if (spendCount === 0) return `${settleCount} 筆還款`
    const base = `${spendCount} 筆 · ${groupSum(items)}`
    return settleCount > 0 ? `${base} · ${settleCount} 筆還款` : base
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
      {expenses.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex shrink-0 bg-fill rounded-[9px] p-0.5 gap-0.5">
            {([['all', `全部 ${expenses.length}`], ['mine', `與我相關 ${mineExpenses.length}`]] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setListMode(mode)}
                aria-pressed={listMode === mode}
                className={`text-xs font-semibold whitespace-nowrap rounded-[7px] px-3 py-[5px] transition-all ${
                  listMode === mode ? 'bg-white text-ink shadow-card' : 'text-ink-3'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {listMode === 'mine' && (
            <div className="flex flex-col items-end gap-px text-[11px] text-ink-3 font-mono tabular-nums whitespace-nowrap">
              <span>你墊付 {formatAmount(minePaidTWD, 'TWD')}</span>
              <span>應攤 {formatAmount(mineShareTWD, 'TWD')}</span>
            </div>
          )}
        </div>
      )}
      {listMode === 'mine' && mineExpenses.length === 0 && expenses.length > 0 && (
        <p className="text-center text-sm text-ink-4 py-8">沒有與你相關的費用</p>
      )}
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
              {open ? groupSum(group.items) : collapsedLabel(group.items)}
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
                <div
                  key={expense.id}
                  className={`flex justify-between items-center gap-3 px-4 py-3 ${isExpenseApproved(expense.expense_splits) ? '' : 'opacity-60'}`}
                >
                  <button
                    type="button"
                    onClick={() => setDetailExpenseId(expense.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {expense.kind === 'settlement' && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent shrink-0">
                          <path d="M17 3l4 4-4 4" />
                          <path d="M21 7H9" />
                          <path d="M7 21l-4-4 4-4" />
                          <path d="M3 17h12" />
                        </svg>
                      )}
                      <span className="font-medium text-[14.5px] text-ink break-words">
                        {expense.kind === 'settlement' ? settlementLabel(expense) : expense.title}
                      </span>
                      <StatusBadge splits={expense.expense_splits} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-4 mt-0.5">
                      <time suppressHydrationWarning dateTime={expense.paid_at} title={formatExpenseDateTime(expense.paid_at, timeZone)}>
                        {formatExpenseTime(expense.paid_at, timeZone)}
                      </time>
                      <span aria-hidden="true">·</span>
                      <span>{expense.payer?.display_name} {expense.kind === 'settlement' ? '還' : '付'}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDetailExpenseId(expense.id)}
                      className="flex flex-col items-end gap-0.5"
                    >
                      <span className="text-[15px] font-semibold font-mono tabular-nums text-ink whitespace-nowrap">
                        {formatAmount(expense.amount, expense.currency)}
                      </span>
                      {listMode === 'mine' && expense.kind === 'expense' && (() => {
                        const m = mine(expense)
                        return (
                          <span className={`text-[10.5px] font-semibold font-mono tabular-nums whitespace-nowrap ${m.paid ? 'text-gain' : 'text-ink-3'}`}>
                            {m.paid ? `你墊 +${formatAmount(expense.amount - m.share, expense.currency)}` : `你攤 ${formatAmount(m.share, expense.currency)}`}
                          </span>
                        )
                      })()}
                    </button>
                    {expense.created_by === currentUserId && (
                      <div className="flex items-center">
                        {expense.kind === 'expense' && (
                          <EditExpenseButton
                            tripId={tripId}
                            members={members}
                            currentUserId={currentUserId}
                            foreignCurrency={foreignCurrency}
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
                        )}
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
