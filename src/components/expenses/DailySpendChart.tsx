'use client'

import { useSyncExternalStore } from 'react'
import { convertToTWD } from '@/lib/utils/currency'
import { formatExpenseDate } from '@/lib/utils/datetime'
import type { Currency } from '@/types/database'

type Props = {
  expenses: Array<{ paid_at: string; amount: number; currency: Currency }>
  exchangeRate: number
  startDate: string | null
  endDate: string | null
}

const subscribeNoop = () => () => {}
const MAX_DAYS = 16

function shortLabel(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    timeZone: timeZone ?? 'Asia/Taipei',
  }).format(date)
}

/**
 * 每日支出長條圖。同時是導覽工具:點某天的長條會發出
 * `sm:open-day` 事件,ExpenseList 收到後展開該日群組並捲過去。
 * 行程超過 16 天或費用不足以分組時自動不顯示。
 */
export function DailySpendChart({ expenses, exchangeRate, startDate, endDate }: Props) {
  const timeZone = useSyncExternalStore(
    subscribeNoop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => undefined,
  )

  // 行程日期區間 → 完整日序列;沒填日期就退回「有費用的日子」
  const dayDates: Date[] = []
  if (startDate && endDate) {
    const [sy, sm, sd] = startDate.split('-').map(Number)
    const [ey, em, ed] = endDate.split('-').map(Number)
    const cursor = new Date(sy, sm - 1, sd, 12)
    const last = new Date(ey, em - 1, ed, 12)
    while (cursor <= last && dayDates.length <= MAX_DAYS) {
      dayDates.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const totals = new Map<string, { total: number; first: Date }>()
  for (const e of expenses) {
    const key = formatExpenseDate(e.paid_at, timeZone)
    const prev = totals.get(key)
    const twd = convertToTWD(e.amount, e.currency, exchangeRate)
    if (prev) prev.total += twd
    else totals.set(key, { total: twd, first: new Date(e.paid_at) })
  }

  let days: Array<{ key: string; label: string; total: number }>
  if (dayDates.length > 0) {
    days = dayDates.map(d => {
      const key = formatExpenseDate(d.toISOString(), timeZone)
      return { key, label: shortLabel(d, timeZone), total: totals.get(key)?.total ?? 0 }
    })
  } else {
    days = [...totals.entries()]
      .sort((a, b) => a[1].first.getTime() - b[1].first.getTime())
      .map(([key, v]) => ({ key, label: shortLabel(v.first, timeZone), total: v.total }))
  }

  if (days.length < 2 || days.length > MAX_DAYS) return null

  const max = Math.max(...days.map(d => d.total), 1)
  const todayKey = formatExpenseDate(new Date().toISOString(), timeZone)

  function openDay(key: string) {
    window.dispatchEvent(new CustomEvent('sm:open-day', { detail: key }))
  }

  return (
    <div className="bg-white rounded-2xl shadow-card px-4 py-3.5 mt-3">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs font-semibold text-ink-2">每日支出</span>
        <span className="text-[10.5px] text-ink-4 font-mono">單位 TWD · 點長條看當日</span>
      </div>
      <div className="flex items-end gap-2.5 h-[88px]">
        {days.map((d, i) => {
          const isToday = d.key === todayKey
          const h = d.total > 0 ? Math.max(10, Math.round((d.total / max) * 56)) : 3
          return (
            <button
              key={d.key}
              type="button"
              suppressHydrationWarning
              onClick={() => d.total > 0 && openDay(d.key)}
              className={`flex-1 min-w-0 flex flex-col items-center justify-end gap-1 h-full ${d.total > 0 ? 'cursor-pointer hover:opacity-75' : 'cursor-default'} transition-opacity`}
              aria-label={`${d.label} 支出 NT$${Math.round(d.total).toLocaleString('zh-TW')}`}
            >
              <span className={`text-[10px] font-mono tabular-nums truncate max-w-full ${isToday ? 'font-semibold text-accent' : 'text-ink-4'}`}>
                {d.total > 0 ? Math.round(d.total).toLocaleString('zh-TW') : ''}
              </span>
              <span
                aria-hidden="true"
                className={`w-full rounded-t-md rounded-b-[3px] anim-grow-y ${isToday ? 'bg-accent' : d.total > 0 ? 'bg-[#d8dade]' : 'bg-[#ececee]'}`}
                style={{ height: h, animationDelay: `${i * 60}ms` }}
              />
              <span className={`text-[10.5px] truncate max-w-full ${isToday ? 'font-semibold text-accent' : 'text-ink-3'}`}>
                {isToday ? '今天' : d.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
