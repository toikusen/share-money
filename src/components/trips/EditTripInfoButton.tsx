'use client'

import { useState, useTransition } from 'react'
import { updateTripInfoAction } from '@/lib/actions/trips'
import { formatTripDateRange } from '@/lib/utils/datetime'
import { LedgerTypeGrid } from '@/components/trips/LedgerTypeGrid'
import type { DateMode } from '@/lib/utils/ledger-type'
import type { LedgerType } from '@/types/database'

type Props = {
  tripId: string
  initialName: string
  initialType: LedgerType
  initialStartDate: string | null
  initialEndDate: string | null
  /** 已串好的副標尾段(例:「4 人 · 1 JPY = 0.21 TWD」),有日期時接在日期後 */
  metaSuffix?: string
}

const inputClass =
  'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35'

const DATE_MODES: ReadonlyArray<[DateMode, string]> = [
  ['single', '單日'],
  ['range', '多天區間'],
  ['none', '不指定'],
]

function deriveDateMode(start: string, end: string): DateMode {
  if (!start && !end) return 'none'
  if (start && start === end) return 'single'
  return 'range'
}

export function EditTripInfoButton({ tripId, initialName, initialType, initialStartDate, initialEndDate, metaSuffix }: Props) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(initialName)
  const [type, setType] = useState<LedgerType>(initialType)
  const [startDate, setStartDate] = useState(initialStartDate ?? '')
  const [endDate, setEndDate] = useState(initialEndDate ?? '')
  const [dateMode, setDateMode] = useState<DateMode>(deriveDateMode(initialStartDate ?? '', initialEndDate ?? ''))

  const dateRange = formatTripDateRange(startDate || null, endDate || null)
  const subtitle = [dateRange, metaSuffix].filter(Boolean).join(' · ')

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateTripInfoAction(tripId, formData)
      if (!result?.error) {
        setName((formData.get('name') as string).trim())
        const start = (formData.get('start_date') as string) || ''
        if (dateMode === 'none') {
          setStartDate('')
          setEndDate('')
        } else {
          setStartDate(start)
          setEndDate(dateMode === 'single' ? start : (formData.get('end_date') as string) || '')
        }
        setEditing(false)
      }
    })
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-start gap-2">
          <h1 className="text-[23px] font-bold tracking-tight text-ink leading-snug">{name}</h1>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="編輯帳本資訊"
            className="mt-1 p-1.5 rounded-lg text-ink-4/70 hover:text-accent hover:bg-accent/5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
        {subtitle && (
          <p className="text-[12.5px] text-ink-3 mt-0.5">{subtitle}</p>
        )}
      </div>
    )
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3 w-full">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="date_mode" value={dateMode} />
      <div>
        <label htmlFor="edit-trip-name" className="block text-xs font-medium text-ink-3 mb-1.5">帳本名稱</label>
        <input
          id="edit-trip-name"
          name="name"
          type="text"
          required
          defaultValue={name}
          className={inputClass}
        />
      </div>
      <div>
        <p className="text-xs font-medium text-ink-3 mb-1.5">類型</p>
        <LedgerTypeGrid value={type} onChange={setType} />
      </div>
      <div>
        <p className="text-xs font-medium text-ink-3 mb-1.5">日期<span className="text-ink-4 font-normal ml-1">（選填）</span></p>
        <div className="flex bg-fill rounded-[9px] p-0.5 gap-0.5 mb-2">
          {DATE_MODES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setDateMode(mode)}
              aria-pressed={dateMode === mode}
              className={`flex-1 text-xs font-semibold whitespace-nowrap rounded-[7px] px-3 py-[5px] transition-all ${
                dateMode === mode ? 'bg-white text-ink shadow-card' : 'text-ink-3'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {dateMode === 'single' && (
          <input name="start_date" type="date" aria-label="日期" defaultValue={startDate} className={inputClass} />
        )}
        {dateMode === 'range' && (
          <div className="flex items-center gap-2">
            <input
              name="start_date"
              type="date"
              aria-label="開始日期"
              defaultValue={startDate}
              className={`${inputClass} flex-1`}
            />
            <span className="text-ink-4 text-sm shrink-0" aria-hidden="true">–</span>
            <input
              name="end_date"
              type="date"
              aria-label="結束日期"
              defaultValue={endDate}
              className={`${inputClass} flex-1`}
            />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-accent hover:bg-accent-deep text-white text-sm font-semibold py-2 rounded-[10px] transition-colors disabled:opacity-60"
        >
          {isPending ? '儲存中...' : '儲存'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex-1 bg-fill text-ink-2 text-sm font-medium py-2 rounded-[10px] hover:bg-line transition-colors"
        >
          取消
        </button>
      </div>
    </form>
  )
}
