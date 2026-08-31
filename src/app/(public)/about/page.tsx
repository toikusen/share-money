import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/JsonLd'
import { SITE_AUTHOR, SITE_NAME } from '@/lib/site'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

export const metadata: Metadata = {
  title: '關於 ShareMoney | 這個分帳工具是誰做的、為什麼做',
  description: 'ShareMoney 是一個由個人開發者維護的共同費用分帳工具，說明它的由來、設計取捨、營運方式與聯絡方式。',
  alternates: { canonical: '/about' },
}

const CONTACT_EMAIL = SITE_AUTHOR.email

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-ink mb-2">{title}</h2>
      <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">{children}</div>
    </section>
  )
}

export default function AboutPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: `關於 ${SITE_NAME}`,
          url: `${CANONICAL_SITE_URL}/about`,
          inLanguage: 'zh-TW',
          mainEntity: {
            '@type': 'Person',
            name: SITE_AUTHOR.name,
            jobTitle: SITE_AUTHOR.role,
            email: `mailto:${SITE_AUTHOR.email}`,
            url: `${CANONICAL_SITE_URL}/about`,
          },
        }}
      />

      <h1 className="text-xl font-bold text-ink mb-2">關於 ShareMoney</h1>
      <p className="text-sm text-ink-3 mb-8">
        ShareMoney（sharemoney.cc）是一個共同費用的記帳與結算工具，由個人開發與維護，目前免費提供。
      </p>

      <Section title="誰在做這個">
        <p>
          ShareMoney 由 <strong className="text-ink">{SITE_AUTHOR.name}</strong> 一個人開發與維護——
          設計、前後端、資料庫、部署，還有這個網站上的每一篇文章，都是同一個人寫的。
          沒有公司、沒有團隊、也沒有客服，所以功能推得慢，但每一封信都會看。
        </p>
        <p>
          網站上的文章寫的是自己遇過、或身邊的人抱怨過的分帳問題：
          團體旅行的外幣對帳、室友夏天的電費、代墊了三個月的錢怎麼開口要回來。
          文章裡的金額都是示範用的，不是真實的人或消費紀錄，
          但情境跟算法是真的。有寫錯的地方，來信會更正。
        </p>
        <p>
          聯絡方式：
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline mx-1">{CONTACT_EMAIL}</a>
          。所有文章列在<Link href="/articles" className="text-accent hover:underline mx-1">分帳文章</Link>。
        </p>
      </Section>

      <Section title="為什麼做這個">
        <p>
          起因是一趟四個人的日本旅行。機票是其中一個人統一刷卡訂的，住宿另一個人訂，
          當地的車票、餐費、藥妝店則是誰方便誰先付。回國之後開了一份共用試算表，
          花了一個晚上才把帳對完——中間還為了「那餐有沒有算到提早回飯店的人」重算了兩次。
        </p>
        <p>
          麻煩的其實不是加減乘除，是三件事：費用發生的當下沒被記下來、記下來的地方別人看不到、
          以及最後每一筆各自還導致轉帳次數暴增。ShareMoney 就是針對這三件事做的。
        </p>
      </Section>

      <Section title="設計上的幾個取捨">
        <p>
          <strong className="text-ink">一件事開一本帳。</strong>
          不做「全域好友」與跨帳本的總欠款，因為那會讓人搞不清楚自己現在到底在算哪一筆。
          一趟旅行、一次聚餐、一間房子的水電，各自獨立。
        </p>
        <p>
          <strong className="text-ink">結算以台幣為基準。</strong>
          外幣只是輸入與顯示的方便，不會產生第二套帳。匯率可以手動改成信用卡帳單上的實際數字，
          改了整本帳一起重算，避免出現「app 說我該付 3,180，帳單上卻是 3,240」這種對不起來的狀況。
        </p>
        <p>
          <strong className="text-ink">分攤要經過當事人確認。</strong>
          被列為分攤對象的人看得到、可以提出異議。這一步稍微增加了流程的長度，
          但它擋掉的是「結算當天才有人說我沒吃到那餐」，換來的安寧值得。
        </p>
        <p>
          <strong className="text-ink">不做的事：</strong>
          不串接銀行或電子支付、不代收付款項、不碰任何金流。ShareMoney 只負責告訴你該轉多少給誰，
          轉帳這件事你自己用網銀完成。
        </p>
      </Section>

      <Section title="技術與資料">
        <p>
          網站以 Next.js 開發，部署在 Cloudflare，資料庫與登入驗證使用 Supabase，
          登入採 Google OAuth，我們不會取得你的 Google 密碼。
        </p>
        <p>
          帳本的存取限制是在資料庫層級（Row Level Security）實作的，不是只有畫面上不顯示——
          非成員即使直接打 API 也讀不到別人的帳本。詳細的資料處理方式寫在
          <Link href="/privacy" className="text-accent hover:underline mx-1">隱私政策</Link>。
        </p>
      </Section>

      <Section title="文章怎麼寫與核對">
        <p>
          每篇文章都由 {SITE_AUTHOR.name} 撰寫與複查。文中的人物、行程與消費金額是為了說明算法而設計的案例，
          不會把示範資料寫成真實個案；可重算的文章會檢查分攤總額、個人淨額與最後轉帳是否守恆。
        </p>
        <p>
          遇到電價、發票規則、信用卡換算等可由外部驗證的內容，優先引用主管機關或服務提供者的一手資料，
          並在文章底部列出核對方法、主要來源與實質複查日期。個人經驗與建議會明確寫成情境選項，不冒充統計或法規。
        </p>
        <p>
          若發現算式、來源或敘述有誤，請寄到{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>。
          確認後會修正文章並更新實質複查日期。
        </p>
      </Section>

      <Section title="怎麼營運下去">
        <p>
          ShareMoney 目前對使用者完全免費，沒有付費方案，也不打算把功能拆成付費牆。
          網站正在申請 Google AdSense；審核期間不載入廣告程式，也不顯示廣告。
        </p>
        <p>
          未來若啟用，只會評估放在有完整原創內容的公開頁面；登入、邀請、錯誤、法律文件與登入後帳本
          都不放廣告，也不會把你輸入的費用內容提供給廣告商或用來做廣告鎖定。
        </p>
      </Section>

      <Section title="聯絡">
        <p>
          問題回報、功能建議、合作或任何疑問，請來信{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>，
          或看<Link href="/contact" className="text-accent hover:underline mx-1">聯絡我們</Link>。
        </p>
      </Section>

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        想先看看它怎麼運作，可以直接用<Link href="/calculator" className="text-accent hover:underline mx-1">分帳計算機</Link>
        或讀<Link href="/guide" className="text-accent hover:underline mx-1">使用教學</Link>。
      </div>
    </main>
  )
}
