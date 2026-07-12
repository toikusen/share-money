import { BANKS } from './banks'

export const ACCOUNT_HOLDER_MAX_LENGTH = 30

export type PaymentAccountInput = {
  bank_code: string
  account_number: string
  account_holder: string | null
}

export type PaymentAccountValidation =
  | { ok: true; value: PaymentAccountInput }
  | { ok: false; error: string }

const validCodes = new Set(BANKS.map(b => b.code))

/**
 * Validates user-supplied payment account fields (mirrors the DB CHECKs,
 * plus bank_code must be in the known list since the UI is a select).
 */
export function validatePaymentAccount(input: {
  bankCode: unknown
  accountNumber: unknown
  accountHolder: unknown
}): PaymentAccountValidation {
  if (typeof input.bankCode !== 'string' || !validCodes.has(input.bankCode)) {
    return { ok: false, error: '請選擇銀行' }
  }

  if (typeof input.accountNumber !== 'string') return { ok: false, error: '請輸入帳號' }
  const number = input.accountNumber.replace(/[\s-]/g, '')
  if (!/^[0-9]{6,16}$/.test(number)) {
    return { ok: false, error: '帳號需為 6–16 位數字' }
  }

  let holder: string | null = null
  if (typeof input.accountHolder === 'string' && input.accountHolder.trim() !== '') {
    holder = input.accountHolder.trim()
    if (holder.length > ACCOUNT_HOLDER_MAX_LENGTH) {
      return { ok: false, error: `戶名不能超過 ${ACCOUNT_HOLDER_MAX_LENGTH} 個字` }
    }
  }

  return { ok: true, value: { bank_code: input.bankCode, account_number: number, account_holder: holder } }
}

/** 一般畫面只露末五碼:•••••12345 */
export function maskAccountNumber(accountNumber: string): string {
  return `•••••${accountNumber.slice(-5)}`
}
