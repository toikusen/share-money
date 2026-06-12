'use client'

import { useState, useTransition } from 'react'
import { updateTripInfoAction } from '@/lib/actions/trips'
import { formatTripDateRange } from '@/lib/utils/datetime'

type Props = {
  tripId: string
  initialName: string
  initialStartDate: string | null
  initialEndDate: string | null
}

const inputClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

export function EditTripInfoButton({ tripId, initialName, initialStartDate, initialEndDate }: Props) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(initialName)
  const [startDate, setStartDate] = useState(initialStartDate ?? '')
  const [endDate, setEndDate] = useState(initialEndDate ?? '')

  const dateRange = formatTripDateRange(startDate || null, endDate || null)

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateTripInfoAction(tripId, formData)
      if (!result?.error) {
        setName((formData.get('name') as string).trim())
        setStartDate((formData.get('start_date') as string) || '')
        setEndDate((formData.get('end_date') as string) || '')
        setEditing(false)
      }
    })
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-start gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-snug">{name}</h1>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="編輯行程資訊"
            className="mt-1 p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:text-gray-600 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/30 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
        {dateRange && (
          <p className="text-sm font-medium text-indigo-500 dark:text-indigo-400 mt-0.5">{dateRange}</p>
        )}
      </div>
    )
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">行程名稱</label>
        <input
          name="name"
          type="text"
          required
          defaultValue={name}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">日期區間<span className="text-gray-400 font-normal ml-1">（選填）</span></label>
        <div className="flex items-center gap-2">
          <input
            name="start_date"
            type="date"
            defaultValue={startDate}
            className={`${inputClass} flex-1`}
          />
          <span className="text-gray-400 text-sm shrink-0">–</span>
          <input
            name="end_date"
            type="date"
            defaultValue={endDate}
            className={`${inputClass} flex-1`}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-60"
        >
          {isPending ? '儲存中...' : '儲存'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5 transition-colors"
        >
          取消
        </button>
      </div>
    </form>
  )
}
