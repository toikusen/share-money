import { describe, it, expect } from 'vitest'
import { validateExpenseInput } from '@/lib/utils/expenses'

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
