type FlowNode = { id: string; name: string; amount: number }
type FlowTransfer = { from: string; to: string; fromName: string; toName: string; amountTWD: number }

type Props = {
  debtors: FlowNode[]
  creditors: FlowNode[]
  transfers: FlowTransfer[]
}

const W = 360
const NODE_W = 6
const LEFT_X = 84
const RIGHT_X = W - 84 - NODE_W
const GAP = 16
// Vertical breathing room so labels (drawn up to ~13px past a node's
// center) never clip at the viewBox edges when a node is thin.
const PAD = 16

const truncate = (name: string) => (name.length > 6 ? `${name.slice(0, 5)}…` : name)
const twd = (n: number) => `NT$${Math.round(n).toLocaleString('zh-TW')}`

type Placed = FlowNode & { y: number; h: number }

function placeColumn(nodes: FlowNode[], scale: number, height: number): Placed[] {
  const heights = nodes.map(n => Math.max(3, n.amount * scale))
  const used = heights.reduce((s, h) => s + h, 0) + GAP * (nodes.length - 1)
  let y = (height - used) / 2
  return nodes.map((n, i) => {
    const placed = { ...n, y, h: heights[i] }
    y += heights[i] + GAP
    return placed
  })
}

/**
 * Sankey-style flow diagram: debtors on the left, creditors on the
 * right, one ribbon per transfer with thickness proportional to amount.
 */
export function TransferFlow({ debtors, creditors, transfers }: Props) {
  const H = Math.max(150, 56 * Math.max(debtors.length, creditors.length))
  const sumDebt = debtors.reduce((s, n) => s + n.amount, 0)
  const sumCredit = creditors.reduce((s, n) => s + n.amount, 0)
  const scale = Math.min(
    (H - GAP * (debtors.length - 1)) / Math.max(sumDebt, 0.01),
    (H - GAP * (creditors.length - 1)) / Math.max(sumCredit, 0.01)
  )

  const left = placeColumn(debtors, scale, H)
  const right = placeColumn(creditors, scale, H)
  const leftMap = new Map(left.map(n => [n.id, n]))
  const rightMap = new Map(right.map(n => [n.id, n]))

  // Running offset inside each node as ribbons consume its height
  const offsets = new Map<string, number>()
  const ribbons = transfers.map(t => {
    const src = leftMap.get(t.from)!
    const dst = rightMap.get(t.to)!
    const h1 = Math.max(2.5, (t.amountTWD / src.amount) * src.h)
    const h2 = Math.max(2.5, (t.amountTWD / dst.amount) * dst.h)
    const y1 = src.y + (offsets.get(`L${t.from}`) ?? 0)
    const y2 = dst.y + (offsets.get(`R${t.to}`) ?? 0)
    offsets.set(`L${t.from}`, (offsets.get(`L${t.from}`) ?? 0) + h1)
    offsets.set(`R${t.to}`, (offsets.get(`R${t.to}`) ?? 0) + h2)

    const x1 = LEFT_X + NODE_W
    const x2 = RIGHT_X
    const xm = (x1 + x2) / 2
    const d = [
      `M ${x1} ${y1}`,
      `C ${xm} ${y1} ${xm} ${y2} ${x2} ${y2}`,
      `L ${x2} ${y2 + h2}`,
      `C ${xm} ${y2 + h2} ${xm} ${y1 + h1} ${x1} ${y1 + h1}`,
      'Z',
    ].join(' ')
    return { d, t }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H + PAD * 2}`} className="w-full" role="img" aria-label="轉帳流向圖">
      <defs>
        <linearGradient id="flow-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>

      <g transform={`translate(0 ${PAD})`}>
      {ribbons.map(({ d, t }, i) => (
        <path
          key={i}
          d={d}
          fill="url(#flow-grad)"
          opacity="0.45"
          className="anim-fade"
          style={{ animationDelay: `${300 + i * 150}ms` }}
        >
          <title>{`${t.fromName} → ${t.toName} ${twd(t.amountTWD)}`}</title>
        </path>
      ))}

      {left.map((n, i) => (
        <g key={n.id} className="anim-rise" style={{ animationDelay: `${i * 90}ms` }}>
          <rect x={LEFT_X} y={n.y} width={NODE_W} height={n.h} rx="2" className="fill-rose-400 dark:fill-rose-500" />
          <text x={LEFT_X - 8} y={n.y + n.h / 2 - 2} textAnchor="end" fontSize="11" fontWeight="600" className="fill-gray-800 dark:fill-gray-100">
            {truncate(n.name)}
          </text>
          <text x={LEFT_X - 8} y={n.y + n.h / 2 + 11} textAnchor="end" fontSize="9.5" className="fill-rose-500 dark:fill-rose-400" style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
            −{twd(n.amount)}
          </text>
        </g>
      ))}

      {right.map((n, i) => (
        <g key={n.id} className="anim-rise" style={{ animationDelay: `${i * 90}ms` }}>
          <rect x={RIGHT_X} y={n.y} width={NODE_W} height={n.h} rx="2" className="fill-emerald-400 dark:fill-emerald-500" />
          <text x={RIGHT_X + NODE_W + 8} y={n.y + n.h / 2 - 2} textAnchor="start" fontSize="11" fontWeight="600" className="fill-gray-800 dark:fill-gray-100">
            {truncate(n.name)}
          </text>
          <text x={RIGHT_X + NODE_W + 8} y={n.y + n.h / 2 + 11} textAnchor="start" fontSize="9.5" className="fill-emerald-600 dark:fill-emerald-400" style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
            +{twd(n.amount)}
          </text>
        </g>
      ))}
      </g>
    </svg>
  )
}
