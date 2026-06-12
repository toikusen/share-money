type Row = { name: string; netTWD: number }

const twd = (n: number) => `NT$${Math.round(Math.abs(n)).toLocaleString('zh-TW')}`

/**
 * Diverging bar chart around a centre axis: members who should receive
 * money grow right (emerald), members who should pay grow left (rose).
 */
export function NetChart({ rows }: { rows: Row[] }) {
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.netTWD)))

  return (
    <div>
      <div className="flex justify-between text-[11px] text-gray-400 dark:text-gray-500 mb-2 px-0.5">
        <span>← 應付</span>
        <span>應收 →</span>
      </div>

      <div className="relative flex flex-col gap-2.5">
        {/* centre axis */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300 dark:bg-gray-700" />

        {rows.map((r, i) => {
          const positive = r.netTWD >= 0
          const width = (Math.abs(r.netTWD) / maxAbs) * 100
          const settled = Math.abs(r.netTWD) < 0.005
          return (
            <div key={r.name} className="grid grid-cols-2 items-center anim-rise" style={{ animationDelay: `${i * 90}ms` }}>
              {/* left half: pay-bar grows from the axis leftwards */}
              <div className="flex justify-end items-center gap-2 pr-px">
                {positive ? (
                  <span className="text-sm text-gray-800 dark:text-gray-100 truncate pr-2">{r.name}</span>
                ) : (
                  <>
                    <span className="font-mono tabular-nums text-[11px] text-rose-600 dark:text-rose-400">−{twd(r.netTWD)}</span>
                    <div
                      className="h-5 rounded-l-md bg-rose-400/90 dark:bg-rose-500/80 anim-grow-r"
                      style={{ width: `${width}%`, animationDelay: `${120 + i * 90}ms` }}
                    />
                  </>
                )}
              </div>
              {/* right half: receive-bar grows from the axis rightwards */}
              <div className="flex items-center gap-2 pl-px">
                {positive ? (
                  settled ? (
                    <span className="font-mono tabular-nums text-[11px] text-gray-400 pl-1">±0</span>
                  ) : (
                    <>
                      <div
                        className="h-5 rounded-r-md bg-emerald-400/90 dark:bg-emerald-500/80 anim-grow-l"
                        style={{ width: `${width}%`, animationDelay: `${120 + i * 90}ms` }}
                      />
                      <span className="font-mono tabular-nums text-[11px] text-emerald-600 dark:text-emerald-400">+{twd(r.netTWD)}</span>
                    </>
                  )
                ) : (
                  <span className="text-sm text-gray-800 dark:text-gray-100 truncate pl-2">{r.name}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
