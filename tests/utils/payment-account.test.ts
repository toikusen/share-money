import { describe, expect, it } from 'vitest'
import {
  validatePaymentAccount,
  maskAccountNumber,
  ACCOUNT_HOLDER_MAX_LENGTH,
} from '@/lib/utils/payment-account'
import { BANKS, bankName, bankLabel } from '@/lib/utils/banks'

const valid = { bankCode: '808', accountNumber: '1234567890123', accountHolder: '王小明' }

describe('validatePaymentAccount', () => {
  it('accepts a valid account', () => {
    expect(validatePaymentAccount(valid)).toEqual({
      ok: true,
      value: { bank_code: '808', account_number: '1234567890123', account_holder: '王小明' },
    })
  })

  it('strips spaces and dashes from the account number', () => {
    expect(validatePaymentAccount({ ...valid, accountNumber: '1234-5678 90' })).toEqual({
      ok: true,
      value: { bank_code: '808', account_number: '1234567890', account_holder: '王小明' },
    })
  })

  it('normalizes blank holder to null', () => {
    const res = validatePaymentAccount({ ...valid, accountHolder: '  ' })
    expect(res).toEqual({ ok: true, value: expect.objectContaining({ account_holder: null }) })
  })

  it('rejects a bank code outside the known list', () => {
    expect(validatePaymentAccount({ ...valid, bankCode: '999' })).toEqual({
      ok: false, error: '請選擇銀行',
    })
    expect(validatePaymentAccount({ ...valid, bankCode: 42 })).toEqual({
      ok: false, error: '請選擇銀行',
    })
  })

  it('rejects account numbers that are too short, too long, or non-numeric', () => {
    for (const bad of ['12345', '1'.repeat(17), '12345abc', '']) {
      expect(validatePaymentAccount({ ...valid, accountNumber: bad }).ok).toBe(false)
    }
  })

  it('rejects an over-long holder name', () => {
    const res = validatePaymentAccount({
      ...valid,
      accountHolder: '王'.repeat(ACCOUNT_HOLDER_MAX_LENGTH + 1),
    })
    expect(res.ok).toBe(false)
  })
})

describe('maskAccountNumber', () => {
  it('shows only the last five digits', () => {
    expect(maskAccountNumber('1234567890123')).toBe('•••••90123')
  })
})

describe('banks', () => {
  it('bank codes are unique three-digit strings', () => {
    const codes = BANKS.map(b => b.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[0-9]{3}$/)
  })

  it('maps a known code and falls back for unknown ones', () => {
    expect(bankName('808')).toBe('玉山銀行')
    expect(bankLabel('812')).toBe('台新銀行 (812)')
    expect(bankName('000')).toBe('銀行代碼 000')
  })
})
