import { describe, it, expect } from 'vitest'
import { resolveBankCode } from '@/lib/utils/banks'

describe('resolveBankCode', () => {
  it('resolves the exact datalist value', () => {
    expect(resolveBankCode('004 臺灣銀行')).toBe('004')
  })

  it('resolves a bare code', () => {
    expect(resolveBankCode('700')).toBe('700')
  })

  it('resolves a unique name fragment', () => {
    expect(resolveBankCode('郵政')).toBe('700')
  })

  it('folds 台/臺 so both spellings match', () => {
    expect(resolveBankCode('台灣銀行')).toBe('004')
  })

  it('returns null on ambiguous or unknown input', () => {
    expect(resolveBankCode('銀行')).toBeNull()
    expect(resolveBankCode('999')).toBeNull()
    expect(resolveBankCode('')).toBeNull()
  })
})
