import { describe, expect, it } from 'vitest'
import {
  formatExpenseDate,
  formatExpenseDateTime,
  formatExpenseTime,
  groupByPaidDate,
} from '@/lib/utils/datetime'

// 2026-06-12 00:20 UTC = 08:20 in Taipei (+8) = 09:20 in Tokyo (+9)
const ISO = '2026-06-12T00:20:00.000Z'

describe('formatExpenseTime', () => {
  it('formats in the given time zone, not the server time zone', () => {
    expect(formatExpenseTime(ISO, 'Asia/Tokyo')).toBe('09:20')
    expect(formatExpenseTime(ISO, 'Asia/Taipei')).toBe('08:20')
  })

  it('defaults to Asia/Taipei when no time zone is given', () => {
    expect(formatExpenseTime(ISO)).toBe('08:20')
  })
})

describe('formatExpenseDateTime', () => {
  it('includes date and time in the given time zone', () => {
    expect(formatExpenseDateTime(ISO, 'Asia/Tokyo')).toContain('09:20')
    expect(formatExpenseDateTime(ISO, 'Asia/Tokyo')).toContain('2026')
  })
})

describe('formatExpenseDate', () => {
  it('rolls the date according to the time zone', () => {
    // 2026-06-11 23:30 in Tokyo is still 06-11; in UTC it is 14:30 same day
    const lateNight = '2026-06-11T14:30:00.000Z'
    expect(formatExpenseDate(lateNight, 'Asia/Tokyo')).toContain('11')
    const pastMidnight = '2026-06-11T16:30:00.000Z' // 01:30 on 06-12 in Tokyo
    expect(formatExpenseDate(pastMidnight, 'Asia/Tokyo')).toContain('12')
  })
})

describe('groupByPaidDate', () => {
  it('groups consecutive rows of the same local day', () => {
    const rows = [
      { id: 'a', paid_at: '2026-06-12T01:00:00.000Z' }, // 06-12 10:00 Tokyo
      { id: 'b', paid_at: '2026-06-11T16:30:00.000Z' }, // 06-12 01:30 Tokyo
      { id: 'c', paid_at: '2026-06-11T10:00:00.000Z' }, // 06-11 19:00 Tokyo
    ]
    const groups = groupByPaidDate(rows, 'Asia/Tokyo')
    expect(groups).toHaveLength(2)
    expect(groups[0].items.map(r => r.id)).toEqual(['a', 'b'])
    expect(groups[1].items.map(r => r.id)).toEqual(['c'])
  })

  it('splits the same rows differently in another time zone', () => {
    const rows = [
      { id: 'a', paid_at: '2026-06-12T01:00:00.000Z' }, // 06-12 09:00 Taipei
      { id: 'b', paid_at: '2026-06-11T16:30:00.000Z' }, // 06-12 00:30 Taipei
      { id: 'c', paid_at: '2026-06-11T15:30:00.000Z' }, // 06-11 23:30 Taipei
    ]
    const groups = groupByPaidDate(rows, 'Asia/Taipei')
    expect(groups).toHaveLength(2)
    expect(groups[0].items.map(r => r.id)).toEqual(['a', 'b'])
    expect(groups[1].items.map(r => r.id)).toEqual(['c'])
  })

  it('returns an empty array for no rows', () => {
    expect(groupByPaidDate([], 'Asia/Taipei')).toEqual([])
  })
})
