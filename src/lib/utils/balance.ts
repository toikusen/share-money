import type { Currency } from '@/types/database'
import { convertToTWD } from './currency'

type ExpenseRow = { id: string; amount: number; currency: Currency; paid_by: string }
type SplitRow   = { expense_id: string; user_id: string; amount: number }

export type NetBalance = { userId: string; netTWD: number }
export type Transfer   = { from: string; to: string; amountTWD: number }

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
