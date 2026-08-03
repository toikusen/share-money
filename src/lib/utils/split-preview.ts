import { minimizeTransfers, type Transfer } from './balance'

export type Payer = { name: string; paid: number }
export type SplitPreview = {
  total: number
  shares: number[]
  nets: number[]
  transfers: Transfer[]
}

/**
 * Equal-split preview for the public calculator: everyone owes the same share
 * of the total, and the remainder from an indivisible total lands on the first
 * members — the same rule the app applies, so 100 across 3 people is 34/33/33
 * and the shares always add back up to the total.
 *
 * ponytail: equal split only. Custom per-person amounts stay in the signed-in
 * app; add them here if the public page needs to stand alone.
 */
export function previewEqualSplit(payers: Payer[]): SplitPreview {
  const total = payers.reduce((sum, p) => sum + p.paid, 0)
  const base = Math.floor(total / payers.length)
  const remainder = total - base * payers.length

  const shares = payers.map((_, i) => base + (i < remainder ? 1 : 0))
  const nets = payers.map((p, i) => p.paid - shares[i])

  return {
    total,
    shares,
    nets,
    transfers: minimizeTransfers(nets.map((netTWD, i) => ({ userId: String(i), netTWD }))),
  }
}
