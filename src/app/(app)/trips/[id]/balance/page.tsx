import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { calculateMemberStats, minimizeTransfers } from '@/lib/utils/balance'
import { convertToTWD } from '@/lib/utils/currency'
import { PaidShareChart } from '@/components/balance/PaidShareChart'
import { NetChart } from '@/components/balance/NetChart'
import { TransferFlow } from '@/components/balance/TransferFlow'
import type { Currency } from '@/types/database'
import Link from 'next/link'

type MemberProfile = { id: string; display_name: string }
type ExpenseRow = { id: string; amount: number; currency: Currency; paid_by: string }
type SplitRow = { expense_id: string; user_id: string; amount: number }

function StepHeading({ no, title, desc }: { no: string; title: string; desc: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] tracking-[0.25em] text-indigo-400 dark:text-indigo-300">STEP {no}</span>
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h2>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>
    </div>
  )
}

export default async function BalancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: trip, error: tripError } = await supabase.from('trips').select('*').eq('id', id).single()
  if (tripError && tripError.code !== 'PGRST116') {
    console.error('Failed to load trip for balance', { tripId: id, error: tripError })
    throw new Error('無法載入行程')
  }
  if (!trip) notFound()

  const { data: memberships, error: membershipsError } = await supabase
    .from('trip_members')
    .select('user_id, profiles(id, display_name)')
    .eq('trip_id', id)

  if (membershipsError) {
    console.error('Failed to load trip members for balance', { tripId: id, error: membershipsError })
    throw new Error('無法載入行程成員')
  }

  const profileMap = new Map(
    memberships?.map(m => {
      const profile = m.profiles as unknown as MemberProfile
      return [profile.id, profile.display_name]
    }) ?? []
  )
  const nameOf = (userId: string) => profileMap.get(userId) ?? '未知成員'

  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select('id, amount, currency, paid_by')
    .eq('trip_id', id)

  if (expensesError) {
    console.error('Failed to load expenses for balance', { tripId: id, error: expensesError })
    throw new Error('無法載入費用明細')
  }

  const { data: splits, error: splitsError } = await supabase
    .from('expense_splits')
    .select('expense_id, user_id, amount')
    .in('expense_id', expenses?.map(e => e.id) ?? [])

  if (splitsError) {
    console.error('Failed to load expense splits for balance', { tripId: id, error: splitsError })
    throw new Error('無法載入分帳明細')
  }

  const expenseRows = (expenses ?? []) as ExpenseRow[]
  const stats = calculateMemberStats(expenseRows, (splits ?? []) as SplitRow[], trip.exchange_rate)
  const transfers = minimizeTransfers(stats.map(s => ({ userId: s.userId, netTWD: s.netTWD })))

  // Include members with no expenses so every participant shows up in the charts
  const allStats = Array.from(profileMap.keys()).map(userId =>
    stats.find(s => s.userId === userId) ?? { userId, paidTWD: 0, owedTWD: 0, netTWD: 0 }
  )

  const totalTWD = expenseRows.reduce(
    (sum, e) => sum + convertToTWD(e.amount, e.currency, trip.exchange_rate),
    0
  )

  const paidRows = allStats
    .map(s => ({ name: nameOf(s.userId), paidTWD: s.paidTWD, owedTWD: s.owedTWD }))
    .sort((a, b) => b.paidTWD - a.paidTWD)

  const netRows = allStats
    .map(s => ({ name: nameOf(s.userId), netTWD: s.netTWD }))
    .sort((a, b) => b.netTWD - a.netTWD)

  const debtors = allStats
    .filter(s => s.netTWD < -0.005)
    .sort((a, b) => a.netTWD - b.netTWD)
    .map(s => ({ id: s.userId, name: nameOf(s.userId), amount: -s.netTWD }))

  const creditors = allStats
    .filter(s => s.netTWD > 0.005)
    .sort((a, b) => b.netTWD - a.netTWD)
    .map(s => ({ id: s.userId, name: nameOf(s.userId), amount: s.netTWD }))

  const flowTransfers = transfers.map(t => ({
    ...t,
    fromName: nameOf(t.from),
    toName: nameOf(t.to),
  }))

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/trips/${id}`} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">←</Link>
        <h1 className="text-xl font-bold">分帳結算</h1>
      </div>

      {/* Hero ticket */}
      <div className="ticket-card rounded-2xl p-5 mb-8 text-indigo-100 anim-rise">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-mono text-[10px] tracking-[0.3em] text-indigo-300/80 mb-1">SETTLEMENT</div>
            <div className="text-xs text-indigo-200/80">{trip.name} · 行程總費用</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-white mt-1">
              NT${totalTWD.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        <hr className="perforation my-4" />
        <div className="flex justify-between font-mono tabular-nums text-[11px] text-indigo-200/90">
          <span>{expenseRows.length} 筆費用</span>
          <span>{profileMap.size} 位成員</span>
          <span>1 JPY = {trip.exchange_rate} TWD</span>
        </div>
      </div>

      {expenseRows.length === 0 ? (
        <p className="text-center text-gray-400 py-8">尚無費用紀錄</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="bg-white border border-gray-200 rounded-2xl p-5 dark:bg-gray-900 dark:border-gray-800 anim-rise" style={{ animationDelay: '100ms' }}>
            <StepHeading no="01" title="誰墊了多少" desc="每位成員實際付出的錢,對比依分攤規則應負擔的金額" />
            <PaidShareChart rows={paidRows} />
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl p-5 dark:bg-gray-900 dark:border-gray-800 anim-rise" style={{ animationDelay: '200ms' }}>
            <StepHeading no="02" title="多退少補" desc="墊付減去應分擔後的淨額:正值該收錢、負值該付錢" />
            <NetChart rows={netRows} />
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl p-5 dark:bg-gray-900 dark:border-gray-800 anim-rise" style={{ animationDelay: '300ms' }}>
            <StepHeading no="03" title="最少轉帳" desc={`把所有欠款合併為最少筆數的轉帳(共 ${transfers.length} 筆)`} />
            {transfers.length === 0 ? (
              <p className="text-center text-gray-400 py-6">🎉 已全部結清</p>
            ) : (
              <>
                <TransferFlow debtors={debtors} creditors={creditors} transfers={flowTransfers} />
                <div className="flex flex-col gap-2 mt-5">
                  {flowTransfers.map((t, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3 dark:bg-gray-950 anim-rise"
                      style={{ animationDelay: `${400 + i * 80}ms` }}
                    >
                      <div className="text-sm flex items-center gap-2">
                        <span className="font-medium text-rose-600 dark:text-rose-400">{t.fromName}</span>
                        <span className="text-gray-300 dark:text-gray-600">⟶</span>
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">{t.toName}</span>
                      </div>
                      <div className="font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                        NT${t.amountTWD.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
