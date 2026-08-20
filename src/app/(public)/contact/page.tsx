import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/JsonLd'
import { SITE_AUTHOR, SITE_NAME } from '@/lib/site'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

export const metadata: Metadata = {
  title: '聯絡我們 | ShareMoney 分帳',
  description: 'ShareMoney 分帳的聯絡方式：問題回報、功能建議、帳號與資料刪除、廣告與合作洽詢。',
  alternates: { canonical: '/contact' },
}

const CONTACT_EMAIL = SITE_AUTHOR.email

const TOPICS = [
  ['問題回報', '算出來的金額不對、頁面打不開、通知沒收到。附上帳本名稱與大概發生的時間會快很多。'],
  ['功能建議', '想要的分攤方式、想支援的幣別、覺得哪一步很卡。實際遇到的情境比抽象的需求更有幫助。'],
  ['帳號與資料刪除', '登入後在「設定 → 危險區域 → 刪除帳號」可自行刪除。如果無法登入，來信也能代為處理。'],
  ['廣告與合作', '關於本站廣告版位、內容合作或其他商務洽詢。'],
] as const

export default function ContactPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          name: `聯絡 ${SITE_NAME}`,
          url: `${CANONICAL_SITE_URL}/contact`,
          inLanguage: 'zh-TW',
          mainEntity: {
            '@type': 'Person',
            name: SITE_AUTHOR.name,
            jobTitle: SITE_AUTHOR.role,
            email: `mailto:${SITE_AUTHOR.email}`,
          },
        }}
      />

      <h1 className="text-xl font-bold text-ink mb-2">聯絡我們</h1>
      <p className="text-sm text-ink-3 leading-relaxed mb-8">
        ShareMoney 由個人開發與維護，沒有客服團隊，但每一封信都會看。
        平日通常一到兩個工作天內回覆。
      </p>

      <div className="bg-white rounded-2xl shadow-card p-6 mb-10">
        <p className="text-xs text-ink-3 mb-1.5">電子郵件</p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-base font-semibold text-accent hover:underline break-all"
        >
          {CONTACT_EMAIL}
        </a>
        <p className="text-xs text-ink-3 mt-3 leading-relaxed">
          網站：sharemoney.cc ／ 服務地區：台灣 ／ 語言：繁體中文
          <br />
          開發與維護：{SITE_AUTHOR.name}（{SITE_AUTHOR.role}）
        </p>
      </div>

      <h2 className="text-base font-bold text-ink mb-4">可以寫信來談的事</h2>
      <div className="flex flex-col gap-5">
        {TOPICS.map(([title, body]) => (
          <div key={title}>
            <h3 className="text-sm font-bold text-ink mb-1.5">{title}</h3>
            <p className="text-sm text-ink-2 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <h2 className="text-base font-bold text-ink mt-10 mb-4">附上這些，處理會快很多</h2>
      <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">
        <p>
          回報算錯或畫面異常時，最有用的三件事是：
          <strong className="text-ink">帳本名稱</strong>、
          <strong className="text-ink">發生的大概時間</strong>、
          以及<strong className="text-ink">一張截圖</strong>。
          有這三樣通常一次就能定位；只寫「金額不對」的話，往返會多好幾封信。
        </p>
        <p>
          如果是金額對不上，順便說明你預期的數字是多少、怎麼算出來的。
          很多時候不是系統算錯，而是分攤名單或匯率跟你以為的不一樣——
          兩種計算方式的差別在<Link href="/settlement" className="text-accent hover:underline mx-1">結算原理</Link>
          與<Link href="/articles/rounding-and-remainders" className="text-accent hover:underline mx-1">尾數與那消失的一塊錢</Link>裡有說明。
        </p>
        <p>
          功能建議請盡量描述你實際遇到的情境，而不是想要的按鈕。
          「五個人裡有兩個沒有智慧型手機」這種說法，比「希望增加匿名成員功能」更能讓人想出對的解法。
        </p>
      </div>

      <h2 className="text-base font-bold text-ink mt-8 mb-4">資料與隱私相關的來信</h2>
      <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">
        <p>
          查詢、更正或刪除個人資料的請求，請用你登入 ShareMoney 的同一個信箱寄信，
          這樣才能確認身分。刪除帳號本人隨時可以自己執行（設定 → 危險區域 → 刪除帳號），
          無法登入時來信也能代為處理。
        </p>
        <p>
          資料蒐集的範圍、保存期間與第三方廣告的說明，寫在
          <Link href="/privacy" className="text-accent hover:underline mx-1">隱私政策</Link>；
          服務的使用規範在<Link href="/terms" className="text-accent hover:underline mx-1">服務條款</Link>。
        </p>
      </div>

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        寫信之前，答案可能已經在<Link href="/faq" className="text-accent hover:underline mx-1">常見問題</Link>
        、<Link href="/guide" className="text-accent hover:underline mx-1">使用教學</Link>
        或<Link href="/articles" className="text-accent hover:underline mx-1">分帳文章</Link>裡了。
      </div>
    </main>
  )
}
