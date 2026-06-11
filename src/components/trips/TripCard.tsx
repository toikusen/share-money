import Link from 'next/link'
import type { Trip } from '@/types/database'

export function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition"
    >
      <div className="font-semibold text-gray-900">{trip.name}</div>
      <div className="text-sm text-gray-500 mt-1">
        1 JPY = {trip.exchange_rate} TWD ·{' '}
        {new Date(trip.created_at).toLocaleDateString('zh-TW')}
      </div>
    </Link>
  )
}
