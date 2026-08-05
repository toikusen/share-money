import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '隱私政策 | ShareMoney',
  description: 'ShareMoney 分帳工具的隱私政策與帳號刪除說明',
}

const UPDATED_AT = '2026-08-03'
const CONTACT_EMAIL = 'sei.tu@neutec.com.tw'

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-7">
      <h2 className="text-base font-bold text-ink mb-2">{title}</h2>
      <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <h1 className="text-xl font-bold text-ink mb-1">ShareMoney 隱私政策</h1>
      <p className="text-xs text-ink-3 mb-8">最後更新：{UPDATED_AT}</p>

      <Section title="我們是誰">
        <p>
          ShareMoney 是一個分帳工具，協助你與其他成員記錄共同費用並結算分帳。本政策說明我們如何蒐集、使用與保護你的資料。
        </p>
      </Section>

      <Section title="我們蒐集的資料">
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>
            <strong className="text-ink">帳號資訊</strong>：你以 Google 帳號登入時提供的電子郵件地址、顯示名稱與頭像。
          </li>
          <li>
            <strong className="text-ink">你輸入的內容</strong>：帳本名稱、費用紀錄、分帳明細與相關備註。
          </li>
          <li>
            <strong className="text-ink">推播訂閱資訊</strong>：若你開啟通知，我們會儲存瀏覽器產生的推播訂閱端點，用於傳送費用相關通知。
          </li>
          <li>
            <strong className="text-ink">收款帳戶（選填）</strong>：你可以在設定中儲存銀行代碼、帳號與戶名，僅用於在結算時向與你同帳本的成員顯示收款方式，方便對方轉帳給你。此資料只有同帳本成員可見，可隨時在設定中刪除；刪除帳號時也會一併永久刪除。我們不會蒐集網路銀行帳號密碼、OTP 或金融卡資訊。
          </li>
        </ul>
        <p>
          我們自己不蒐集精確位置、通訊錄或廣告識別碼，也沒有在服務中安裝分析工具。
          網站的公開頁面與登入後的畫面會顯示第三方廣告，相關的資料處理見下方「第三方廣告」一節。
        </p>
      </Section>

      <Section title="資料的使用方式">
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>提供分帳功能：向同一帳本的成員顯示你的名稱、頭像與費用紀錄。</li>
          <li>傳送通知：在有新費用或分帳變動時推播提醒（可隨時在設定中關閉）。</li>
          <li>我們不會將你的資料出售或提供給第三方作行銷用途。</li>
        </ul>
      </Section>

      <Section title="資料儲存與委託處理">
        <p>
          資料儲存於 Supabase（資料庫與登入驗證）並透過 Cloudflare 提供服務。登入採用 Google OAuth，我們不會取得或儲存你的 Google 密碼。
        </p>
      </Section>

      <Section title="第三方廣告" id="advertising">
        <p>
          ShareMoney 免費提供，營運成本由網站上的第三方廣告分擔。我們使用 Google AdSense
          在<strong className="text-ink">公開頁面</strong>（首頁、分帳計算機、使用教學、結算原理、常見問題等）
          與<strong className="text-ink">登入後的帳本畫面</strong>顯示廣告。登入與邀請頁面不放廣告。
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>
            Google 等第三方供應商會使用 Cookie，根據你先前造訪本網站或其他網站的紀錄放送廣告。
          </li>
          <li>
            使用廣告 Cookie 可讓 Google 及其合作夥伴根據你造訪本網站與網路上其他網站的情況放送廣告。
          </li>
          <li>
            我們<strong className="text-ink">不會</strong>把你的帳號資訊、帳本名稱或費用內容傳送給廣告商，
            也不會用你的帳目資料做廣告鎖定。
          </li>
        </ul>
        <p>
          你可以前往{' '}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Google 廣告設定
          </a>{' '}
          停用個人化廣告，或到{' '}
          <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            aboutads.info
          </a>{' '}
          管理第三方供應商的 Cookie。停用個人化廣告後仍會看到廣告，只是與你的興趣關聯較低。
        </p>
        <p>
          Google 如何在合作夥伴網站使用資料，說明於{' '}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            policies.google.com/technologies/partner-sites
          </a>。
        </p>
      </Section>

      <Section title="資料保留與刪除" id="account-deletion">
        <p>
          你可以隨時刪除帳號：在 app 內前往「<strong className="text-ink">設定 → 危險區域 → 刪除帳號</strong>」，確認後立即生效。
        </p>
        <p>刪除帳號時：</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>你的登入帳號、電子郵件、顯示名稱、頭像、收款帳戶與推播訂閱會被永久刪除。</li>
          <li>
            你在共同帳本中的費用與分帳紀錄屬於帳本成員共有，會以匿名形式（顯示為「已刪除使用者」）保留，讓其他成員仍能正確結算；這些紀錄不再包含任何可識別你的資訊。
          </li>
        </ul>
        <p>
          若無法登入 app，也可來信 <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a> 申請刪除帳號與資料。
        </p>
      </Section>

      <Section title="兒童隱私">
        <p>本服務不以未滿 13 歲兒童為對象，我們不會刻意蒐集兒童的個人資料。</p>
      </Section>

      <Section title="政策變更">
        <p>本政策如有重大變更，會更新本頁面並修改上方的「最後更新」日期。</p>
      </Section>

      <Section title="聯絡我們">
        <p>
          對本政策或你的資料有任何疑問，請來信{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a>。
        </p>
      </Section>

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        另請參閱<Link href="/terms" className="text-accent hover:underline mx-1">服務條款</Link>
        與<Link href="/about" className="text-accent hover:underline mx-1">關於我們</Link>。
      </div>
    </main>
  )
}
