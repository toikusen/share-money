import { createClient } from '@/lib/supabase/server'
import { TripCard } from '@/components/trips/TripCard'
import { getPendingReviews } from '@/lib/reviews'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function TripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const reviewCount = (await getPendingReviews()).length

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
    <main className="max-w-lg mx-auto px-5 pt-6 pb-10">
      {/* Brand topbar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          {/* Logomark: two overlapping coins with $ — matches PWA icon */}
          <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="8" r="6" fill="white" fillOpacity="0.3"/>
              <circle cx="15" cy="8" r="6" fill="white"/>
              <line x1="15" y1="3.5" x2="15" y2="12.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M17.5 5.5C17.5 4.5 16.5 4 15 4C13.5 4 12.5 4.7 12.5 6C12.5 7 13.5 7.5 15 8C16.5 8.5 17.5 9 17.5 10C17.5 11.3 16.5 12 15 12C13.5 12 12.5 11.5 12.5 10.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight select-none text-ink">
            share<span className="text-ink-4 mx-0.5 font-normal">·</span>money
          </span>
        </div>
        <div className="flex items-center gap-0.5">
        <Link
          href="/review"
          aria-label={reviewCount > 0 ? `待我審核 ${reviewCount} 筆` : '待我審核'}
          className="relative p-2 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-fill transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {reviewCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-owe text-white text-[10px] font-semibold leading-4 text-center tabular-nums">
              {reviewCount > 9 ? '9+' : reviewCount}
            </span>
          )}
        </Link>
        <Link
          href="/settings"
          aria-label="設定"
          className="p-2 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-fill transition-colors"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </Link>
        </div>
      </div>

      {/* Page heading + action */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-[21px] font-bold tracking-tight text-ink">我的行程</h1>
        <Link
          href="/trips/new"
          className="inline-flex items-center gap-1.5 bg-accent text-white text-[13px] font-semibold px-4 py-2 rounded-full hover:bg-accent-deep active:scale-95 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          新增行程
        </Link>
      </div>

      {trips?.length === 0 ? (
        <p className="text-center text-sm text-ink-4 py-16">還沒有行程，點右上角建立第一個</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {trips?.map(trip => <TripCard key={trip.id} trip={trip} currentUserId={user.id} />)}
        </div>
      )}
    </main>
  )
}
