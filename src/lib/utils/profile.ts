export const DISPLAY_NAME_MAX_LENGTH = 50

export type DisplayNameValidation =
  | { ok: true; value: string }
  | { ok: false; error: string }

/**
 * Validates a user-supplied display name.
 * Returns the trimmed name on success, or a user-facing error message.
 */
export function validateDisplayName(input: unknown): DisplayNameValidation {
  if (typeof input !== 'string') return { ok: false, error: '名稱不能為空' }

  const trimmed = input.trim()
  if (trimmed.length === 0) return { ok: false, error: '名稱不能為空' }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: `名稱不能超過 ${DISPLAY_NAME_MAX_LENGTH} 個字` }
  }

  return { ok: true, value: trimmed }
}
