import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '使用教學 | ShareMoney 分帳',
  description: '從建立帳本、邀請成員、記一筆費用到一鍵結算，ShareMoney 分帳的完整使用說明。',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-ink mb-2">{title}</h2>
      <div className="text-sm text-ink-2 leading-relaxed flex flex-col gap-2.5">{children}</div>
    </section>
  )
}

export default function GuidePage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <h1 className="text-xl font-bold text-ink mb-2">ShareMoney 使用教學</h1>
      <p className="text-sm text-ink-3 mb-8">
        一群人一起花錢，最麻煩的從來不是付錢，而是事後算錢。這頁說明怎麼用 ShareMoney
        把一趟旅行、一頓聚餐、一整個月的室友公費記清楚，最後用最少的轉帳次數結清。
      </p>

      <Section title="一、建立帳本">
        <p>
          帳本是所有費用的容器。一件事開一本帳：一趟東京五日遊、一次社團迎新、一間房子的水電網路，
          彼此不會混在一起，結算時也只會算同一本帳裡的成員。
        </p>
        <p>
          建立時先選帳本類型——旅遊、社團活動、公司活動、聚餐、日常／合租、其他。類型只影響顯示圖示與表單預設值，
          不會改變任何金額計算：選「旅遊」預設是多天日期區間並開啟外幣，選「聚餐」預設單日、不開外幣，
          選「日常／合租」預設不指定日期。這些預設你都可以當場改掉，改過之後切換類型也不會被蓋回去。
        </p>
        <p>
          日期是選填的。填成跨 2～16 天的區間，帳本頁會多出一張「每日支出」長條圖，看得出哪一天花最兇；
          長期性的帳本（例如室友公費）就留空不指定。
        </p>
      </Section>

      <Section title="二、邀請成員">
        <p>
          在帳本頁按「邀請成員」會產生一組邀請連結，把連結傳給同行的人，對方用 Google 帳號登入後就會加入這本帳。
          連結只對這本帳有效，沒有拿到連結的人看不到你們的費用。
        </p>
        <p>
          成員加入後就能記帳、也能被列為分攤對象。已經記過的費用不會因為新成員加入而重新分攤——
          誰參與哪一筆，是記帳當下選定的。
        </p>
      </Section>

      <Section title="三、記一筆費用">
        <p>每筆費用要填四件事：名稱、付款時間、金額、由誰付款。付款人預設是你自己，可以改成任何一位成員——
          幫別人代填也沒問題。備註可留空。
        </p>
        <p>
          接著選這筆要由誰分攤。預設「均攤」：勾選的成員平均分，除不盡的餘數會落在第一位成員身上，
          所以三個人分 100 元會是 34 / 33 / 33，總和永遠等於原金額，不會因為四捨五入而少掉一塊。
        </p>
        <p>
          如果不是平均分——例如兩個人吃到飽、一個人只喝飲料——切到「自訂金額」逐一輸入，
          系統會即時顯示已分配與剩餘金額，湊不齊時不會讓你送出。
        </p>
      </Section>

      <Section title="四、外幣與匯率">
        <p>
          出國時費用是外幣計價的。帳本開啟「使用外幣記帳」後，選定幣別（日圓、韓元、美元、越南盾等），
          系統會自動帶入當下的即時匯率，你也可以手動改成信用卡帳單上的實際匯率。
        </p>
        <p>
          記帳時可以直接輸入日圓金額，畫面上同時顯示換算後的台幣。所有結算都以台幣為基準計算，
          外幣只是輸入與顯示的方便，不會產生第二套帳。改匯率會讓整本帳的台幣金額一起重算，
          所以建議回國拿到帳單後再更新一次匯率，數字最準。
        </p>
      </Section>

      <Section title="五、分帳確認機制">
        <p>
          別人把你列為分攤對象時，你會收到待確認的項目。你可以確認，也可以提出異議——
          「這筆我沒吃到」「金額好像記錯了」。在確認之前，這筆對你的分攤仍會計入結算，
          但帳目上看得出還沒獲得所有人同意，避免事後才發現有人根本不知道自己被算了一筆。
        </p>
      </Section>

      <Section title="六、一鍵結算">
        <p>
          結算頁會先算出每個人的淨額（自己墊付的總額減掉自己該分攤的總額），再推導出「誰該轉給誰、轉多少」，
          並且盡量減少轉帳筆數——三個人互相欠來欠去，通常兩筆轉帳就能結清。
          演算法細節寫在<Link href="/settlement" className="text-accent hover:underline">結算原理</Link>。
        </p>
        <p>
          轉完帳後按「記錄還款」，這筆還款會以一筆結算紀錄寫回帳本，之後的餘額就會歸零，
          不需要手動刪掉任何費用。
        </p>
      </Section>

      <Section title="七、即時同步與通知">
        <p>
          同一本帳裡有人新增費用，其他成員的畫面會即時更新，不用重新整理。
          開啟推播通知後，有人找你確認、或你的費用有結果時會收到提醒。
          通知可以隨時在設定頁關掉。
        </p>
      </Section>

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        還有問題？看<Link href="/faq" className="text-accent hover:underline mx-1">常見問題</Link>
        或直接<Link href="/login" className="text-accent hover:underline mx-1">登入開一本帳試試</Link>。
      </div>
    </main>
  )
}
