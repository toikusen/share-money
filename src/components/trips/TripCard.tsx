import Link from 'next/link'
import type { Trip } from '@/types/database'
import { formatTripDateRange } from '@/lib/utils/datetime'
import { LedgerTypeIcon } from '@/components/trips/LedgerTypeIcon'

type Props = {
  trip: Trip & { members: Array<{ count: number }> }
  currentUserId: string
}

// ponytail: 設計稿的「應收/應付」淨額欄位先跳過 —— 需要對每個帳本多查一次
// stats;等列表頁有彙總查詢再加。
export function TripCard({ trip }: Props) {
  const dateRange = formatTripDateRange(trip.start_date, trip.end_date)
  const memberCount = trip.members[0]?.count ?? 0

  // 有值才顯示,用 · 串接;無日期的日常帳本標「長期」
  const meta = [
    dateRange || (trip.type === 'household' ? '長期' : ''),
    memberCount > 0 ? `${memberCount} 人` : '',
    trip.foreign_currency ?? '',
  ].filter(Boolean)

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="flex items-center gap-3 bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-shadow p-4"
    >
      <LedgerTypeIcon type={trip.type} size={38} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[15px] text-ink truncate">{trip.name}</div>
        {meta.length > 0 && (
          <div className="text-xs text-ink-4 mt-1">
            {meta.map((part, i) => (
              <span key={i}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                {part}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="text-ink-4 shrink-0" aria-hidden="true">›</span>
    </Link>
  )
}
