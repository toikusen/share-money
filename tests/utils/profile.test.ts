import { describe, expect, it } from 'vitest'
import { validateDisplayName, DISPLAY_NAME_MAX_LENGTH } from '@/lib/utils/profile'

describe('validateDisplayName', () => {
  it('returns trimmed name for valid input', () => {
    expect(validateDisplayName('  小明  ')).toEqual({ ok: true, value: '小明' })
  })

  it('accepts a name at the max length', () => {
    const name = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH)
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name })
  })

  it('rejects empty input', () => {
    expect(validateDisplayName('')).toEqual({ ok: false, error: '名稱不能為空' })
  })

  it('rejects whitespace-only input', () => {
    expect(validateDisplayName('   ')).toEqual({ ok: false, error: '名稱不能為空' })
  })

  it('rejects names longer than the max length', () => {
    const name = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)
    expect(validateDisplayName(name)).toEqual({
      ok: false,
      error: `名稱不能超過 ${DISPLAY_NAME_MAX_LENGTH} 個字`,
    })
  })

  it('rejects non-string input', () => {
    expect(validateDisplayName(null)).toEqual({ ok: false, error: '名稱不能為空' })
    expect(validateDisplayName(undefined)).toEqual({ ok: false, error: '名稱不能為空' })
  })
})
