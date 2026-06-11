import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { CopyInviteButton } from '@/components/trips/CopyInviteButton'
import { formatAmount } from '@/lib/utils/currency'
import { updateExchangeRateAction } from '@/lib/actions/trips'
import { deleteExpenseAction } from '@/lib/actions/expenses'
import Link from 'next/link'

type MemberProfile = { id: string; display_name: string; avatar_url: string | null; created_at: string }

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: trip } = await supabase.from('trips').select('*').eq('id', id).single()
  if (!trip) notFound()

  const { data: memberships } = await supabase
    .from('trip_members')
    .select('user_id, profiles(id, display_name, avatar_url, created_at)')
    .eq('trip_id', id)

  const members = (memberships?.map(m => m.profiles).filter(Boolean) ?? []) as unknown as MemberProfile[]

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, expense_splits(*), payer:profiles!paid_by(id, display_name, avatar_url, created_at)')
    .eq('trip_id', id)
    .order('created_at', { ascending: false })

  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/join/${trip.invite_token}`

  async function updateRate(formData: FormData) {
    'use server'
    const rate = parseFloat(formData.get('rate') as string)
    await updateExchangeRateAction(id, rate)
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/trips" className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold flex-1">{trip.name}</h1>
        <Link href={`/trips/${id}/balance`} className="text-sm text-indigo-600 font-medium">
          結算 →
        </Link>
      </div>

      {/* Exchange rate */}
      <form action={updateRate} className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <span>1 JPY =</span>
        <input
          name="rate"
          type="number"
          step="0.0001"
          defaultValue={trip.exchange_rate}
          className="w-24 border border-gray-200 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        <span>TWD</span>
        <button type="submit" className="text-indigo-500 hover:text-indigo-700 text-xs">更新</button>
      </form>

      {/* Members */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">成員（{members.length} 人）</h2>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <span key={m.id} className="bg-gray-100 rounded-full px-3 py-1 text-sm">
              {m.display_name}
            </span>
          ))}
        </div>
        <CopyInviteButton inviteUrl={inviteUrl} />
      </section>

      {/* Expenses */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">費用明細</h2>
        <div className="flex flex-col gap-2 mb-3">
          {expenses?.map(expense => (
            <div key={expense.id} className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{expense.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatAmount(expense.amount, expense.currency as any)} ·{' '}
                    {(expense.payer as any)?.display_name} 付
                  </div>
                </div>
                {expense.created_by === user!.id && (
                  <form action={deleteExpenseAction.bind(null, expense.id, id) as unknown as (formData: FormData) => Promise<void>}>
                    <button type="submit" className="text-xs text-red-400 hover:text-red-600">刪除</button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
        <AddExpenseModal tripId={id} members={members} currentUserId={user!.id} />
      </section>
    </main>
  )
}
