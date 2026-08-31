import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '服務條款 | ShareMoney 分帳',
  description: 'ShareMoney 分帳的服務條款：服務範圍、使用者責任、帳號與資料、免責聲明與條款變更。',
  alternates: { canonical: '/terms' },
}

const UPDATED_AT = '2026-08-31'
const CONTACT_EMAIL = 'sei.tu@neutec.com.tw'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-base font-bold text-ink mb-2">{title}</h2>
      <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <h1 className="text-xl font-bold text-ink mb-1">ShareMoney 服務條款</h1>
      <p className="text-xs text-ink-3 mb-8">最後更新：{UPDATED_AT}</p>

      <Section title="一、關於本服務">
        <p>
          ShareMoney（sharemoney.cc，以下稱「本服務」）是一個共同費用的記帳與結算工具，
          協助使用者記錄一群人共同支出的費用，並計算彼此之間應收應付的金額。
          使用本服務即表示你同意本條款。不同意的話，請停止使用。
        </p>
      </Section>

      <Section title="二、本服務不是金流服務">
        <p>
          本服務<strong className="text-ink">不代收、不代付、不保管任何款項</strong>，
          也不串接銀行、電子支付或信用卡機構。所有結算結果僅為計算建議，
          實際的轉帳與收款由使用者自行透過其他管道完成。
        </p>
        <p>
          使用者之間的債權債務關係屬於當事人之間的私人約定，與本服務無關。
          本服務不介入、不仲裁、也不承擔任何催收或擔保責任。
        </p>
      </Section>

      <Section title="三、帳號">
        <p>
          本服務以 Google 帳號登入。你必須對透過你的帳號所發生的一切活動負責，
          並確保登入用的 Google 帳號安全。發現帳號遭盜用時請儘速來信告知。
        </p>
        <p>
          你可以隨時在「設定 → 危險區域 → 刪除帳號」刪除帳號。
          刪除的效果與資料保留範圍寫在<Link href="/privacy" className="text-accent hover:underline mx-1">隱私政策</Link>。
        </p>
      </Section>

      <Section title="四、你輸入的內容">
        <p>
          帳本名稱、費用紀錄、備註等內容由你自行輸入，你必須確保這些內容合法，
          且不侵害他人的權利。請勿在備註等欄位輸入他人的身分證字號、金融卡密碼等敏感個資。
        </p>
        <p>
          你保留自己輸入內容的權利。為了提供服務（例如向同帳本成員顯示、進行計算與備份），
          你授權本服務在必要範圍內處理這些內容。
        </p>
        <p>
          共同帳本中的費用紀錄屬於該帳本成員共有。你刪除帳號時，這些紀錄會以匿名形式保留，
          讓其他成員仍能正確結算。
        </p>
      </Section>

      <Section title="五、禁止的使用方式">
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>從事詐欺、洗錢或其他違法行為。</li>
          <li>未經授權存取他人帳本，或試圖規避權限控管。</li>
          <li>以自動化程式大量發送請求，影響服務穩定。</li>
          <li>對本服務進行還原工程、干擾或破壞。</li>
        </ul>
        <p>違反上述任一項時，我們可以在不事先通知的情況下暫停或終止你的帳號。</p>
      </Section>

      <Section title="六、計算結果的正確性">
        <p>
          本服務會依據你輸入的資料進行計算，計算方式公開說明於
          <Link href="/settlement" className="text-accent hover:underline mx-1">結算原理</Link>。
          但輸入資料是否正確（金額、付款人、分攤對象、匯率）由使用者自行負責。
        </p>
        <p>
          匯率資料來自第三方來源，僅供參考，可能與你實際的信用卡帳單或換匯結果有落差。
          結算前建議以實際帳單的匯率更新一次。
        </p>
      </Section>

      <Section title="七、廣告">
        <p>
          本服務目前未載入或顯示第三方廣告。未來若啟用 Google AdSense，只會評估在有完整原創內容的
          公開頁面顯示；登入、邀請、錯誤、法律文件與登入後帳本不放廣告。第三方廣告的 Cookie、資料處理
          與責任範圍將依<Link href="/privacy" className="text-accent hover:underline mx-1">隱私政策</Link>辦理。
        </p>
      </Section>

      <Section title="八、服務可用性與免責">
        <p>
          本服務以「現狀」提供，不保證不中斷、無錯誤，也不保證能永久維持。
          我們可能因維護、升級或不可抗力而暫停服務，並保留隨時修改或終止部分功能的權利。
        </p>
        <p>
          在法律允許的最大範圍內，對於使用或無法使用本服務所導致的任何間接、附帶或衍生性損失
          （包含但不限於資料遺失、金錢損失、使用者之間的糾紛），本服務不負賠償責任。
        </p>
        <p>重要資料請自行留存備份。</p>
      </Section>

      <Section title="九、條款變更">
        <p>
          本條款如有修改，會更新本頁面與上方的「最後更新」日期。修改後繼續使用本服務，
          視為你接受修改後的條款。
        </p>
      </Section>

      <Section title="十、準據法">
        <p>
          本條款以中華民國（台灣）法律為準據法。因本條款所生的爭議，
          以台灣台北地方法院為第一審管轄法院。
        </p>
      </Section>

      <Section title="十一、聯絡方式">
        <p>
          對本條款有任何疑問，請來信{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>。
        </p>
      </Section>
    </main>
  )
}
