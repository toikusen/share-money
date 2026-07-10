import { createClient, getAuthUser } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { ExpenseList, type ExpenseDisplayRow } from '@/components/expenses/ExpenseList'
import { DailySpendChart } from '@/components/expenses/DailySpendChart'
import { InviteCard } from '@/components/trips/InviteCard'
import { deleteTripAction, updateExchangeRateAction, fetchForeignRates } from '@/lib/actions/trips'
import { TripCurrencyEditor } from '@/components/trips/TripCurrencyEditor'
import type { ForeignCurrency } from '@/types/database'
import { getRequestSiteUrl } from '@/lib/site-url'
import { DeleteTripButton } from '@/components/trips/DeleteTripButton'
import { EditTripInfoButton } from '@/components/trips/EditTripInfoButton'
import { calculateMemberStats } from '@/lib/utils/balance'
import { isExpenseApproved } from '@/lib/utils/expenses'
import { avatarBg, avatarFg, avatarChar } from '@/lib/utils/avatar'
import Link from 'next/link'

type MemberProfile = { id: string; display_name: string; avatar_url: string | null; created_at: string }

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // All reads are independent (RLS authorizes each) — run them in one round trip's time
  const [
    user,
    siteUrl,
    { data: trip, error: tripError },
    { data: memberships, error: membershipsError },
    { data: expenses, error: expensesError },
  ] = await Promise.all([
    getAuthUser(),
    getRequestSiteUrl(),
    supabase.from('trips').select('*').eq('id', id).single(),
    supabase
      .from('trip_members')
      .select('user_id, profiles(id, display_name, avatar_url, created_at)')
      .eq('trip_id', id),
    supabase
      .from('expenses')
      .select('*, expense_splits(*), payer:profiles!paid_by(id, display_name, avatar_url, created_at)')
      .eq('trip_id', id)
      .order('paid_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (tripError && tripError.code !== 'PGRST116') {
    console.error('Failed to load trip', { tripId: id, error: tripError })
    throw new Error('無法載入行程')
  }
  if (!trip) notFound()

  if (membershipsError) {
    console.error('Failed to load trip members', { tripId: id, error: membershipsError })
    throw new Error('無法載入行程成員')
  }

  const members = (memberships?.map(m => m.profiles).filter(Boolean) ?? []) as unknown as MemberProfile[]

  if (expensesError) {
    console.error('Failed to load trip expenses', { tripId: id, error: expensesError })
    throw new Error('無法載入費用明細')
  }

  const expenseRows = (expenses ?? []) as unknown as ExpenseDisplayRow[]
  // Currency is only switchable before any expense exists; fetch live rates just for that case.
  const foreignRates = expenseRows.length === 0 ? await fetchForeignRates() : null
  const inviteUrl = `${siteUrl}/join/${trip.invite_token}`
  const canDeleteTrip = trip.created_by === user!.id

  // 你的目前淨額 — 結算入口直接預告答案。只計入全員審核通過的費用。
  const approvedRows = expenseRows.filter(e => isExpenseApproved(e.expense_splits))
  const statRows = approvedRows.map(e => ({ id: e.id, amount: e.amount, currency: e.currency, paid_by: e.paid_by }))
  const splitRows = approvedRows.flatMap(e =>
    e.expense_splits.map(s => ({ expense_id: e.id, user_id: s.user_id, amount: s.amount }))
  )
  const stats = calculateMemberStats(statRows, splitRows, trip.exchange_rate)
  const myNet = stats.find(s => s.userId === user!.id)?.netTWD ?? 0
  const settled = Math.abs(myNet) < 0.005
  const netWord = settled ? '已結清' : myNet > 0 ? '你應收' : '你應付'
  const netClass = settled ? 'text-ink-3' : myNet > 0 ? 'text-gain' : 'text-owe'
  const netAmount = settled ? '—' : `NT$${Math.round(Math.abs(myNet)).toLocaleString('zh-TW')}`

  async function updateRate(formData: FormData) {
    'use server'
    const rate = parseFloat(formData.get('rate') as string)
    await updateExchangeRateAction(id, rate)
  }

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      {/* Header */}
      <div className="mb-5">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink-2 mb-4 transition-colors py-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          行程
        </Link>

        <div className="flex items-start justify-between gap-2">
          {canDeleteTrip ? (
            <EditTripInfoButton
              tripId={id}
              initialName={trip.name}
              initialStartDate={trip.start_date}
              initialEndDate={trip.end_date}
            />
          ) : (
            <div>
              <h1 className="text-[23px] font-bold tracking-tight text-ink leading-snug">{trip.name}</h1>
            </div>
          )}
          {canDeleteTrip && (
            <DeleteTripButton
              action={deleteTripAction.bind(null, id) as (formData: FormData) => Promise<void>}
              label="刪除行程"
              iconOnly
            />
          )}
        </div>
      </div>

      {/* 結算入口:直接預告你的淨額 */}
      <Link
        href={`/trips/${id}/balance`}
        className="flex items-center justify-between bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-shadow px-4 py-3.5"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[11.5px] text-ink-3">目前結算 · {netWord}</span>
          <span className={`text-xl font-bold font-mono tabular-nums ${netClass}`}>{netAmount}</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
          結算帳目
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      </Link>

      {/* 每日支出(點長條跳到該日明細) */}
      <DailySpendChart
        expenses={approvedRows.map(e => ({ paid_at: e.paid_at, amount: e.amount, currency: e.currency }))}
        exchangeRate={trip.exchange_rate}
        startDate={trip.start_date}
        endDate={trip.end_date}
      />

      {/* 成員 + 邀請 */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center" aria-label={`成員 ${members.length} 人`}>
          {members.map(m => (
            <span
              key={m.id}
              role="img"
              aria-label={m.display_name}
              className="h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center ring-2 ring-surface -ml-1.5 first:ml-0 select-none"
              style={{ background: avatarBg(m.id), color: avatarFg(m.id) }}
            >
              {avatarChar(m.display_name)}
            </span>
          ))}
        </div>
        <InviteCard inviteUrl={inviteUrl} />
      </div>

      {/* 匯率(安靜的工具列)。無費用時可連幣別一起改；有費用後幣別鎖定，只改匯率。 */}
      {foreignRates ? (
        <TripCurrencyEditor
          tripId={id}
          currency={trip.foreign_currency as ForeignCurrency}
          rate={trip.exchange_rate}
          rates={foreignRates}
        />
      ) : (
        <form action={updateRate} className="flex items-center gap-1.5 text-xs text-ink-3 mt-3">
          <span>匯率 1 {trip.foreign_currency} =</span>
          <input
            name="rate"
            type="number"
            step="0.0001"
            defaultValue={trip.exchange_rate}
            className="w-20 bg-fill border-0 rounded-md px-2 py-1 text-xs text-ink text-right font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/35"
          />
          <span>TWD</span>
          <button type="submit" className="ml-1 text-accent hover:text-accent-deep text-xs font-medium transition-colors">更新</button>
        </form>
      )}

      {/* Expenses */}
      <section className="mt-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-ink-2">
            費用明細 <span className="font-normal text-ink-4">· {expenseRows.length} 筆</span>
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/trips/${id}/activity`}
              aria-label="編輯紀錄"
              className="p-2 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-fill transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l3 2" />
              </svg>
            </Link>
            <AddExpenseModal tripId={id} members={members} currentUserId={user!.id} foreignCurrency={trip.foreign_currency} compact />
          </div>
        </div>
        {expenseRows.length === 0 && (
          <p className="text-center text-sm text-ink-4 py-10">還沒有費用，點「記一筆」開始</p>
        )}
        <ExpenseList
          tripId={id}
          expenses={expenseRows}
          members={members}
          currentUserId={user!.id}
          exchangeRate={trip.exchange_rate}
          foreignCurrency={trip.foreign_currency}
        />
      </section>
    </main>
  )
}
