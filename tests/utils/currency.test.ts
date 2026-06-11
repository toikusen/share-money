import { describe, it, expect } from 'vitest'
import { convertToTWD, formatAmount, splitEqually } from '@/lib/utils/currency'

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
