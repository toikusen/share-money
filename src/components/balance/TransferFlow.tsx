'use client'

import { useState } from 'react'

type FlowTransfer = { from: string; to: string; fromName: string; toName: string; amountTWD: number }

type Props = {
  transfers: FlowTransfer[]
  currentUserId: string
  /** 成員超過 5 人時預設只顯示與我相關的流向 */
  memberCount: number
}

const VB_W = 340
const PILL_W = 96
const PILL_H = 32
const ROW_H = 54
const LEFT_X = 8
const RIGHT_X = VB_W - PILL_W - 8

const truncate = (name: string) => (name.length > 5 ? `${name.slice(0, 4)}…` : name)

/**
 * 轉帳流向圖:左紅膠囊=該付、右綠膠囊=該收,
 * 弧線粗細與金額成正比。「與我相關」模式只畫經過你的線,
 * 其餘收成一行註記 — 任何人數都看得懂。
 */
export function TransferFlow({ transfers, currentUserId, memberCount }: Props) {
  const [mode, setMode] = useState<'all' | 'mine'>(memberCount > 5 ? 'mine' : 'all')

  const edges = mode === 'mine'
    ? transfers.filter(t => t.from === currentUserId || t.to === currentUserId)
    : transfers
  const hidden = transfers.length - edges.length

  // 節點:同側同人合併金額,金額大的排上面
  const nameOf = new Map<string, string>()
  transfers.forEach(t => { nameOf.set(t.from, t.fromName); nameOf.set(t.to, t.toName) })
  const sumBy = (key: 'from' | 'to') => {
    const map = new Map<string, number>()
    edges.forEach(e => map.set(e[key], (map.get(e[key]) ?? 0) + e.amountTWD))
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([id, amount]) => ({ id, amount }))
  }
  const lefts = sumBy('from')
  const rights = sumBy('to')
  const rows = Math.max(lefts.length, rights.length)
  const H = 12 + rows * ROW_H
  const yCenter = (idx: number) => 10 + idx * ROW_H + PILL_H / 2
  const leftIdx = new Map(lefts.map((n, i) => [n.id, i]))
  const rightIdx = new Map(rights.map((n, i) => [n.id, i]))

  // 同一節點有多條線時,端點沿節點高度錯開
  const lCnt: Record<string, number> = {}
  const rCnt: Record<string, number> = {}
  edges.forEach(e => {
    lCnt[e.from] = (lCnt[e.from] ?? 0) + 1
    rCnt[e.to] = (rCnt[e.to] ?? 0) + 1
  })
  const lSeen: Record<string, number> = {}
  const rSeen: Record<string, number> = {}
  const maxAmt = Math.max(...edges.map(e => e.amountTWD), 1)

  const label = (id: string) =>
    id === currentUserId ? '你' : truncate(nameOf.get(id) ?? '?')

  return (
    <div className="bg-white rounded-2xl shadow-card px-3 pt-3 pb-1">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[11px] font-semibold text-owe">該付的人</span>
        <div className="flex bg-fill rounded-[7px] p-0.5 gap-0.5" role="tablist" aria-label="流向圖範圍">
          {(['all', 'mine'] as const).map(m => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`text-[10.5px] font-semibold rounded-[5px] px-2.5 py-[3px] transition-all ${
                mode === m ? 'bg-white text-ink shadow-card' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {m === 'all' ? '全部' : '與我相關'}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-semibold text-gain">該收的人</span>
      </div>

      {edges.length === 0 ? (
        <p className="text-center text-sm text-ink-4 py-6">沒有與你相關的轉帳</p>
      ) : (
        <svg
          viewBox={`0 0 ${VB_W} ${H}`}
          className="w-full block"
          role="img"
          aria-label="轉帳流向圖"
        >
          {edges.map((e, i) => {
            const ls = (lSeen[e.from] = (lSeen[e.from] ?? 0) + 1) - 1
            const rs = (rSeen[e.to] = (rSeen[e.to] ?? 0) + 1) - 1
            const y1 = yCenter(leftIdx.get(e.from)!) + (ls - (lCnt[e.from] - 1) / 2) * 9
            const y2 = yCenter(rightIdx.get(e.to)!) + (rs - (rCnt[e.to] - 1) / 2) * 9
            const x1 = LEFT_X + PILL_W
            const x2 = RIGHT_X
            const xm = (x1 + x2) / 2
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${xm} ${y1}, ${xm} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="oklch(0.72 0.07 255)"
                strokeOpacity="0.5"
                strokeWidth={2.5 + (e.amountTWD / maxAmt) * 10}
                strokeLinecap="round"
                pathLength={1}
                className="anim-flow-draw"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <title>{`${e.fromName} → ${e.toName} NT$${Math.round(e.amountTWD).toLocaleString('zh-TW')}`}</title>
              </path>
            )
          })}

          {lefts.map((n, i) => (
            <g key={`l-${n.id}`}>
              <rect x={LEFT_X} y={10 + i * ROW_H} width={PILL_W} height={PILL_H} rx={PILL_H / 2} fill="oklch(0.97 0.015 25)" />
              <text
                x={LEFT_X + PILL_W / 2}
                y={10 + i * ROW_H + 20}
                textAnchor="middle"
                fontSize="11.5"
                fontWeight={n.id === currentUserId ? 700 : 600}
                fill="oklch(0.45 0.14 25)"
              >
                {label(n.id)} {Math.round(n.amount).toLocaleString('zh-TW')}
              </text>
            </g>
          ))}

          {rights.map((n, i) => (
            <g key={`r-${n.id}`}>
              <rect x={RIGHT_X} y={10 + i * ROW_H} width={PILL_W} height={PILL_H} rx={PILL_H / 2} fill="oklch(0.96 0.02 155)" />
              <text
                x={RIGHT_X + PILL_W / 2}
                y={10 + i * ROW_H + 20}
                textAnchor="middle"
                fontSize="11.5"
                fontWeight={n.id === currentUserId ? 700 : 600}
                fill="oklch(0.42 0.1 155)"
              >
                {label(n.id)} {Math.round(n.amount).toLocaleString('zh-TW')}
              </text>
            </g>
          ))}
        </svg>
      )}

      {mode === 'mine' && hidden > 0 && (
        <p className="text-[11px] text-ink-4 px-1 py-1.5">
          已隱藏 {hidden} 筆與你無關的轉帳，完整清單在下方
        </p>
      )}
    </div>
  )
}
