import { describe, it, expect } from 'vitest'
import {
  validateExpenseInput,
  isExpenseApproved,
  isExpenseRejected,
  approvedExpenseIds,
  approvalProgress,
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
