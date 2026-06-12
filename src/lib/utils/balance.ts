import type { Currency } from '@/types/database'
import { convertToTWD } from './currency'

type ExpenseRow = { id: string; amount: number; currency: Currency; paid_by: string }
type SplitRow   = { expense_id: string; user_id: string; amount: number }

export type NetBalance = { userId: string; netTWD: number }
export type Transfer   = { from: string; to: string; amountTWD: number }
export type MemberStat = { userId: string; paidTWD: number; owedTWD: number; netTWD: number }

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Per-member settlement breakdown in TWD: how much each member paid
 * up-front, their share of the costs, and the resulting net position.
 */
export function calculateMemberStats(
  expenses: ExpenseRow[],
  splits: SplitRow[],
  exchangeRate: number
): MemberStat[] {
  const statMap = new Map<string, { paid: number; owed: number }>()
  const entry = (userId: string) => {
    const found = statMap.get(userId)
    if (found) return found
    const created = { paid: 0, owed: 0 }
    statMap.set(userId, created)
    return created
  }

  for (const expense of expenses) {
    entry(expense.paid_by).paid += convertToTWD(expense.amount, expense.currency, exchangeRate)
  }

  for (const split of splits) {
    const expense = expenses.find(e => e.id === split.expense_id)!
    entry(split.user_id).owed += convertToTWD(split.amount, expense.currency, exchangeRate)
  }

  return Array.from(statMap.entries()).map(([userId, { paid, owed }]) => ({
    userId,
    paidTWD: round2(paid),
    owedTWD: round2(owed),
    netTWD: round2(paid - owed),
  }))
}

export function calculateNetBalances(
  expenses: ExpenseRow[],
  splits: SplitRow[],
  exchangeRate: number
): NetBalance[] {
  const netMap = new Map<string, number>()

  for (const expense of expenses) {
    const paid = convertToTWD(expense.amount, expense.currency, exchangeRate)
    netMap.set(expense.paid_by, (netMap.get(expense.paid_by) ?? 0) + paid)
  }

  for (const split of splits) {
    const expense = expenses.find(e => e.id === split.expense_id)!
    const owed = convertToTWD(split.amount, expense.currency, exchangeRate)
    netMap.set(split.user_id, (netMap.get(split.user_id) ?? 0) - owed)
  }

  return Array.from(netMap.entries()).map(([userId, netTWD]) => ({ userId, netTWD }))
}

export function minimizeTransfers(balances: NetBalance[]): Transfer[] {
  const EPSILON = 0.005
  const transfers: Transfer[] = []

  const credits = balances
    .filter(b => b.netTWD > EPSILON)
    .sort((a, b) => b.netTWD - a.netTWD)
    .map(b => ({ ...b }))

  const debts = balances
    .filter(b => b.netTWD < -EPSILON)
    .sort((a, b) => a.netTWD - b.netTWD)
    .map(b => ({ ...b }))

  let ci = 0, di = 0
  while (ci < credits.length && di < debts.length) {
    const amount = Math.min(credits[ci].netTWD, -debts[di].netTWD)
    transfers.push({
      from: debts[di].userId,
      to: credits[ci].userId,
      amountTWD: Math.round(amount * 100) / 100,
    })
    credits[ci].netTWD -= amount
    debts[di].netTWD  += amount
    if (credits[ci].netTWD < EPSILON) ci++
    if (-debts[di].netTWD < EPSILON) di++
  }

  return transfers
}
