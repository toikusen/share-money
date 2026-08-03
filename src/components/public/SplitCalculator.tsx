'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { previewEqualSplit } from '@/lib/utils/split-preview'

type Row = { name: string; paid: string }

const INITIAL: Row[] = [
  { name: '小明', paid: '3000' },
  { name: '小華', paid: '1200' },
  { name: '小美', paid: '300' },
]

const twd = (n: number) => `NT$${n.toLocaleString('zh-TW')}`

/** Digits only — the calculator settles whole TWD, matching the app's ledger. */
const toAmount = (raw: string) => {
  const n = Number(raw.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function SplitCalculator() {
  const [rows, setRows] = useState(INITIAL)

  const update = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const payers = useMemo(
    () => rows.map((row, i) => ({ name: row.name.trim() || `成員 ${i + 1}`, paid: toAmount(row.paid) })),
    [rows]
  )
  const { total, shares, nets, transfers } = useMemo(() => previewEqualSplit(payers), [payers])

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-bold text-ink">誰付了多少</h2>
          <span className="text-xs text-ink-3">{rows.length} 人</span>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                aria-label={`第 ${i + 1} 位成員的名字`}
                value={row.name}
                onChange={e => update(i, { name: e.target.value })}
                placeholder={`成員 ${i + 1}`}
                className="flex-1 min-w-0 bg-fill rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-accent/30"
              />
              <div className="relative w-32 shrink-0">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-4 pointer-events-none">
                  $
                </span>
                <input
                  aria-label={`${row.name.trim() || `成員 ${i + 1}`} 付了多少`}
                  value={row.paid}
                  onChange={e => update(i, { paid: e.target.value.replace(/[^\d]/g, '') })}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-full bg-fill rounded-xl pl-7 pr-3 py-2.5 text-sm text-ink text-right tabular-nums placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, index) => index !== i))}
                disabled={rows.length <= 2}
                aria-label={`移除 ${row.name.trim() || `成員 ${i + 1}`}`}
                className="p-2 shrink-0 rounded-lg text-ink-4 hover:text-owe hover:bg-fill disabled:opacity-30 disabled:hover:text-ink-4 disabled:hover:bg-transparent transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRows([...rows, { name: '', paid: '' }])}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:text-accent-deep transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          加一個人
        </button>
      </section>

      <section className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-baseline justify-between pb-3 border-b border-line">
          <h2 className="text-base font-bold text-ink">結算結果</h2>
          <span className="text-sm text-ink-2 tabular-nums">
            總額 <strong className="text-ink">{twd(total)}</strong>
          </span>
        </div>

        <table className="w-full text-sm my-4">
          <thead>
            <tr className="text-xs text-ink-3 text-right">
              <th className="font-normal text-left pb-2">成員</th>
              <th className="font-normal pb-2">已付</th>
              <th className="font-normal pb-2">應攤</th>
              <th className="font-normal pb-2">結餘</th>
            </tr>
          </thead>
          <tbody>
            {payers.map((payer, i) => (
              <tr key={i} className="text-right tabular-nums border-t border-line">
                <td className="text-left py-2 text-ink truncate max-w-[9rem]">{payer.name}</td>
                <td className="py-2 text-ink-2">{twd(payer.paid)}</td>
                <td className="py-2 text-ink-2">{twd(shares[i])}</td>
                <td className={`py-2 font-semibold ${nets[i] > 0 ? 'text-gain' : nets[i] < 0 ? 'text-owe' : 'text-ink-4'}`}>
                  {nets[i] > 0 ? '+' : ''}
                  {twd(nets[i])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="text-sm font-bold text-ink mb-2">
          怎麼轉最省事{transfers.length > 0 && <span className="font-normal text-ink-3">（{transfers.length} 筆）</span>}
        </h3>
        {transfers.length === 0 ? (
          <p className="text-sm text-ink-3">
            {total === 0 ? '填入每個人付掉的金額，就會算出誰該轉給誰。' : '大家付的一樣多，不用轉帳。'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {transfers.map((transfer, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-ink">
                <span className="truncate max-w-[7rem]">{payers[Number(transfer.from)].name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-4 shrink-0" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
                <span className="truncate max-w-[7rem]">{payers[Number(transfer.to)].name}</span>
                <strong className="ml-auto tabular-nums">{twd(transfer.amountTWD)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-ink-3 leading-relaxed">
        這頁只做均攤試算，算完不會留存任何資料。需要自訂每個人分攤多少、記錄多筆費用、外幣換算或讓同行的人一起確認，
        <Link href="/login" className="text-accent hover:underline mx-1">登入開一本帳</Link>
        就有完整版；計算方式與這裡完全相同，說明見
        <Link href="/settlement" className="text-accent hover:underline mx-1">結算原理</Link>。
      </p>
    </div>
  )
}
