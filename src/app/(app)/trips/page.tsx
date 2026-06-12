import { createClient } from '@/lib/supabase/server'
import { TripCard } from '@/components/trips/TripCard'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function TripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships, error: membershipsError } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('user_id', user!.id)

  if (membershipsError) {
    console.error('Failed to load trip memberships', membershipsError)
    throw new Error('無法載入行程清單')
  }

  const tripIds = memberships?.map(m => m.trip_id) ?? []

  const { data: trips, error: tripsError } = await supabase
    .from('trips')
    .select('*')
    .in('id', tripIds.length > 0 ? tripIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })

  if (tripsError) {
    console.error('Failed to load trips', tripsError)
    throw new Error('無法載入行程清單')
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">我的行程</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/trips/new"
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            + 新增行程
          </Link>
          <Link
            href="/settings"
            aria-label="設定"
            className="text-gray-400 hover:text-gray-600 transition"
          >
            ⚙️
          </Link>
        </div>
      </div>

      {trips?.length === 0 ? (
        <p className="text-center text-gray-400 py-12">還沒有行程，點右上角建立第一個</p>
      ) : (
        <div className="flex flex-col gap-3">
          {trips?.map(trip => <TripCard key={trip.id} trip={trip} currentUserId={user.id} />)}
        </div>
      )}
    </main>
  )
}
