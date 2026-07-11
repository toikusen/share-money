import { describe, it, expect } from 'vitest'
import { calculateNetBalances, calculateMemberStats, minimizeTransfers } from '@/lib/utils/balance'

describe('calculateNetBalances', () => {
  it('alice paid for both: alice net positive, bob net negative', () => {
    const expenses = [{ id: 'e1', amount: 1000, currency: 'JPY' as const, paid_by: 'alice' }]
    const splits = [
      { expense_id: 'e1', user_id: 'alice', amount: 500 },
      { expense_id: 'e1', user_id: 'bob', amount: 500 },
    ]
    const balances = calculateNetBalances(expenses, splits, 0.218)
    const alice = balances.find(b => b.userId === 'alice')!
    const bob = balances.find(b => b.userId === 'bob')!
    // alice paid 1000 JPY (218 TWD), owes 500 JPY (109 TWD) → net +109 TWD
    expect(alice.netTWD).toBeCloseTo(109, 2)
    expect(bob.netTWD).toBeCloseTo(-109, 2)
  })

  it('net sum is zero', () => {
    const expenses = [{ id: 'e1', amount: 300, currency: 'TWD' as const, paid_by: 'alice' }]
    const splits = [
      { expense_id: 'e1', user_id: 'alice', amount: 100 },
      { expense_id: 'e1', user_id: 'bob', amount: 100 },
      { expense_id: 'e1', user_id: 'carol', amount: 100 },
    ]
    const balances = calculateNetBalances(expenses, splits, 0.218)
    const total = balances.reduce((sum, b) => sum + b.netTWD, 0)
    expect(total).toBeCloseTo(0, 5)
  })
})

describe('calculateMemberStats', () => {
  it('returns paid, owed, and net per member', () => {
    const expenses = [{ id: 'e1', amount: 1000, currency: 'JPY' as const, paid_by: 'alice' }]
    const splits = [
      { expense_id: 'e1', user_id: 'alice', amount: 500 },
      { expense_id: 'e1', user_id: 'bob', amount: 500 },
    ]
    const stats = calculateMemberStats(expenses, splits, 0.218)
    const alice = stats.find(s => s.userId === 'alice')!
    const bob = stats.find(s => s.userId === 'bob')!
    expect(alice).toEqual({ userId: 'alice', paidTWD: 218, owedTWD: 109, netTWD: 109 })
    expect(bob).toEqual({ userId: 'bob', paidTWD: 0, owedTWD: 109, netTWD: -109 })
  })

  it('accumulates across multiple expenses and currencies', () => {
    const expenses = [
      { id: 'e1', amount: 1000, currency: 'JPY' as const, paid_by: 'alice' },
      { id: 'e2', amount: 300, currency: 'TWD' as const, paid_by: 'bob' },
    ]
    const splits = [
      { expense_id: 'e1', user_id: 'alice', amount: 500 },
      { expense_id: 'e1', user_id: 'bob', amount: 500 },
      { expense_id: 'e2', user_id: 'alice', amount: 150 },
      { expense_id: 'e2', user_id: 'bob', amount: 150 },
    ]
    const stats = calculateMemberStats(expenses, splits, 0.218)
    const alice = stats.find(s => s.userId === 'alice')!
    // paid 218, owes 109 + 150 = 259 → net -41
    expect(alice.paidTWD).toBeCloseTo(218, 2)
    expect(alice.owedTWD).toBeCloseTo(259, 2)
    expect(alice.netTWD).toBeCloseTo(-41, 2)
  })

  it('net matches calculateNetBalances', () => {
    const expenses = [{ id: 'e1', amount: 999, currency: 'JPY' as const, paid_by: 'alice' }]
    const splits = [
      { expense_id: 'e1', user_id: 'alice', amount: 333 },
      { expense_id: 'e1', user_id: 'bob', amount: 333 },
      { expense_id: 'e1', user_id: 'carol', amount: 333 },
    ]
    const stats = calculateMemberStats(expenses, splits, 0.218)
    const balances = calculateNetBalances(expenses, splits, 0.218)
    for (const b of balances) {
      expect(stats.find(s => s.userId === b.userId)!.netTWD).toBeCloseTo(b.netTWD, 2)
    }
  })
})

describe('settlement flow through balance math', () => {
  // bob owes alice 109 TWD after e1 (1000 JPY @ 0.218, split 50/50)
  const expense = { id: 'e1', amount: 1000, currency: 'JPY' as const, paid_by: 'alice' }
  const expenseSplits = [
    { expense_id: 'e1', user_id: 'alice', amount: 500 },
    { expense_id: 'e1', user_id: 'bob', amount: 500 },
  ]

  it('partial repayment reduces the suggested transfer', () => {
    const settlement = { id: 's1', amount: 50, currency: 'TWD' as const, paid_by: 'bob' }
    const settlementSplit = { expense_id: 's1', user_id: 'alice', amount: 50 }
    const net = calculateNetBalances([expense, settlement], [...expenseSplits, settlementSplit], 0.218)
    const transfers = minimizeTransfers(net)
    expect(transfers).toEqual([{ from: 'bob', to: 'alice', amountTWD: 59 }])
  })

  it('full repayment settles: no transfers left', () => {
    const settlement = { id: 's1', amount: 109, currency: 'TWD' as const, paid_by: 'bob' }
    const settlementSplit = { expense_id: 's1', user_id: 'alice', amount: 109 }
    const net = calculateNetBalances([expense, settlement], [...expenseSplits, settlementSplit], 0.218)
    expect(minimizeTransfers(net)).toHaveLength(0)
  })

  it('foreign-currency repayment converts at the trip rate', () => {
    // 500 JPY = 109 TWD at 0.218 → full settle
    const settlement = { id: 's1', amount: 500, currency: 'JPY' as const, paid_by: 'bob' }
    const settlementSplit = { expense_id: 's1', user_id: 'alice', amount: 500 }
    const net = calculateNetBalances([expense, settlement], [...expenseSplits, settlementSplit], 0.218)
    expect(minimizeTransfers(net)).toHaveLength(0)
  })
})

describe('minimizeTransfers', () => {
  it('simple: bob owes alice 100', () => {
    const balances = [
      { userId: 'alice', netTWD: 100 },
      { userId: 'bob', netTWD: -100 },
    ]
    const transfers = minimizeTransfers(balances)
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toEqual({ from: 'bob', to: 'alice', amountTWD: 100 })
  })

  it('3 people: 2 transfers', () => {
    const balances = [
      { userId: 'alice', netTWD: 200 },
      { userId: 'bob', netTWD: -100 },
      { userId: 'carol', netTWD: -100 },
    ]
    expect(minimizeTransfers(balances)).toHaveLength(2)
  })

  it('all zero: no transfers', () => {
    const balances = [
      { userId: 'alice', netTWD: 0 },
      { userId: 'bob', netTWD: 0 },
    ]
    expect(minimizeTransfers(balances)).toHaveLength(0)
  })
})
