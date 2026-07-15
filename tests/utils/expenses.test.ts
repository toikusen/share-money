import { describe, it, expect } from 'vitest'
import {
  validateExpenseInput,
  validateSettlementInput,
  isExpenseApproved,
  isExpenseRejected,
  approvedExpenseIds,
  approvalProgress,
  myInvolvement,
} from '@/lib/utils/expenses'
import type { ApprovalStatus } from '@/types/database'

const s = (...statuses: ApprovalStatus[]) => statuses.map(a => ({ approval_status: a }))

describe('expense approval helpers', () => {
  it('isExpenseApproved: true only when all splits approved', () => {
    expect(isExpenseApproved(s('approved', 'approved'))).toBe(true)
    expect(isExpenseApproved(s('approved', 'pending'))).toBe(false)
    expect(isExpenseApproved(s('approved', 'rejected'))).toBe(false)
    expect(isExpenseApproved([])).toBe(false)
  })

  it('isExpenseRejected: true when any split rejected', () => {
    expect(isExpenseRejected(s('approved', 'rejected'))).toBe(true)
    expect(isExpenseRejected(s('approved', 'pending'))).toBe(false)
  })

  it('approvedExpenseIds: keeps only fully-approved expenses', () => {
    const ids = approvedExpenseIds([
      { expense_id: 'e1', approval_status: 'approved' },
      { expense_id: 'e1', approval_status: 'approved' },
      { expense_id: 'e2', approval_status: 'approved' },
      { expense_id: 'e2', approval_status: 'pending' },
      { expense_id: 'e3', approval_status: 'rejected' },
    ])
    expect([...ids].sort()).toEqual(['e1'])
  })

  it('approvalProgress: counts approved over total', () => {
    expect(approvalProgress(s('approved', 'pending', 'approved'))).toEqual({ approved: 2, total: 3 })
  })
})

describe('validateExpenseInput', () => {
  const validInput = {
    title: '拉麵午餐',
    amount: 100,
    splits: [
      { user_id: 'a', amount: 50 },
      { user_id: 'b', amount: 50 },
    ],
  }

  it('returns null for valid input', () => {
    expect(validateExpenseInput(validInput)).toBeNull()
  })

  it('rejects empty title', () => {
    expect(validateExpenseInput({ ...validInput, title: '  ' })).toBe('請輸入費用名稱')
  })

  it('rejects zero or negative amount', () => {
    expect(validateExpenseInput({ ...validInput, amount: 0 })).toBe('金額必須大於 0')
    expect(validateExpenseInput({ ...validInput, amount: -10 })).toBe('金額必須大於 0')
  })

  it('rejects NaN amount', () => {
    expect(validateExpenseInput({ ...validInput, amount: NaN })).toBe('金額必須大於 0')
  })

  it('rejects empty splits', () => {
    expect(validateExpenseInput({ ...validInput, splits: [] })).toBe('請選擇分擔成員')
  })

  it('rejects split sum mismatch', () => {
    expect(
      validateExpenseInput({
        ...validInput,
        splits: [
          { user_id: 'a', amount: 50 },
          { user_id: 'b', amount: 40 },
        ],
      })
    ).toBe('分擔金額總和不等於費用金額')
  })

  it('allows sub-cent rounding tolerance in split sum', () => {
    expect(
      validateExpenseInput({
        ...validInput,
        amount: 10,
        splits: [
          { user_id: 'a', amount: 3.34 },
          { user_id: 'b', amount: 3.33 },
          { user_id: 'c', amount: 3.33 },
        ],
      })
    ).toBeNull()
  })
})

describe('validateSettlementInput', () => {
  const base = { amount: 500, currency: 'TWD' as const, fromUser: 'a', toUser: 'b' }

  it('accepts a valid input', () => {
    expect(validateSettlementInput(base)).toBeNull()
  })
  it('rejects non-positive and non-finite amounts', () => {
    expect(validateSettlementInput({ ...base, amount: 0 })).toBe('金額必須大於 0')
    expect(validateSettlementInput({ ...base, amount: -5 })).toBe('金額必須大於 0')
    expect(validateSettlementInput({ ...base, amount: NaN })).toBe('金額必須大於 0')
    expect(validateSettlementInput({ ...base, amount: Infinity })).toBe('金額必須大於 0')
  })
  it('rejects fractional amounts in zero-decimal currencies', () => {
    expect(validateSettlementInput({ ...base, currency: 'JPY', amount: 100.5 })).toBe('此幣別金額必須為整數')
    expect(validateSettlementInput({ ...base, currency: 'JPY', amount: 100 })).toBeNull()
  })
  it('rejects settling with yourself', () => {
    expect(validateSettlementInput({ ...base, toUser: 'a' })).toBe('不能還款給自己')
  })
})

describe('myInvolvement', () => {
  const exp = (paid_by: string, splits: Array<[string, number]>) => ({
    paid_by,
    expense_splits: splits.map(([user_id, amount]) => ({ user_id, amount })),
  })

  it('related when I paid, even with no split of mine', () => {
    expect(myInvolvement(exp('me', [['other', 300]]), 'me'))
      .toEqual({ related: true, paid: true, share: 0 })
  })
  it('related when I have a split but did not pay', () => {
    expect(myInvolvement(exp('other', [['me', 120], ['other', 180]]), 'me'))
      .toEqual({ related: true, paid: false, share: 120 })
  })
  it('paid and split both mine', () => {
    expect(myInvolvement(exp('me', [['me', 150], ['other', 150]]), 'me'))
      .toEqual({ related: true, paid: true, share: 150 })
  })
  it('unrelated when neither payer nor in splits', () => {
    expect(myInvolvement(exp('a', [['b', 100]]), 'me'))
      .toEqual({ related: false, paid: false, share: 0 })
  })
})
