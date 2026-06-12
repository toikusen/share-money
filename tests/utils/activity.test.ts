import { describe, it, expect } from 'vitest'
import { formatActivityText } from '@/lib/utils/activity'
import type { ActivityEvent } from '@/types/database'

const names: Record<string, string> = { u1: '小明', u2: '小華' }
const nameOf = (id: string) => names[id] ?? '未知成員'

function fmt(event: ActivityEvent, actor = '小明') {
  return formatActivityText(event, actor, nameOf)
}

describe('formatActivityText', () => {
  it('trip.created', () => {
    expect(fmt({ action: 'trip.created', details: {} })).toBe('小明 建立了行程')
  })

  it('member.joined', () => {
    expect(fmt({ action: 'member.joined', details: {} }, '小美')).toBe('小美 加入了行程')
  })

  it('trip.rate_updated', () => {
    expect(fmt({ action: 'trip.rate_updated', details: { old_rate: 0.218, new_rate: 0.22 } }))
      .toBe('小明 將匯率從 0.218 改為 0.22')
  })

  it('expense.created formats JPY amount', () => {
    expect(fmt({ action: 'expense.created', details: { title: '晚餐', amount: 1500, currency: 'JPY' } }))
      .toBe('小明 新增了『晚餐』 ¥1,500')
  })

  it('expense.deleted formats TWD amount', () => {
    expect(fmt({ action: 'expense.deleted', details: { title: '車票', amount: 120, currency: 'TWD' } }))
      .toBe('小明 刪除了『車票』 NT$120.00')
  })

  describe('expense.updated', () => {
    it('amount change (currency always included alongside amount)', () => {
      expect(fmt({
        action: 'expense.updated',
        details: {
          title: '晚餐',
          old: { amount: 1200, currency: 'JPY' },
          new: { amount: 1500, currency: 'JPY' },
        },
      }, '小華')).toBe('小華 編輯了『晚餐』：金額從 ¥1,200 改為 ¥1,500')
    })

    it('title change', () => {
      expect(fmt({
        action: 'expense.updated',
        details: { title: '晚餐', old: { title: '晚飯' }, new: { title: '晚餐' } },
      })).toBe('小明 編輯了『晚餐』：名稱從『晚飯』改為『晚餐』')
    })

    it('paid_by change resolves member names', () => {
      expect(fmt({
        action: 'expense.updated',
        details: { title: '晚餐', old: { paid_by: 'u1' }, new: { paid_by: 'u2' } },
      })).toBe('小明 編輯了『晚餐』：付款人從 小明 改為 小華')
    })

    it('paid_at change uses expense datetime formatting', () => {
      expect(fmt({
        action: 'expense.updated',
        details: {
          title: '晚餐',
          old: { paid_at: '2026-06-10T10:00:00+00:00' },
          new: { paid_at: '2026-06-11T11:30:00+00:00' },
        },
      })).toBe('小明 編輯了『晚餐』：付款時間從 2026/06/10 18:00 改為 2026/06/11 19:30')
    })

    it('splits change renders a generic message', () => {
      expect(fmt({
        action: 'expense.updated',
        details: {
          title: '晚餐',
          old: { splits: [{ user_id: 'u1', amount: 1500 }] },
          new: { splits: [{ user_id: 'u1', amount: 750 }, { user_id: 'u2', amount: 750 }] },
        },
      })).toBe('小明 編輯了『晚餐』：調整了分擔方式')
    })

    it('multiple changes joined with 、', () => {
      expect(fmt({
        action: 'expense.updated',
        details: {
          title: '晚餐',
          old: { amount: 1200, currency: 'JPY', splits: [{ user_id: 'u1', amount: 1200 }] },
          new: { amount: 1500, currency: 'JPY', splits: [{ user_id: 'u2', amount: 1500 }] },
        },
      })).toBe('小明 編輯了『晚餐』：金額從 ¥1,200 改為 ¥1,500、調整了分擔方式')
    })
  })
})
