import Link from 'next/link'
import type { Trip } from '@/types/database'
import { deleteTripAction } from '@/lib/actions/trips'
import { DeleteTripButton } from '@/components/trips/DeleteTripButton'

export function TripCard({ trip, currentUserId }: { trip: Trip; currentUserId: string }) {
  const canDelete = trip.created_by === currentUserId

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition">
      <Link href={`/trips/${trip.id}`} className="block">
        <div className="font-semibold text-gray-900">{trip.name}</div>
        <div className="text-sm text-gray-500 mt-1">
          1 JPY = {trip.exchange_rate} TWD ·{' '}
          {new Date(trip.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}
        </div>
      </Link>
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
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
