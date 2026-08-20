import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '結算原理 | ShareMoney 分帳',
  description: 'ShareMoney 如何計算每個人該收該付的金額，以及如何用最少的轉帳次數把一群人的帳結清。',
  alternates: { canonical: '/settlement' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-ink mb-2">{title}</h2>
      <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">{children}</div>
    </section>
  )
}

const rows = [
  { name: '小明', paid: 3000, owed: 1500, net: 1500 },
  { name: '小華', paid: 1200, owed: 1500, net: -300 },
  { name: '小美', paid: 300, owed: 1500, net: -1200 },
]

export default function SettlementPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <h1 className="text-xl font-bold text-ink mb-2">結算是怎麼算出來的</h1>
      <p className="text-sm text-ink-3 mb-8">
        分帳最容易吵架的地方，是「每一筆各自還」——十筆費用就要轉十次帳。
        ShareMoney 的作法是先把所有費用壓成每個人的一個淨額，再用最少的轉帳次數把淨額清掉。
      </p>

      <Section title="第一步：算出每個人的淨額">
        <p>
          每個人有兩個數字：<strong className="text-ink">墊付</strong>（他實際掏錢付掉的總額）和
          <strong className="text-ink">應攤</strong>（所有費用裡分到他頭上的總額）。兩者相減就是淨額：
        </p>
        <p className="font-mono text-xs bg-fill rounded-lg px-3 py-2.5 text-ink">
          淨額 = 墊付總額 − 應攤總額
        </p>
        <p>
          淨額為正代表他先幫大家出了錢，該收回來；為負代表他還沒付夠，該掏錢。
          所有人的淨額加起來一定是零——錢不會憑空多出來或消失，這也是系統內部的檢查點。
        </p>
        <p>
          外幣費用在這一步就已經按帳本匯率換算成台幣，所以一本帳裡即使混著日圓和台幣，
          淨額仍然是同一個單位，不會出現兩套幣別各自結算的情況。
        </p>
      </Section>

      <Section title="舉個例子">
        <p>三個人出去玩，總共花了 4,500 元，三筆費用都是三人均攤，每人應攤 1,500 元：</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-ink-3 text-left">
                <th className="py-2 pr-3 font-medium">成員</th>
                <th className="py-2 pr-3 font-medium text-right">墊付</th>
                <th className="py-2 pr-3 font-medium text-right">應攤</th>
                <th className="py-2 font-medium text-right">淨額</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {rows.map(r => (
                <tr key={r.name} className="border-t border-line">
                  <td className="py-2 pr-3 font-sans text-ink">{r.name}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">{r.paid.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">{r.owed.toLocaleString()}</td>
                  <td className={`py-2 text-right font-semibold ${r.net > 0 ? 'text-gain' : 'text-owe'}`}>
                    {r.net > 0 ? '+' : ''}{r.net.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          小明該收 1,500，小華該付 300，小美該付 1,200。如果照「每筆各自還」的作法，
          三筆費用會產生六次轉帳；壓成淨額之後，只剩兩筆：小美轉 1,200 給小明、小華轉 300 給小明。
        </p>
      </Section>

      <Section title="第二步：把轉帳次數壓到最少">
        <p>
          把所有淨額為正的人排成一列（收款方，由大到小），淨額為負的人排成另一列（付款方，欠最多的排前面），
          然後每次都讓「欠最多的人」轉給「該收最多的人」，金額取兩者的較小值。
          一次轉帳至少讓其中一邊歸零，於是這個人就從列表裡移除，繼續配下一組，直到兩列都空掉。
        </p>
        <p>
          因為每一筆轉帳至少消掉一個人，<strong className="text-ink">N 個人最多只需要 N−1 筆轉帳</strong>就能結清——
          五個人最多四筆，不管中間記了幾百筆費用。
        </p>
        <p className="text-ink-3">
          補充一句實話：求「理論上絕對最少的轉帳筆數」在數學上是 NP-hard 的問題（要枚舉所有能互相抵銷的子集合）。
          ShareMoney 用的是上面這個貪婪配對法，保證不超過 N−1 筆，在實際的三五人團體幾乎都等於最佳解，
          但在刻意構造的特殊金額組合下，理論上可能存在再少一筆的解法。我們選擇了可預測、算得快、
          而且結果穩定的作法，而不是為了極少數情況去跑指數級的搜尋。
        </p>
      </Section>

      <Section title="小數與尾數怎麼處理">
        <p>
          均攤除不盡時，餘數會固定落在分攤名單的第一個人身上，例如 100 元三人均攤是 34 / 33 / 33。
          分出去的金額總和永遠等於原始金額，不會出現「每人 33.33，加起來少一毛」的黑洞。
        </p>
        <p>
          淨額與轉帳金額都保留到小數點後兩位，並以 0.005 元為門檻判斷是否歸零，
          避免浮點數誤差讓某個人身上永遠掛著 0.0000001 元的餘額，導致多出一筆沒有意義的轉帳。
        </p>
      </Section>

      <Section title="記錄還款之後">
        <p>
          實際轉完帳，在結算頁按「記錄還款」，系統會寫入一筆結算紀錄——本質上是一筆特殊的費用：
          付款人是還錢的人，分攤對象是收錢的人。它同樣進入上面的淨額公式，所以兩人的餘額就此歸零，
          原本的費用紀錄一筆都不用刪，帳本的歷史保持完整。
        </p>
      </Section>

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        想知道怎麼開始記帳，看<Link href="/guide" className="text-accent hover:underline mx-1">使用教學</Link>。
      </div>
    </main>
  )
}
