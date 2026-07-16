// src/lib/utils/ledger-type.ts
// Single source of truth for ledger types: label, colors, and form defaults.
// Types only affect display and create-form defaults — never math.
// NOTE: no lucide-react here — this module is imported by 'use server' actions,
// and pulling the icon barrel into the server-action graph hangs the dev build.
// Icon components live in components/trips/LedgerTypeIcon.tsx.
import type { LedgerType } from '@/types/database'

export type DateMode = 'single' | 'range' | 'none'

export type LedgerTypeMeta = {
  value: LedgerType
  label: string
  /** icon box background / foreground */
  bg: string
  fg: string
  /** create-form defaults (user can override) */
  dateMode: DateMode
  defaultForeign: boolean
  placeholder: string
}

export const LEDGER_TYPES: readonly LedgerTypeMeta[] = [
  { value: 'travel', label: '旅遊', bg: 'oklch(0.94 0.03 255)', fg: 'oklch(0.46 0.11 255)', dateMode: 'range', defaultForeign: true, placeholder: '東京五日遊' },
  { value: 'club', label: '社團活動', bg: 'oklch(0.94 0.03 155)', fg: 'oklch(0.46 0.09 155)', dateMode: 'single', defaultForeign: false, placeholder: '攝影社迎新' },
  { value: 'company', label: '公司活動', bg: 'oklch(0.94 0.03 290)', fg: 'oklch(0.46 0.10 290)', dateMode: 'single', defaultForeign: false, placeholder: 'Q3 部門聚餐' },
  { value: 'dining', label: '聚餐', bg: 'oklch(0.94 0.03 60)', fg: 'oklch(0.50 0.10 60)', dateMode: 'single', defaultForeign: false, placeholder: '週五聚餐' },
  { value: 'household', label: '日常/合租', bg: 'oklch(0.94 0.03 200)', fg: 'oklch(0.46 0.08 200)', dateMode: 'none', defaultForeign: false, placeholder: '室友公費' },
  { value: 'other', label: '其他', bg: '#F0F0F2', fg: '#6B6E75', dateMode: 'none', defaultForeign: false, placeholder: '新帳本' },
]

export const LEDGER_TYPE_VALUES = LEDGER_TYPES.map(t => t.value)

/** Unknown values fall back to 'other' so old/bad data still renders. */
export function ledgerTypeMeta(type: string): LedgerTypeMeta {
  return LEDGER_TYPES.find(t => t.value === type) ?? LEDGER_TYPES[LEDGER_TYPES.length - 1]
}
