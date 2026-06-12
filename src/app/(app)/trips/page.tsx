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
    <main className="max-w-lg mx-auto px-4 pt-6 pb-8">
      {/* Brand topbar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          {/* Logomark: split coin */}
          <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2"/>
              <line x1="12" y1="4" x2="12" y2="20" stroke="white" strokeWidth="2"/>
              <line x1="9" y1="9" x2="15" y2="9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="9" y1="15" x2="15" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight select-none">
            <span className="text-indigo-600 dark:text-indigo-400">share</span>
            <span className="text-gray-300 dark:text-gray-600 mx-0.5 font-normal">·</span>
            <span className="text-gray-800 dark:text-gray-100">money</span>
          </span>
        </div>
        <Link
          href="/settings"
          aria-label="設定"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-white/8 transition-colors"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </Link>
      </div>

      {/* Page heading + action */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">我的行程</h1>
        <Link
          href="/trips/new"
          className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-500 active:scale-95 transition-all dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          新增行程
        </Link>
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
