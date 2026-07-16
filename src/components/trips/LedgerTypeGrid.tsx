'use client'

import { LEDGER_TYPES } from '@/lib/utils/ledger-type'
import { LedgerTypeIcon } from '@/components/trips/LedgerTypeIcon'
import type { LedgerType } from '@/types/database'

/** 3×2 type selector shared by the create and edit trip forms. */
export function LedgerTypeGrid({ value, onChange }: { value: LedgerType; onChange: (next: LedgerType) => void }) {
  return (
    <div role="radiogroup" aria-label="帳本類型" className="grid grid-cols-3 gap-2">
      {LEDGER_TYPES.map(t => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t.value)}
            className={`flex flex-col items-center gap-1.5 rounded-xl py-3 px-1 text-xs transition-all ${
              selected ? 'font-bold text-ink shadow-card' : 'font-medium text-ink-2'
            }`}
            style={{ border: `1.5px solid ${selected ? t.fg : 'var(--color-edge)'}` }}
          >
            <LedgerTypeIcon type={t.value} size={30} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
