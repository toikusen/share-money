import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { calculateNetBalances, minimizeTransfers } from '@/lib/utils/balance'
import { convertToTWD } from '@/lib/utils/currency'
import type { Currency } from '@/types/database'
import Link from 'next/link'

type MemberProfile = { id: string; display_name: string }
type ExpenseRow = { id: string; amount: number; currency: Currency; paid_by: string }
type SplitRow = { expense_id: string; user_id: string; amount: number }

export default async function BalancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: trip } = await supabase.from('trips').select('*').eq('id', id).single()
  if (!trip) notFound()

  const { data: memberships } = await supabase
    .from('trip_members')
    .select('user_id, profiles(id, display_name)')
    .eq('trip_id', id)

  const profileMap = new Map(
    memberships?.map(m => {
      const profile = m.profiles as unknown as MemberProfile
      return [profile.id, profile.display_name]
    }) ?? []
  )

  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, amount, currency, paid_by')
    .eq('trip_id', id)

  const { data: splits } = await supabase
    .from('expense_splits')
    .select('expense_id, user_id, amount')
    .in('expense_id', expenses?.map(e => e.id) ?? [])

  const balances = calculateNetBalances(
    (expenses ?? []) as ExpenseRow[],
    (splits ?? []) as SplitRow[],
    trip.exchange_rate
  )
  const transfers = minimizeTransfers(balances)

  const totalTWD = (expenses ?? []).reduce(
    (sum, e) => sum + convertToTWD(e.amount, e.currency as any, trip.exchange_rate),
    0
  )

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/trips/${id}`} className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold">分帳結算</h1>
      </div>

      <div className="bg-indigo-50 rounded-xl p-4 mb-6 flex justify-between">
        <div>
          <div className="text-xs text-indigo-500 font-medium">行程總費用</div>
          <div className="text-2xl font-bold text-indigo-700">NT${totalTWD.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-indigo-500 font-medium">使用匯率</div>
          <div className="text-sm text-indigo-700">1 JPY = {trip.exchange_rate} TWD</div>
        </div>
      </div>

      {transfers.length === 0 ? (
        <p className="text-center text-gray-400 py-8">🎉 已全部結清</p>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-500">轉帳清單（共 {transfers.length} 筆）</h2>
          {transfers.map((t, i) => (
            <div key={i} className="bg-white border border-red-100 rounded-xl p-4 flex justify-between items-center">
              <div className="text-sm">
                <span className="font-medium text-red-600">{profileMap.get(t.from) ?? '未知成員'}</span>
                <span className="text-gray-400"> 付給 </span>
                <span className="font-medium text-green-700">{profileMap.get(t.to) ?? '未知成員'}</span>
              </div>
              <div className="font-semibold text-gray-900">NT${t.amountTWD.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
