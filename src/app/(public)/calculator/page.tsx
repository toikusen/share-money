import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/JsonLd'
import { SplitCalculator } from '@/components/public/SplitCalculator'

export const metadata: Metadata = {
  title: '免費分帳計算機｜算出誰該轉給誰 | ShareMoney',
  description: '輸入每個人各自付了多少，立刻算出均攤後誰該付誰、轉多少，並把轉帳筆數壓到最少。免安裝、免註冊、不留存資料。',
  alternates: { canonical: '/calculator' },
}

const FAQ = [
  [
    '這個計算機會存我的資料嗎？',
    '不會。所有計算都在你的瀏覽器裡完成，金額不會送到伺服器，關掉頁面就沒了。也因為這樣，它沒辦法讓其他人看到同一份帳。',
  ],
  [
    '為什麼算出來的轉帳筆數這麼少？',
    '因為它不是「一筆一筆各自還」，而是先把每個人壓成一個結餘，再讓該收的人和該付的人直接配對。N 個人最多只需要 N−1 筆轉帳就能結清。',
  ],
  [
    '如果不是每個人都均攤呢？',
    '這個計算機假設所有費用由填入的所有人平均分攤。如果有人沒參與某幾筆、或每個人分攤的金額不同，需要逐筆記錄的完整版才算得準。',
  ],
  [
    '可以算外幣嗎？',
    '可以，但要自己先換算成同一個幣別再填。混著日圓和台幣填會算出沒有意義的數字。',
  ],
  [
    '算完之後要怎麼給大家看？',
    '截圖丟到群組是最快的。如果這群人會一直一起花錢，開一本帳讓所有人都看得到會省很多解釋。',
  ],
] as const

export default function CalculatorPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map(([q, a]) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        }}
      />

      <h1 className="text-xl font-bold text-ink mb-2">免費分帳計算機</h1>
      <p className="text-sm text-ink-3 leading-relaxed mb-8">
        一頓飯、一趟旅行結束，大家輪流付了不同金額，最後誰該補誰多少？
        把每個人付掉的錢填進去就會算出來，而且會幫你把轉帳筆數壓到最少。不用註冊，也不會留下任何紀錄。
      </p>

      <SplitCalculator />

      <section className="mt-12 pt-8 border-t border-line">
        <h2 className="text-base font-bold text-ink mb-3">這個計算機在算什麼</h2>
        <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">
          <p>
            大部分人分帳的算法是「每一筆各自還」——這餐我付的，你們兩個各還我三分之一；下一攤他付的，再各還他三分之一。
            十筆費用就要來回轉十幾次帳，還很容易漏掉。
          </p>
          <p>
            這裡的做法是先把每個人壓成<strong className="text-ink">一個數字</strong>：他付掉的錢，減掉他該分攤的錢。
            結果是正的代表他墊了錢、該收回來；是負的代表他還沒付夠、該補出去。所有人的結餘加起來一定等於零。
          </p>
          <p>
            接著把該收錢的人和該付錢的人配對，每次都讓其中一方直接歸零，這樣需要的轉帳筆數最少。
            三個人互相欠來欠去，通常兩筆就能結清；十個人的旅行，多半也只要八九筆。
            完整推導寫在<Link href="/settlement" className="text-accent hover:underline mx-1">結算原理</Link>。
          </p>
          <p>
            金額除不盡時（例如 100 元三個人分），餘數會落在前面的成員身上，變成 34 / 33 / 33。
            這樣分攤金額加總永遠等於原金額，不會因為四捨五入而少掉一塊錢。
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-bold text-ink mb-3">三種最常用到的情況</h2>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="text-sm font-bold text-ink mb-1.5">一桌人吃飯，一個人結帳</h3>
            <p className="text-sm text-ink-2 leading-relaxed">
              最單純的情況：帳單 3,600 元，四個人吃，小安先付。填「小安 3600、其他三人 0」，
              算出來就是三個人各轉 900 給小安。如果其中 800 元是兩個人喝的酒，那就不該均攤——
              把酒單獨算一次，或看
              <Link href="/articles/restaurant-bill-split" className="text-accent hover:underline mx-1">
                一桌人吃飯的帳怎麼分
              </Link>
              。
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink mb-1.5">旅行結束，每個人都墊了一些</h3>
            <p className="text-sm text-ink-2 leading-relaxed">
              這是計算機最能發揮的場景。四個人的旅行，阿凱刷了機票和一晚燒肉、小婕訂了住宿和門票、
              宗翰付了交通和網卡、Yuki 付了居酒屋和藥妝店——把四個人各自付掉的總額填進去，
              直接得到轉帳清單。完整的例子在
              <Link href="/articles/japan-trip-split-example" className="text-accent hover:underline mx-1">
                四人日本自由行的分帳實錄
              </Link>
              。
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink mb-1.5">室友這期的公費</h3>
            <p className="text-sm text-ink-2 leading-relaxed">
              電費和瓦斯是 A 代繳、網路是 B 繳、消耗品是 C 買的。填三個人各自墊付的金額，
              算出誰該補誰多少。合租的分攤方式不只一種，
              <Link href="/articles/roommate-utilities-split" className="text-accent hover:underline mx-1">
                按人頭、按房間、按用量各有適用的場合
              </Link>
              。
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-bold text-ink mb-3">什麼時候該用完整版</h2>
        <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">
          <p>
            這頁適合「事情已經結束、金額都知道了」的一次性試算。但實際出去玩的時候，費用是一路發生的，
            而且很少剛好每個人都均攤——有人沒吃那餐、有人多住一晚、機票是一個人刷卡代訂的。
          </p>
          <p>
            這些情況需要逐筆記錄、指定每筆的付款人與分攤對象，甚至自訂每個人分多少。
            出國還會遇到外幣：日圓計價、台幣結算，匯率還要對得上信用卡帳單。
            這些是<Link href="/login" className="text-accent hover:underline mx-1">登入後的完整版</Link>在做的事，
            流程說明看<Link href="/guide" className="text-accent hover:underline mx-1">使用教學</Link>，
            或先看<Link href="/demo" className="text-accent hover:underline mx-1">示範帳本</Link>長什麼樣。
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-bold text-ink mb-4">關於這個計算機</h2>
        <div className="flex flex-col gap-5">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <h3 className="text-sm font-bold text-ink mb-1.5">{q}</h3>
              <p className="text-sm text-ink-2 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        更多分帳的實務問題整理在
        <Link href="/articles" className="text-accent hover:underline mx-1">分帳文章</Link>。
      </div>
    </main>
  )
}
