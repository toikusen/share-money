import { describe, it, expect } from 'vitest'
import { LEDGER_TYPES, LEDGER_TYPE_VALUES, ledgerTypeMeta } from '@/lib/utils/ledger-type'

describe('LEDGER_TYPES', () => {
  it('covers the six DB enum values in display order', () => {
    expect(LEDGER_TYPE_VALUES).toEqual(['travel', 'club', 'company', 'dining', 'household', 'other'])
  })

  it('only travel defaults to foreign currency', () => {
    expect(LEDGER_TYPES.filter(t => t.defaultForeign).map(t => t.value)).toEqual(['travel'])
  })

  it('date mode defaults follow the spec table', () => {
    const modes = Object.fromEntries(LEDGER_TYPES.map(t => [t.value, t.dateMode]))
    expect(modes).toEqual({
      travel: 'range',
      club: 'single',
      company: 'single',
      dining: 'single',
      household: 'none',
      other: 'none',
    })
  })
})

describe('ledgerTypeMeta', () => {
  it('looks up a known type', () => {
    expect(ledgerTypeMeta('dining').label).toBe('聚餐')
  })

  it('falls back to other for unknown values', () => {
    expect(ledgerTypeMeta('nonsense').value).toBe('other')
  })
})
