type Row = { name: string; paidTWD: number; owedTWD: number }

const twd = (n: number) => `NT$${Math.round(n).toLocaleString('zh-TW')}`

/**
 * Horizontal paired bars: how much each member paid up-front (solid)
 * versus their share of the costs (striped outline).
 */
export function PaidShareChart({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.flatMap(r => [r.paidTWD, r.owedTWD]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-indigo-500" />
          墊付
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px] border border-indigo-300 bg-[repeating-linear-gradient(135deg,rgba(99,102,241,0.35)_0_2px,transparent_2px_4px)]" />
          應分擔
        </span>
      </div>

      {rows.map((r, i) => (
        <div key={r.name} className="anim-rise" style={{ animationDelay: `${i * 90}ms` }}>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.name}</span>
            <span className="font-mono tabular-nums text-[11px] text-gray-500 dark:text-gray-400">
              {twd(r.paidTWD)} <span className="text-gray-300 dark:text-gray-600">/</span> {twd(r.owedTWD)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 anim-grow-l"
                style={{ width: `${(r.paidTWD / max) * 100}%`, animationDelay: `${150 + i * 90}ms` }}
              />
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full border border-indigo-300 dark:border-indigo-500/50 bg-[repeating-linear-gradient(135deg,rgba(99,102,241,0.35)_0_3px,transparent_3px_6px)] anim-grow-l"
                style={{ width: `${(r.owedTWD / max) * 100}%`, animationDelay: `${220 + i * 90}ms` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
