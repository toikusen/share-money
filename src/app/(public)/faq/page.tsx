import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '常見問題 | ShareMoney 分帳',
  description: 'ShareMoney 分帳的常見問題：費用、隱私、外幣匯率、成員邀請、資料刪除與離線使用。',
}

const QA: ReadonlyArray<readonly [string, React.ReactNode]> = [
  [
    'ShareMoney 要錢嗎？',
    <>目前所有功能都免費，包含帳本數量、成員人數與費用筆數，都沒有上限或付費牆。</>,
  ],
  [
    '只有旅遊可以用嗎？',
    <>
      不是。帳本類型有旅遊、社團活動、公司活動、聚餐、日常／合租和其他六種，
      類型只影響圖示與表單預設值（例如旅遊預設多天日期並開啟外幣、聚餐預設單日），
      計算邏輯完全一樣。室友分攤水電、公司團購、社團出遊都是常見用法。
    </>,
  ],
  [
    '一定要每個人都註冊嗎？',
    <>
      要一起看帳和確認費用的人需要用 Google 帳號登入。但你可以先自己把費用都記進去、
      指定其他人為分攤對象，等他們之後用邀請連結加入時就會看到完整的帳。
    </>,
  ],
  [
    '金額不是平均分怎麼辦？',
    <>
      記費用時切到「自訂金額」，逐一輸入每個人分攤多少，系統會即時檢查總和是否等於費用金額。
      也可以只勾選部分成員——沒吃到那餐的人不勾就是了。
    </>,
  ],
  [
    '外幣匯率是即時的嗎？可以自己改嗎？',
    <>
      建立帳本或更新匯率時會自動帶入當下的即時匯率，你隨時可以手動改成信用卡帳單上的實際數字。
      改了之後整本帳的台幣金額會一起重算，所以建議回國拿到帳單後再更新一次最準。
    </>,
  ],
  [
    '已經轉帳還錢了，要把費用刪掉嗎？',
    <>
      不用。在結算頁按「記錄還款」就好，系統會寫入一筆結算紀錄讓餘額歸零，
      原本的費用紀錄完整保留，之後回頭查帳才看得出當初發生過什麼。
    </>,
  ],
  [
    '別人可以看到我的其他帳本嗎？',
    <>
      不行。每本帳只有被邀請加入的成員看得到，資料庫層級（Row Level Security）就擋住了非成員的讀取，
      不是只有畫面上不顯示而已。
    </>,
  ],
  [
    '你們會看到我的消費紀錄或拿去賣嗎？',
    <>
      不會分享或販售。我們蒐集的是登入用的 Email、姓名，以及你自己輸入的費用內容，
      用途只有讓 app 運作。你的帳目資料不會提供給廣告商，也不會用來做廣告鎖定。細節寫在
      <Link href="/privacy" className="text-accent hover:underline mx-1">隱私政策</Link>。
    </>,
  ],
  [
    '為什麼有廣告？帳本裡也會有嗎？',
    <>
      ShareMoney 免費、沒有付費牆，伺服器與網域的成本靠公開頁面上的 Google AdSense 廣告分擔。
      廣告只出現在首頁、計算機與說明類頁面，
      <strong className="text-ink">登入後的帳本、費用清單與結算畫面不會插廣告</strong>。
      廣告 Cookie 的說明與關閉方式見
      <Link href="/privacy#advertising" className="text-accent hover:underline mx-1">隱私政策的第三方廣告一節</Link>。
    </>,
  ],
  [
    '可以刪除我的帳號和資料嗎？',
    <>
      可以，隨時都能刪。在 app 內的「設定 → 刪除帳號」執行，你的帳號與相關資料會被移除。
      刪除入口與說明同樣在<Link href="/privacy#account-deletion" className="text-accent hover:underline mx-1">隱私政策</Link>裡。
    </>,
  ],
  [
    '沒網路的時候可以用嗎？',
    <>
      ShareMoney 是 PWA，介面會被快取所以開得起來，但記帳與結算需要連線才能同步給其他成員。
      建議在有網路時補記，避免兩個人各自離線編輯造成衝突。
    </>,
  ],
  [
    '要裝 app 嗎？還是網頁就能用？',
    <>
      網頁直接就能用。你也可以從瀏覽器把它加到主畫面，或安裝 Android 版；
      兩邊是同一個服務、同一份資料，換裝置登入同一個 Google 帳號就看得到。
    </>,
  ],
  [
    '有人記錯金額怎麼辦？',
    <>
      費用可以編輯或刪除，帳本也有活動紀錄可以回頭看誰改過什麼。
      如果你是被分攤的人而覺得金額不對，可以直接對那筆提出異議，付款人就會收到通知。
    </>,
  ],
]

export default function FaqPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <h1 className="text-xl font-bold text-ink mb-2">常見問題</h1>
      <p className="text-sm text-ink-3 mb-8">
        關於 ShareMoney 分帳最常被問到的十幾個問題。找不到答案的話，
        歡迎寫信到 <span className="text-ink-2">sei.tu@neutec.com.tw</span>。
      </p>

      <div className="flex flex-col gap-6">
        {QA.map(([q, a]) => (
          <div key={q}>
            <h2 className="text-sm font-bold text-ink mb-1.5">{q}</h2>
            <p className="text-sm text-ink-2 leading-relaxed">{a}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-line pt-6 mt-10 text-sm text-ink-3">
        想看完整流程說明，請看<Link href="/guide" className="text-accent hover:underline mx-1">使用教學</Link>
        與<Link href="/settlement" className="text-accent hover:underline mx-1">結算原理</Link>。
      </div>
    </main>
  )
}
