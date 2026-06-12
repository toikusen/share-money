import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { ExpenseList, type ExpenseDisplayRow } from '@/components/expenses/ExpenseList'
import { InviteCard } from '@/components/trips/InviteCard'
import { deleteTripAction, updateExchangeRateAction } from '@/lib/actions/trips'
import { getRequestSiteUrl } from '@/lib/site-url'
import { DeleteTripButton } from '@/components/trips/DeleteTripButton'
import { EditTripInfoButton } from '@/components/trips/EditTripInfoButton'
import Link from 'next/link'

type MemberProfile = { id: string; display_name: string; avatar_url: string | null; created_at: string }

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: trip, error: tripError } = await supabase.from('trips').select('*').eq('id', id).single()
  if (tripError && tripError.code !== 'PGRST116') {
    console.error('Failed to load trip', { tripId: id, error: tripError })
    throw new Error('無法載入行程')
  }
  if (!trip) notFound()

  const { data: memberships, error: membershipsError } = await supabase
    .from('trip_members')
    .select('user_id, profiles(id, display_name, avatar_url, created_at)')
    .eq('trip_id', id)

  if (membershipsError) {
    console.error('Failed to load trip members', { tripId: id, error: membershipsError })
    throw new Error('無法載入行程成員')
  }

  const members = (memberships?.map(m => m.profiles).filter(Boolean) ?? []) as unknown as MemberProfile[]

  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select('*, expense_splits(*), payer:profiles!paid_by(id, display_name, avatar_url, created_at)')
    .eq('trip_id', id)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (expensesError) {
    console.error('Failed to load trip expenses', { tripId: id, error: expensesError })
    throw new Error('無法載入費用明細')
  }

  const expenseRows = (expenses ?? []) as unknown as ExpenseDisplayRow[]
  const inviteUrl = `${await getRequestSiteUrl()}/join/${trip.invite_token}`
  const canDeleteTrip = trip.created_by === user!.id

  async function updateRate(formData: FormData) {
    'use server'
    const rate = parseFloat(formData.get('rate') as string)
    await updateExchangeRateAction(id, rate)
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-4 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          所有行程
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-snug">{trip.name}</h1>
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

        <div className="mt-4">
          <Link
            href={`/trips/${id}/balance`}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 active:scale-95 transition-all dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            結算帳目
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Exchange rate */}
      <form action={updateRate} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-6">
        <span>1 JPY =</span>
        <input
          name="rate"
          type="number"
          step="0.0001"
          defaultValue={trip.exchange_rate}
          className="w-24 border border-gray-200 rounded px-2 py-0.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <span>TWD</span>
        <button type="submit" className="text-indigo-600 hover:text-indigo-700 text-xs dark:text-indigo-300 dark:hover:text-indigo-200">更新</button>
      </form>

      {/* Members */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">成員（{members.length} 人）</h2>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <span key={m.id} className="bg-gray-100 text-gray-800 rounded-full px-3 py-1 text-sm dark:bg-gray-800 dark:text-gray-100">
              {m.display_name}
            </span>
          ))}
        </div>
        <InviteCard inviteUrl={inviteUrl} />
      </section>

      {/* Expenses */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">費用明細</h2>
          <div className="flex items-center gap-2">
            <AddExpenseModal tripId={id} members={members} currentUserId={user!.id} compact />
            <Link
              href={`/trips/${id}/activity`}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l3 2" />
              </svg>
              編輯紀錄
            </Link>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {expenseRows.length > 0
            ? `共 ${expenseRows.length} 筆，依付款日期由新到舊排列`
            : '新增費用後，明細會依付款日期分組顯示'}
        </p>
        <ExpenseList tripId={id} expenses={expenseRows} members={members} currentUserId={user!.id} />
      </section>
    </main>
  )
}
