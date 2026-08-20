import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/JsonLd'
import { SITE_AUTHOR, SITE_NAME } from '@/lib/site'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'ShareMoney 分帳｜旅遊、聚餐、合租的共同費用記帳與結算',
  description: '一群人一起花錢，最麻煩的是事後算錢。ShareMoney 幫你記下誰付了什麼、誰該分攤，最後用最少的轉帳次數結清。支援外幣匯率、分帳確認與即時同步，免費使用。',
  alternates: { canonical: '/' },
}

const FEATURES = [
  [
    '逐筆記錄，指定付款人與分攤對象',
    '每筆費用都填得清楚：誰付的、多少錢、由誰分攤。付款人可以是任何一位成員，幫忘記記帳的人代填也沒問題。沒吃那餐的人不勾就是了。',
  ],
  [
    '均攤或自訂金額都可以',
    '預設平均分，除不盡的餘數落在第一位成員身上，加總永遠等於原金額。不是平均分的時候切到自訂金額逐一輸入，湊不齊系統不會讓你送出。',
  ],
  [
    '外幣記帳，台幣結算',
    '出國時直接輸入日圓、韓元、美元，畫面同時顯示換算後的台幣。匯率會自動帶入當下數字，也能手動改成信用卡帳單上的實際匯率，整本帳一起重算。',
  ],
  [
    '分帳確認，避免事後才有人跳出來',
    '被列為分攤對象的人會收到待確認項目，可以確認、也可以提出異議。帳目上看得出哪幾筆還沒獲得所有人同意。',
  ],
  [
    '一鍵結算，轉帳筆數壓到最少',
    '結算頁算出每個人的淨額，再推導出誰該轉給誰。三個人互相欠來欠去，通常兩筆轉帳就能結清。轉完按「記錄還款」餘額歸零，原本的費用紀錄完整保留。',
  ],
  [
    '即時同步與推播通知',
    '同一本帳有人記了新費用，其他成員的畫面會直接更新，不用重新整理。有人找你確認時會收到推播，通知可以隨時關掉。',
  ],
] as const

const SCENARIOS = [
  ['出國旅遊', '機票一個人刷、住宿另一個人訂、當地開銷輪流付，外幣還要換算。開一本帳從出發記到回國。'],
  ['朋友聚餐', '一個人先結帳，其他人事後再各自還。單日、不用外幣，記完直接看誰欠誰多少。'],
  ['室友合租', '水電瓦斯網路每月一輪，不指定日期的長期帳本最適合，月底一次結清。'],
  ['社團與公司活動', '迎新、系烤、部門聚餐，一群人湊錢辦活動，經費明細大家都看得到。'],
] as const

const STEPS = [
  [
    '開一本帳，把人找進來',
    '一件事開一本：一趟東京五日遊、一次社團迎新、一間房子的水電。按「邀請成員」產生連結傳給同行的人，對方登入後就加入。沒拿到連結的人看不到你們的費用。',
  ],
  [
    '當下就記，一筆一筆記',
    '花錢的當下花十秒記一筆：名稱、金額、誰付的、由誰分攤。其他成員的畫面會即時更新，不會有人不知道發生了什麼。',
  ],
  [
    '結算，照著轉帳',
    '結束後打開結算頁，直接告訴你誰該轉給誰、轉多少，而且是最少的筆數。轉完按「記錄還款」，餘額歸零。',
  ],
] as const

const HOME_FAQ = [
  ['要錢嗎？', '不用。帳本數量、成員人數、費用筆數都沒有上限，也沒有付費牆。'],
  [
    '每個人都要註冊嗎？',
    '要一起看帳、確認費用的人需要用 Google 帳號登入。但你可以先自己把費用全記進去、指定其他人為分攤對象，等他們之後加入時就會看到完整的帳。',
  ],
  [
    '別人看得到我其他帳本嗎？',
    '看不到。每本帳只有被邀請的成員讀得到，這是在資料庫層級（Row Level Security）擋掉的，不是只有畫面上不顯示。',
  ],
  ['要裝 app 嗎？', '網頁直接用。也可以加到手機主畫面，或安裝 Android 版，是同一個服務、同一份資料。'],
] as const

// Fully static: signed-in members never reach this page — middleware sends them
// to /trips — so it can be prerendered and served straight from the edge.
export default function HomePage() {
  return (
    <main>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          alternateName: 'ShareMoney 分帳',
          url: CANONICAL_SITE_URL,
          inLanguage: 'zh-TW',
          publisher: { '@type': 'Person', name: SITE_AUTHOR.name },
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: SITE_NAME,
          url: CANONICAL_SITE_URL,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Web, Android',
          inLanguage: 'zh-TW',
          description:
            '共同費用的記帳與結算工具：記下誰付了什麼、誰該分攤，支援外幣匯率換算，最後用最少的轉帳次數結清。',
          author: { '@type': 'Person', name: SITE_AUTHOR.name },
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
          featureList: FEATURES.map(([title]) => title),
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: HOME_FAQ.map(([q, a]) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        }}
      />

      <section className="max-w-2xl mx-auto px-5 pt-14 pb-12">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-ink mb-4">
          一起花的錢，
          <br />
          算清楚不用傷感情
        </h1>
        <p className="text-[15px] text-ink-2 leading-relaxed mb-7">
          ShareMoney 是一個共同費用的記帳與結算工具。旅遊、聚餐、社團活動、室友公費都能開一本帳：
          記下誰付了什麼、誰該分攤多少，支援外幣匯率換算，最後用最少的轉帳次數一次結清。完全免費，沒有付費牆。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/calculator"
            className="inline-flex items-center bg-accent text-white text-sm font-semibold px-5 py-3 rounded-full hover:bg-accent-deep active:scale-95 transition-all"
          >
            先試分帳計算機
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center bg-white text-ink-2 text-sm font-semibold px-5 py-3 rounded-full ring-1 ring-line shadow-card hover:text-ink hover:shadow-card-hover transition-all"
          >
            登入開一本帳
          </Link>
        </div>
        <p className="text-xs text-ink-3 mt-3">
          計算機不用註冊，直接算。也可以先逛
          <Link href="/demo" className="text-accent hover:underline mx-1">示範帳本</Link>
          看看記完一趟旅行長什麼樣。
        </p>
      </section>

      <section className="border-t border-line bg-white">
        <div className="max-w-2xl mx-auto px-5 py-12">
          <h2 className="text-lg font-bold text-ink mb-3">為什麼分帳這麼難算</h2>
          <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">
            <p>
              問題不在數學，在於資訊散掉了。錢是一路花出去的：今天他付了車錢，明天你刷了住宿，後天大家又各買各的紀念品。
              記在群組對話裡會被洗掉，記在共用試算表要有人維護，記在自己手機裡別人看不到。
            </p>
            <p>
              等到要算的時候，通常已經沒人記得那晚的宵夜是誰付的、金額多少、有沒有算到當時提早回飯店的那個人。
              於是變成「算了啦大概這樣」——不是每次都吵得起來，但每次都有人心裡覺得虧了一點。
            </p>
            <p>
              就算把帳記全了，還有第二個麻煩：每一筆各自還，十筆費用就要轉十幾次帳。
              明明 A 欠 B、B 欠 C、C 又欠 A，繞一圈其實可以省掉大半。
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-5 py-12">
        <h2 className="text-lg font-bold text-ink mb-6">三個步驟</h2>
        <ol className="flex flex-col gap-5">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="shrink-0 h-7 w-7 rounded-full bg-accent text-white text-[13px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink mb-1">{title}</h3>
                <p className="text-sm text-ink-2 leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-ink-3 mt-6">
          每一步的細節寫在<Link href="/guide" className="text-accent hover:underline mx-1">使用教學</Link>，
          實際跑過一趟的完整例子在
          <Link href="/articles/japan-trip-split-example" className="text-accent hover:underline mx-1">
            四人日本自由行的分帳實錄
          </Link>
          。
        </p>
      </section>

      <section className="border-t border-line bg-white">
        <div className="max-w-2xl mx-auto px-5 py-12">
          <h2 className="text-lg font-bold text-ink mb-6">功能</h2>
          <div className="flex flex-col gap-6">
            {FEATURES.map(([title, body]) => (
              <div key={title}>
                <h3 className="text-sm font-bold text-ink mb-1.5">{title}</h3>
                <p className="text-sm text-ink-2 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-5 py-12">
        <h2 className="text-lg font-bold text-ink mb-6">誰在用</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {SCENARIOS.map(([title, body]) => (
            <div key={title} className="bg-white rounded-2xl shadow-card p-5">
              <h3 className="text-sm font-bold text-ink mb-1.5">{title}</h3>
              <p className="text-sm text-ink-2 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-white">
        <div className="max-w-2xl mx-auto px-5 py-12">
          <h2 className="text-lg font-bold text-ink mb-6">常被問到的幾件事</h2>
          <div className="flex flex-col gap-5">
            {HOME_FAQ.map(([q, a]) => (
              <div key={q}>
                <h3 className="text-sm font-bold text-ink mb-1.5">{q}</h3>
                <p className="text-sm text-ink-2 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-ink-3 mt-6">
            還有十幾題在<Link href="/faq" className="text-accent hover:underline mx-1">常見問題</Link>；
            外幣對帳、室友電費、代墊怎麼要回來這類實務問題，寫在
            <Link href="/articles" className="text-accent hover:underline mx-1">分帳文章</Link>。
          </p>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-5 py-14 text-center">
        <h2 className="text-lg font-bold text-ink mb-2">下一趟出門前先開好一本帳</h2>
        <p className="text-sm text-ink-2 leading-relaxed mb-6">
          花十秒建立，把連結丟到群組，剩下的邊玩邊記就好。
        </p>
        <Link
          href="/login"
          className="inline-flex items-center bg-accent text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-accent-deep active:scale-95 transition-all"
        >
          用 Google 帳號開始
        </Link>
      </section>
    </main>
  )
}
