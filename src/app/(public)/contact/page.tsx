import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '聯絡我們 | ShareMoney 分帳',
  description: 'ShareMoney 分帳的聯絡方式：問題回報、功能建議、帳號與資料刪除、廣告與合作洽詢。',
  alternates: { canonical: '/contact' },
}

const CONTACT_EMAIL = 'sei.tu@neutec.com.tw'

const TOPICS = [
  ['問題回報', '算出來的金額不對、頁面打不開、通知沒收到。附上帳本名稱與大概發生的時間會快很多。'],
  ['功能建議', '想要的分攤方式、想支援的幣別、覺得哪一步很卡。實際遇到的情境比抽象的需求更有幫助。'],
  ['帳號與資料刪除', '登入後在「設定 → 危險區域 → 刪除帳號」可自行刪除。如果無法登入，來信也能代為處理。'],
  ['廣告與合作', '關於本站廣告版位、內容合作或其他商務洽詢。'],
] as const

export default function ContactPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
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

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        寫信之前，答案可能已經在<Link href="/faq" className="text-accent hover:underline mx-1">常見問題</Link>
        或<Link href="/guide" className="text-accent hover:underline mx-1">使用教學</Link>裡了。
      </div>
    </main>
  )
}
