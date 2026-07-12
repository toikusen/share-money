import { createClient, getAuthUser } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { calculateMemberStats, calculateNetBalances, minimizeTransfers } from '@/lib/utils/balance'
import { approvedExpenseIds } from '@/lib/utils/expenses'
import { convertToTWD, formatAmount } from '@/lib/utils/currency'
import { TransferFlow } from '@/components/balance/TransferFlow'
import { RecordSettlementButton } from '@/components/balance/RecordSettlementButton'
import { PaidVsShareChart } from '@/components/balance/PaidVsShareChart'
import { CalcDisclosure } from '@/components/balance/CalcDisclosure'
import { avatarBg, avatarFg, avatarChar, avatarHue } from '@/lib/utils/avatar'
import type { Currency } from '@/types/database'
import Link from 'next/link'

type MemberProfile = { id: string; display_name: string }
type ExpenseRow = { id: string; amount: number; currency: Currency; paid_by: string; kind: 'expense' | 'settlement' }
type SplitRow = { expense_id: string; user_id: string; amount: number }

const twd = (n: number) => `NT$${Math.round(Math.abs(n)).toLocaleString('zh-TW')}`

export default async function BalancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [user, { data: trip, error: tripError }, { data: memberships, error: membershipsError }, { data: expenseRecords, error: expensesError }, { data: paymentAccounts }] =
    await Promise.all([
      getAuthUser(),
      supabase.from('trips').select('*').eq('id', id).single(),
      supabase.from('trip_members').select('user_id, profiles(id, display_name)').eq('trip_id', id),
      supabase
        .from('expenses')
        .select('id, amount, currency, paid_by, kind, expense_splits(expense_id, user_id, amount, approval_status)')
        .eq('trip_id', id),
      supabase.rpc('get_trip_payment_accounts', { p_trip_id: id }),
    ])
  const meId = user!.id

  // 收款帳戶拿不到就當沒分享,不影響結算頁其他功能
  const accountOf = new Map(
    ((paymentAccounts ?? []) as { user_id: string; bank_code: string; account_number: string; account_holder: string | null }[])
      .map(a => [a.user_id, a])
  )

  if (tripError && tripError.code !== 'PGRST116') {
    console.error('Failed to load trip for balance', { tripId: id, error: tripError })
    throw new Error('無法載入行程')
  }
  if (!trip) notFound()

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

  if (expensesError) {
    console.error('Failed to load expenses for balance', { tripId: id, error: expensesError })
    throw new Error('無法載入費用明細')
  }

  const expenses = expenseRecords ?? []
  const splits = expenses.flatMap(e => e.expense_splits ?? [])

  // Only fully-approved expenses settle; pending/rejected are excluded everywhere below.
  const approvedIds = approvedExpenseIds((splits ?? []) as { expense_id: string; approval_status: 'pending' | 'approved' | 'rejected' }[])
  const approvedRows = ((expenses ?? []) as ExpenseRow[]).filter(e => approvedIds.has(e.id))
  const approvedSplits = ((splits ?? []) as SplitRow[]).filter(s => approvedIds.has(s.expense_id))

  // 還款計入淨額,但不是消費——統計(墊付/應攤圖、總費用)只看 kind='expense'
  const spendRows = approvedRows.filter(e => e.kind === 'expense')
  const spendIds = new Set(spendRows.map(e => e.id))
  const spendSplits = approvedSplits.filter(s => spendIds.has(s.expense_id))

  const stats = calculateMemberStats(spendRows, spendSplits, trip.exchange_rate)
  const net = calculateNetBalances(approvedRows, approvedSplits, trip.exchange_rate)
  const transfers = minimizeTransfers(net)

  // 已記錄、待收款方確認的還款——顯示提示避免重複記
  const pendingSettlements = ((expenses ?? []) as (ExpenseRow & {
    expense_splits: { user_id: string; approval_status: string }[]
  })[])
    .filter(e => e.kind === 'settlement')
    .map(e => ({ id: e.id, from: e.paid_by, amount: e.amount, currency: e.currency, split: e.expense_splits[0] }))
    .filter(s => s.split?.approval_status === 'pending')

  // Include members with no expenses so every participant shows up
  const allStats = Array.from(profileMap.keys()).map(userId =>
    stats.find(s => s.userId === userId) ?? { userId, paidTWD: 0, owedTWD: 0, netTWD: 0 }
  )

  const totalTWD = spendRows.reduce(
    (sum, e) => sum + convertToTWD(e.amount, e.currency, trip.exchange_rate),
    0
  )

  // 同時顯示行程幣別:TWD ÷ 匯率 = 外幣
  const fc = trip.foreign_currency
  const foreign = (twdAmount: number) => formatAmount(Math.abs(twdAmount) / trip.exchange_rate, fc)

  const flowTransfers = transfers.map(t => ({
    ...t,
    fromName: nameOf(t.from),
    toName: nameOf(t.to),
  }))

  // 個人化重點:你會收到/需要付出多少
  const myNet = net.find(n => n.userId === meId)?.netTWD ?? 0
  const settled = Math.abs(myNet) < 0.005
  const toMeCount = transfers.filter(t => t.to === meId).length
  const fromMeCount = transfers.filter(t => t.from === meId).length
  const heroTitle = settled ? '你的帳目' : myNet > 0 ? '全部結清後，你會收到' : '全部結清後，你需要付出'
  const heroAmount = settled ? '已結清' : twd(myNet)
  const heroClass = settled ? 'text-ink-3' : myNet > 0 ? 'text-gain' : 'text-owe'
  const heroSub = settled
    ? `不需任何轉帳 · 行程總費用 ${twd(totalTWD)}`
    : myNet > 0
      ? `來自 ${toMeCount} 筆轉帳 · 行程總費用 ${twd(totalTWD)}`
      : `需轉出 ${fromMeCount} 筆 · 行程總費用 ${twd(totalTWD)}`

  // 計算過程:墊付 vs 應攤(淨額由高到低)
  const chartRows = [...allStats]
    .sort((a, b) => b.netTWD - a.netTWD)
    .map(s => ({
      name: nameOf(s.userId),
      isMe: s.userId === meId,
      hue: avatarHue(s.userId),
      paidTWD: s.paidTWD,
      owedTWD: s.owedTWD,
      netTWD: s.netTWD,
    }))

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-5">
        <Link
          href={`/trips/${id}`}
          aria-label="返回行程"
          className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-base font-bold text-ink">結算</h1>
        <span className="text-xs text-ink-4 ml-auto truncate">{trip.name}</span>
      </div>

      {approvedRows.length === 0 && (expenses ?? []).length === 0 ? (
        <p className="text-center text-sm text-ink-4 py-10">尚無費用紀錄</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 重點先講:你的淨額 */}
          <section className="bg-white rounded-2xl shadow-card p-5 flex flex-col items-center gap-1 anim-rise">
            <span className="text-[12.5px] text-ink-3">{heroTitle}</span>
            <span className={`text-[32px] font-bold font-mono tabular-nums tracking-tight ${heroClass}`}>
              {heroAmount}
            </span>
            {!settled && (
              <span className="text-[12.5px] text-ink-4 font-mono tabular-nums">≈ {foreign(myNet)}</span>
            )}
            <span className="text-xs text-ink-4">{heroSub}</span>
          </section>

          {/* 建議轉帳:流向圖 + 清單 */}
          <section className="flex flex-col gap-2.5 anim-rise" style={{ animationDelay: '100ms' }}>
            <h2 className="text-[13px] font-semibold text-ink-2 px-0.5">
              建議轉帳 <span className="font-normal text-ink-4">· 最少 {transfers.length} 筆結清</span>
            </h2>

            {transfers.length === 0 ? (
              <p className="text-center text-sm text-ink-4 py-6">已全部結清</p>
            ) : (
              <>
                <TransferFlow
                  transfers={flowTransfers}
                  currentUserId={meId}
                  memberCount={profileMap.size}
                />

                <div className="bg-white rounded-2xl shadow-card divide-y divide-line">
                  {flowTransfers.map((t, i) => {
                    const mine = t.from === meId || t.to === meId
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-2.5 px-4 py-3 ${mine ? '' : 'opacity-55'}`}
                      >
                        <span
                          className="h-[26px] w-[26px] rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0 select-none"
                          style={{ background: avatarBg(t.from), color: avatarFg(t.from) }}
                          aria-hidden="true"
                        >
                          {avatarChar(t.fromName)}
                        </span>
                        <span className="text-[13.5px] text-ink-2">
                          {t.from === meId ? '你' : t.fromName}
                          <span className="text-ink-4/70 mx-1.5" aria-hidden="true">→</span>
                          <strong className="font-semibold text-ink">{t.to === meId ? '你' : t.toName}</strong>
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          <span className="flex flex-col items-end leading-tight">
                            <span className={`text-[15px] font-semibold font-mono tabular-nums ${
                              t.to === meId ? 'text-gain' : t.from === meId ? 'text-owe' : 'text-ink-2'
                            }`}>
                              {twd(t.amountTWD)}
                            </span>
                            <span className="text-[11px] text-ink-4 font-mono tabular-nums">≈ {foreign(t.amountTWD)}</span>
                          </span>
                          {t.from === meId && (
                            <RecordSettlementButton
                              tripId={id}
                              toUserId={t.to}
                              toName={t.toName}
                              suggestedTWD={t.amountTWD}
                              foreignCurrency={trip.foreign_currency}
                              exchangeRate={trip.exchange_rate}
                              recipientAccount={accountOf.get(t.to) ?? null}
                            />
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {pendingSettlements.length > 0 && (
                  <div className="bg-amber-500/8 rounded-xl px-3.5 py-2.5 flex flex-col gap-1">
                    {pendingSettlements.map(s => (
                      <p key={s.id} className="text-[12px] text-amber-700">
                        {s.from === meId ? '你' : nameOf(s.from)} 已記錄還款 {formatAmount(s.amount, s.currency)} 給{' '}
                        {s.split.user_id === meId ? '你' : nameOf(s.split.user_id)},待確認後計入
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-[11.5px] text-ink-4 px-0.5">與你無關的轉帳會淡化顯示</p>
              </>
            )}
          </section>

          {/* 計算過程:預設收合 */}
          <section className="anim-rise" style={{ animationDelay: '200ms' }}>
            <CalcDisclosure>
              <PaidVsShareChart rows={chartRows} />
              <div className="h-px bg-line my-3" />
              <p className="text-[11.5px] text-ink-4">
                行程總費用 {twd(totalTWD)}（≈ {foreign(totalTWD)}） · {profileMap.size} 位成員 · 1 {trip.foreign_currency} = {trip.exchange_rate} TWD
              </p>
            </CalcDisclosure>
          </section>
        </div>
      )}
    </main>
  )
}
