import { describe, it, expect } from 'vitest'
import { convertToTWD, formatAmount, splitEqually, isEqualSplit, splitWithRemainder } from '@/lib/utils/currency'

describe('convertToTWD', () => {
  it('TWD amount returns unchanged', () => {
    expect(convertToTWD(1000, 'TWD', 0.218)).toBe(1000)
  })
  it('JPY converts using rate, rounded to 2dp', () => {
    expect(convertToTWD(1000, 'JPY', 0.218)).toBe(218)
    expect(convertToTWD(1, 'JPY', 0.218)).toBe(0.22)
  })
})

describe('formatAmount', () => {
  it('JPY: integer with ¥ prefix', () => {
    expect(formatAmount(1000, 'JPY')).toBe('¥1,000')
  })
  it('TWD: 2 decimal with NT$ prefix', () => {
    expect(formatAmount(100.5, 'TWD')).toBe('NT$100.50')
  })
})

describe('splitEqually', () => {
  it('JPY: remainder goes to first member', () => {
    expect(splitEqually(10, 3, 'JPY')).toEqual([4, 3, 3])
  })
  it('JPY: even split', () => {
    expect(splitEqually(9, 3, 'JPY')).toEqual([3, 3, 3])
  })
  it('TWD: sum equals total', () => {
    const result = splitEqually(10, 3, 'TWD')
    const sum = result.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100)).toBe(1000)
    expect(result).toHaveLength(3)
  })
  it('returns [] for count 0', () => {
    expect(splitEqually(100, 0, 'JPY')).toEqual([])
  })
})

describe('isEqualSplit', () => {
  it('matches an even JPY split', () => {
    expect(isEqualSplit(9, 'JPY', [3, 3, 3])).toBe(true)
  })
  it('matches a JPY split with remainder regardless of order', () => {
    expect(isEqualSplit(10, 'JPY', [3, 4, 3])).toBe(true)
  })
  it('rejects a custom split', () => {
    expect(isEqualSplit(10, 'JPY', [8, 1, 1])).toBe(false)
  })
  it('matches a TWD equal split', () => {
    expect(isEqualSplit(10, 'TWD', splitEqually(10, 3, 'TWD'))).toBe(true)
  })
  it('returns false for empty amounts', () => {
    expect(isEqualSplit(10, 'JPY', [])).toBe(false)
  })
})

describe('splitWithRemainder', () => {
  it('gives custom members their amount and splits the rest equally', () => {
    const result = splitWithRemainder(6000, 'JPY', [
      { id: 'a', custom: 3000 },
      { id: 'b', custom: null },
      { id: 'c', custom: null },
    ])
    expect(result.splits).toEqual([
      { user_id: 'a', amount: 3000 },
      { user_id: 'b', amount: 1500 },
      { user_id: 'c', amount: 1500 },
    ])
    expect(result.customSum).toBe(3000)
    expect(result.remaining).toBe(3000)
    expect(result.autoCount).toBe(2)
    expect(result.valid).toBe(true)
  })

  it('applies JPY rounding remainder to the first auto member', () => {
    const result = splitWithRemainder(1000, 'JPY', [
      { id: 'a', custom: 100 },
      { id: 'b', custom: null },
      { id: 'c', custom: null },
      { id: 'd', custom: null },
    ])
    const amounts = result.splits.map(s => s.amount)
    expect(amounts[0]).toBe(100)
    expect(amounts.slice(1).reduce((s, n) => s + n, 0)).toBe(900)
    expect(amounts.slice(1)).toEqual([300, 300, 300])
  })

  it('handles TWD decimals', () => {
    const result = splitWithRemainder(100, 'TWD', [
      { id: 'a', custom: 33.5 },
      { id: 'b', custom: null },
      { id: 'c', custom: null },
    ])
    const total = result.splits.reduce((s, sp) => s + sp.amount, 0)
    expect(Math.round(total * 100) / 100).toBe(100)
    expect(result.valid).toBe(true)
  })

  it('is invalid when custom amounts exceed the total', () => {
    const result = splitWithRemainder(1000, 'JPY', [
      { id: 'a', custom: 1200 },
      { id: 'b', custom: null },
    ])
    expect(result.valid).toBe(false)
    expect(result.remaining).toBe(-200)
  })

  it('acts as a plain custom split when nobody is auto', () => {
    const exact = splitWithRemainder(1000, 'JPY', [
      { id: 'a', custom: 600 },
      { id: 'b', custom: 400 },
    ])
    expect(exact.valid).toBe(true)

    const mismatch = splitWithRemainder(1000, 'JPY', [
      { id: 'a', custom: 600 },
      { id: 'b', custom: 300 },
    ])
    expect(mismatch.valid).toBe(false)
  })

  it('gives auto members zero when custom amounts consume the total', () => {
    const result = splitWithRemainder(1000, 'JPY', [
      { id: 'a', custom: 1000 },
      { id: 'b', custom: null },
    ])
    expect(result.splits[1].amount).toBe(0)
    expect(result.valid).toBe(true)
  })
})
