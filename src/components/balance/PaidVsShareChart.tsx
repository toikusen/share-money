type Row = {
  name: string
  isMe: boolean
  hue: number
  paidTWD: number
  owedTWD: number
  netTWD: number
}

const num = (n: number) => Math.round(Math.abs(n)).toLocaleString('zh-TW')

/**
 * 墊付 vs 應攤:一張圖取代原本的 PaidShareChart + NetChart。
 * 實心條=墊付(成員色相)、黑刻度=應攤、右欄=淨額。
 * 實心條超過刻度=墊太多該收錢;不到=該補錢。
 */
export function PaidVsShareChart({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.flatMap(r => [r.paidTWD, r.owedTWD]))

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold text-ink-2">墊付（實心）對 應攤（黑刻度）</span>
        <span className="text-[10.5px] text-ink-4 font-mono">單位 TWD</span>
      </div>

      <div className="grid grid-cols-[44px_1fr_72px] gap-x-2.5 gap-y-3.5 items-center">
        {rows.map((r, i) => {
          const settledRow = Math.abs(r.netTWD) < 0.005
          return (
            // 一列三欄:名字 | 條區 | 淨額
            <div key={r.name} className="contents">
              <span className={`text-[12.5px] whitespace-nowrap truncate ${r.isMe ? 'font-bold text-ink' : 'font-medium text-ink-2'}`}>
                {r.isMe ? '你' : r.name}
              </span>
              <div className="relative h-3.5 rounded-full bg-line">
                <div
                  className="absolute inset-y-0 left-0 rounded-full anim-grow-l"
                  style={{
                    width: `${Math.max((r.paidTWD / max) * 100, 1)}%`,
                    background: `oklch(0.75 0.06 ${r.hue})`,
                    animationDelay: `${i * 80}ms`,
                  }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded-[1px] bg-ink"
                  style={{ left: `${Math.min((r.owedTWD / max) * 100, 98)}%` }}
                />
              </div>
              <span className={`text-[12.5px] font-bold font-mono tabular-nums text-right whitespace-nowrap ${
                settledRow ? 'text-ink-3' : r.netTWD > 0 ? 'text-gain' : 'text-owe'
              }`}>
                {settledRow ? '±0' : `${r.netTWD > 0 ? '+' : '−'}${num(r.netTWD)}`}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-ink-4">實心條超過黑刻度＝墊太多該收錢；不到刻度＝該補錢</p>
    </div>
  )
}
