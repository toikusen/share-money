import Link from 'next/link'
import type { Trip } from '@/types/database'
import { formatTripDateRange } from '@/lib/utils/datetime'

export function TripCard({ trip }: { trip: Trip; currentUserId: string }) {
  const dateRange = formatTripDateRange(trip.start_date, trip.end_date)
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="flex items-center justify-between gap-3 bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-shadow p-4"
    >
      <div className="min-w-0">
        <div className="font-semibold text-[15px] text-ink truncate">{trip.name}</div>
        <div className="text-xs text-ink-4 mt-1">
          {dateRange && (
            <>
              {dateRange}
              <span aria-hidden="true"> · </span>
            </>
          )}
          1 {trip.foreign_currency} = {trip.exchange_rate} TWD
        </div>
      </div>
      <span className="text-ink-4 shrink-0" aria-hidden="true">›</span>
    </Link>
  )
}
