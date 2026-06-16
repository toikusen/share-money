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

// 紅綠保留金錢語意,但事件類型仍可分色:新增=gain、編輯=accent、刪除=owe
function dotClass(action: ActivityRow['action']): string {
  switch (action) {
    case 'expense.created': return 'bg-gain'
    case 'expense.updated': return 'bg-accent'
    case 'expense.deleted': return 'bg-owe'
    default: return 'bg-edge'
  }
}

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
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-1">
        <Link
          href={`/trips/${id}`}
          aria-label="返回行程"
          className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-base font-bold text-ink">編輯紀錄</h1>
      </div>
      <p className="text-xs text-ink-4 mb-6 ml-[26px]">
        {trip.name} · 最近 {rows.length} 筆異動
      </p>

      {rows.length === 0 ? (
        <p className="text-center text-sm text-ink-4 py-10">尚無編輯紀錄</p>
      ) : (
        <ol className="relative ml-1.5 flex flex-col gap-5 border-l border-edge pl-5">
          {rows.map((row, i) => (
            <li key={row.id} className="relative anim-rise" style={{ animationDelay: `${Math.min(i * 50, 500)}ms` }}>
              <span
                aria-hidden="true"
                className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${dotClass(row.action)}`}
              />
              <p className="text-sm text-ink">
                {formatActivityText(row, row.actor?.display_name ?? '未知成員', nameOf)}
              </p>
              <p className="font-mono tabular-nums text-[11px] text-ink-4 mt-1">
                {formatExpenseDateTime(row.created_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
