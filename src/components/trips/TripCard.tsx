import Link from 'next/link'
import type { Trip } from '@/types/database'
import { deleteTripAction } from '@/lib/actions/trips'
import { DeleteTripButton } from '@/components/trips/DeleteTripButton'
import { formatTripDateRange } from '@/lib/utils/datetime'

export function TripCard({ trip, currentUserId }: { trip: Trip; currentUserId: string }) {
  const canDelete = trip.created_by === currentUserId

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition dark:bg-gray-900 dark:border-gray-800 dark:hover:border-indigo-700">
      <Link href={`/trips/${trip.id}`} className="block">
        <div className="font-semibold text-gray-900 dark:text-gray-100">{trip.name}</div>
        {(trip.start_date || trip.end_date) && (
          <div className="text-xs font-medium text-indigo-500 dark:text-indigo-400 mt-0.5">
            {formatTripDateRange(trip.start_date, trip.end_date)}
          </div>
        )}
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          1 JPY = {trip.exchange_rate} TWD
        </div>
      </Link>
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
        <Link href={`/trips/${trip.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          開啟
        </Link>
        {canDelete && (
          <DeleteTripButton action={deleteTripAction.bind(null, trip.id) as (formData: FormData) => Promise<void>} />
        )}
      </div>
    </div>
  )
}
