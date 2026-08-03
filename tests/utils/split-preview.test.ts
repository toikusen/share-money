import { describe, expect, it } from 'vitest'
import { previewEqualSplit } from '@/lib/utils/split-preview'

const settleAll = (payers: { name: string; paid: number }[]) => {
  const { nets, transfers } = previewEqualSplit(payers)
  const after = [...nets]
  for (const t of transfers) {
    after[Number(t.from)] += t.amountTWD
    after[Number(t.to)] -= t.amountTWD
  }
  return after
}

describe('previewEqualSplit', () => {
  it('spreads an indivisible total without losing a dollar', () => {
    const { shares } = previewEqualSplit([
      { name: 'A', paid: 100 },
      { name: 'B', paid: 0 },
      { name: 'C', paid: 0 },
    ])
    expect(shares).toEqual([34, 33, 33])
    expect(shares.reduce((a, b) => a + b)).toBe(100)
  })

  it('leaves everyone at zero once the transfers are made', () => {
    expect(settleAll([
      { name: '小明', paid: 3000 },
      { name: '小華', paid: 1200 },
      { name: '小美', paid: 300 },
    ])).toEqual([0, 0, 0])
  })

  it('needs no transfers when everyone already paid the same', () => {
    const { transfers } = previewEqualSplit([
      { name: 'A', paid: 500 },
      { name: 'B', paid: 500 },
    ])
    expect(transfers).toEqual([])
  })

  it('settles a group where several people are owed money', () => {
    expect(settleAll([
      { name: 'A', paid: 900 },
      { name: 'B', paid: 700 },
      { name: 'C', paid: 0 },
      { name: 'D', paid: 0 },
    ])).toEqual([0, 0, 0, 0])
  })
})
