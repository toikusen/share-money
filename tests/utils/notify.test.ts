import { describe, it, expect } from 'vitest'
import {
  pendingRecipients,
  approvalNeededPayload,
  rejectedPayload,
  approvedPayload,
} from '@/lib/notify'

describe('pendingRecipients', () => {
  it('excludes the creator and dedupes', () => {
    const splits = [{ user_id: 'me' }, { user_id: 'a' }, { user_id: 'b' }, { user_id: 'a' }]
    expect(pendingRecipients(splits, 'me').sort()).toEqual(['a', 'b'])
  })
  it('returns empty when only the creator splits', () => {
    expect(pendingRecipients([{ user_id: 'me' }], 'me')).toEqual([])
  })
})

describe('payload builders', () => {
  it('approvalNeeded points to /review', () => {
    const p = approvalNeededPayload('拉麵')
    expect(p.url).toBe('/review')
    expect(p.body).toContain('拉麵')
  })
  it('rejected/approved point to the trip and stay internal paths', () => {
    expect(rejectedPayload('拉麵', 't1').url).toBe('/trips/t1')
    expect(approvedPayload('拉麵', 't1').url).toBe('/trips/t1')
    expect(rejectedPayload('拉麵', 't1').url.startsWith('/')).toBe(true)
  })
})
