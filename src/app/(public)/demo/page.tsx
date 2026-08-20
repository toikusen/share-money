import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '示範帳本｜不用登入先看看帳本長什麼樣 | ShareMoney',
  description:
    '一本填好資料的示範帳本：十筆費用、四位成員、日圓與台幣並列，以及算出來的每人結餘與轉帳清單。不用註冊就能看到 ShareMoney 記完一趟旅行之後的樣子。',
  alternates: { canonical: '/demo' },
}

const MEMBERS = [
  { name: '阿凱', color: '#e8eaf6', fg: '#3f4a8a' },
  { name: '小婕', color: '#fce4ec', fg: '#96305a' },
  { name: '宗翰', color: '#e0f2f1', fg: '#1f6b62' },
  { name: 'Yuki', color: '#fff3e0', fg: '#8a5a1f' },
] as const

const EXPENSES = [
  { date: '03/05', name: '機票 ×4', payer: '阿凱', foreign: null, twd: 42800, split: '四人均攤' },
  { date: '03/05', name: '旅平險 ×4', payer: '小婕', foreign: null, twd: 3200, split: '四人均攤' },
  { date: '03/06', name: '網路卡 ×4', payer: '宗翰', foreign: null, twd: 1600, split: '四人均攤' },
  { date: '03/06', name: '住宿 4 晚', payer: '小婕', foreign: '¥128,000', twd: 28160, split: '四人均攤' },
  { date: '03/06', name: '交通儲值', payer: '宗翰', foreign: '¥24,000', twd: 5280, split: '四人均攤' },
  { date: '03/06', name: '第一晚居酒屋', payer: 'Yuki', foreign: '¥18,400', twd: 4048, split: '四人均攤' },
  { date: '03/07', name: '第二晚燒肉', payer: '阿凱', foreign: '¥27,000', twd: 5940, split: '三人（Yuki 沒去）' },
  { date: '03/08', name: '迪士尼門票 ×3', payer: '小婕', foreign: '¥28,500', twd: 6270, split: '三人（宗翰沒去）' },
  { date: '03/09', name: '藥妝店代刷', payer: 'Yuki', foreign: '¥31,000', twd: 6820, split: '自訂金額' },
  { date: '03/09', name: '最後一晚拉麵', payer: '宗翰', foreign: '¥6,800', twd: 1496, split: '四人均攤' },
] as const

const BALANCES = [
  { name: '阿凱', paid: 48740, owed: 27916, net: 20824 },
  { name: '小婕', paid: 37630, owed: 29126, net: 8504 },
  { name: '宗翰', paid: 8376, owed: 24616, net: -16240 },
  { name: 'Yuki', paid: 10868, owed: 23956, net: -13088 },
] as const

const TRANSFERS = [
  { from: '宗翰', to: '阿凱', amount: 16240 },
  { from: 'Yuki', to: '阿凱', amount: 4584 },
  { from: 'Yuki', to: '小婕', amount: 8504 },
] as const

const TOTAL = EXPENSES.reduce((sum, e) => sum + e.twd, 0)
const money = (n: number) => n.toLocaleString('zh-TW')

export default function DemoPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <h1 className="text-xl font-bold text-ink mb-2">示範帳本</h1>
      <p className="text-sm text-ink-3 leading-relaxed mb-6">
        這是一本已經填好資料的帳本，內容是四個人的東京五天四夜。
        不用註冊也看得到 ShareMoney 記完一趟旅行之後長什麼樣：
        十筆費用、日圓與台幣並列、每個人的結餘，以及最後只需要三次的轉帳清單。
      </p>
      <p className="text-xs text-ink-4 bg-fill rounded-xl px-3.5 py-2.5 mb-9">
        以下全部是示範資料，不是真實的人或消費紀錄。想真的記一本，
        <Link href="/login" className="text-accent hover:underline mx-1">登入就能開</Link>。
      </p>

      {/* ── 帳本抬頭 ───────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-card p-5 mb-8">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[17px] font-bold text-ink">東京五天四夜</h2>
            <p className="text-xs text-ink-4 mt-0.5">旅遊 · 2026/03/05 – 03/09</p>
          </div>
          <div className="flex items-center shrink-0" aria-label="成員 4 人">
            {MEMBERS.map(m => (
              <span
                key={m.name}
                role="img"
                aria-label={m.name}
                className="h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center ring-2 ring-white -ml-1.5 first:ml-0 select-none"
                style={{ background: m.color, color: m.fg }}
              >
                {m.name[0]}
              </span>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div>
            <dt className="text-[11px] text-ink-4">總支出</dt>
            <dd className="text-[15px] font-bold font-mono tabular-nums text-ink mt-0.5">{money(TOTAL)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-4">費用筆數</dt>
            <dd className="text-[15px] font-bold font-mono tabular-nums text-ink mt-0.5">{EXPENSES.length}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-4">匯率 1 JPY</dt>
            <dd className="text-[15px] font-bold font-mono tabular-nums text-ink mt-0.5">0.22</dd>
          </div>
        </dl>
      </section>

      {/* ── 費用明細 ───────────────────────────── */}
      <section className="mb-9">
        <h2 className="text-[13px] font-semibold text-ink-2 mb-3">
          費用明細 <span className="font-normal text-ink-4">· {EXPENSES.length} 筆</span>
        </h2>
        <div className="flex flex-col gap-2">
          {EXPENSES.map(e => (
            <div key={e.name} className="bg-white rounded-xl shadow-card px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink truncate">{e.name}</p>
                <p className="text-[11.5px] text-ink-4 mt-0.5">
                  {e.date} · {e.payer} 付 · {e.split}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold font-mono tabular-nums text-ink">{money(e.twd)}</p>
                {e.foreign && <p className="text-[11px] font-mono text-ink-4 mt-0.5">{e.foreign}</p>}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-4 mt-3 leading-relaxed">
          日圓費用輸入的是原幣金額，畫面上同時顯示按帳本匯率換算的台幣。
          回國拿到信用卡帳單後把匯率改掉，整本帳會一起重算——
          為什麼帳單匯率會不一樣，寫在
          <Link href="/articles/credit-card-fx-rate" className="text-accent hover:underline mx-1">海外刷卡的匯率</Link>。
        </p>
      </section>

      {/* ── 結餘 ───────────────────────────────── */}
      <section className="mb-9">
        <h2 className="text-[13px] font-semibold text-ink-2 mb-3">每人結餘</h2>
        <div className="bg-white rounded-2xl shadow-card p-5 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11.5px] text-ink-3 text-left">
                <th className="pb-2 pr-3 font-medium">成員</th>
                <th className="pb-2 pr-3 font-medium text-right">墊付</th>
                <th className="pb-2 pr-3 font-medium text-right">應攤</th>
                <th className="pb-2 font-medium text-right">結餘</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {BALANCES.map(b => (
                <tr key={b.name} className="border-t border-line">
                  <td className="py-2 pr-3 font-sans text-ink">{b.name}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">{money(b.paid)}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">{money(b.owed)}</td>
                  <td className={`py-2 text-right font-semibold ${b.net > 0 ? 'text-gain' : 'text-owe'}`}>
                    {b.net > 0 ? '+' : '−'}{money(Math.abs(b.net))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-4 mt-3 leading-relaxed">
          結餘 = 墊付 − 應攤。四個數字加起來一定是零，這是檢查有沒有算錯最快的方法。
        </p>
      </section>

      {/* ── 轉帳清單 ───────────────────────────── */}
      <section className="mb-9">
        <h2 className="text-[13px] font-semibold text-ink-2 mb-3">
          結算 <span className="font-normal text-ink-4">· {TRANSFERS.length} 筆轉帳</span>
        </h2>
        <div className="flex flex-col gap-2">
          {TRANSFERS.map(t => (
            <div
              key={`${t.from}-${t.to}`}
              className="bg-white rounded-xl shadow-card px-4 py-3.5 flex items-center gap-3"
            >
              <span className="text-sm font-medium text-ink">{t.from}</span>
              <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-label="轉給" className="text-ink-4 shrink-0"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className="text-sm font-medium text-ink">{t.to}</span>
              <span className="ml-auto text-sm font-bold font-mono tabular-nums text-ink">
                {money(t.amount)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-4 mt-3 leading-relaxed">
          如果照「每一筆各自還」，這十筆費用會產生 28 次轉帳。壓成結餘之後只剩 3 次——
          N 個人最多只需要 N−1 筆，推導在
          <Link href="/settlement" className="text-accent hover:underline mx-1">結算原理</Link>。
        </p>
      </section>

      <section className="border-t border-line pt-7">
        <h2 className="text-base font-bold text-ink mb-3">示範帳本沒演到的部分</h2>
        <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">
          <p>
            這頁是靜態的畫面，真正登入之後還有幾件事是這裡看不到的：
            邀請連結、被列為分攤對象時的確認與異議、同一本帳有人記帳時其他人畫面的即時更新、
            推播通知，以及按「記錄還款」讓餘額歸零而不用刪掉任何費用。
          </p>
          <p>
            這些功能的說明在<Link href="/guide" className="text-accent hover:underline mx-1">使用教學</Link>，
            疑問整理在<Link href="/faq" className="text-accent hover:underline mx-1">常見問題</Link>。
            如果只是想算一筆已經結束的帳，
            <Link href="/calculator" className="text-accent hover:underline mx-1">分帳計算機</Link>不用註冊就能用。
          </p>
        </div>
      </section>
    </main>
  )
}
