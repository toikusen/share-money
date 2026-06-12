import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatActivityText } from '@/lib/utils/activity'
import { formatExpenseDateTime } from '@/lib/utils/datetime'
import type { ActivityEvent } from '@/types/database'

type ActivityRow = {
  id: string
  created_at: string
  actor: { display_name: string } | null
} & ActivityEvent

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: trip, error: tripError } = await supabase.from('trips').select('id, name').eq('id', id).single()
  if (tripError && tripError.code !== 'PGRST116') {
    console.error('Failed to load trip for activity', { tripId: id, error: tripError })
    throw new Error('無法載入行程')
  }
  if (!trip) notFound()

  const { data: memberships, error: membershipsError } = await supabase
    .from('trip_members')
    .select('user_id, profiles(id, display_name)')
    .eq('trip_id', id)

  if (membershipsError) {
    console.error('Failed to load trip members for activity', { tripId: id, error: membershipsError })
    throw new Error('無法載入行程成員')
  }

  const profileMap = new Map(
    memberships?.map(m => {
      const profile = m.profiles as unknown as { id: string; display_name: string }
      return [profile.id, profile.display_name]
    }) ?? []
  )
  const nameOf = (userId: string) => profileMap.get(userId) ?? '未知成員'

  const { data: logs, error: logsError } = await supabase
    .from('activity_logs')
    .select('id, action, details, created_at, actor:profiles!actor_id(display_name)')
    .eq('trip_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (logsError) {
    console.error('Failed to load activity logs', { tripId: id, error: logsError })
    throw new Error('無法載入活動紀錄')
  }

  const rows = (logs ?? []) as unknown as ActivityRow[]

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/trips/${id}`} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">←</Link>
        <h1 className="text-xl font-bold">活動紀錄</h1>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        {trip.name} · 最近 {rows.length} 筆異動
      </p>

      {rows.length === 0 ? (
        <p className="text-center text-gray-400 py-8">尚無活動紀錄</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map(row => (
            <li key={row.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 dark:bg-gray-900 dark:border-gray-800">
              <p className="text-sm text-gray-800 dark:text-gray-100">
                {formatActivityText(row, row.actor?.display_name ?? '未知成員', nameOf)}
              </p>
              <p className="font-mono tabular-nums text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                {formatExpenseDateTime(row.created_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
