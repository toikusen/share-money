import { Plane, Users, Briefcase, Utensils, Home, Receipt, type LucideIcon } from 'lucide-react'
import { ledgerTypeMeta } from '@/lib/utils/ledger-type'
import type { LedgerType } from '@/types/database'

// Icons stay here (not in ledger-type.ts) so server actions never import lucide.
const ICONS: Record<LedgerType, LucideIcon> = {
  travel: Plane,
  club: Users,
  company: Briefcase,
  dining: Utensils,
  household: Home,
  other: Receipt,
}

/** Rounded icon tile for a ledger type. Sizes: list card 38, detail header 42, form grid 30. */
export function LedgerTypeIcon({ type, size }: { type: string; size: number }) {
  const meta = ledgerTypeMeta(type)
  const Icon = ICONS[meta.value]
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: size * 0.28, background: meta.bg, color: meta.fg }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2} absoluteStrokeWidth />
    </span>
  )
}
