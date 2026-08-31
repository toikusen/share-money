export type ArticleSource = {
  title: string
  publisher: string
  url: string
}

export type ArticleEvidence = {
  reviewedAt: string
  methodology: string
  sources: readonly ArticleSource[]
}

const reviewedAt = '2026-08-31'

export const ARTICLE_EVIDENCE = {
  'japan-trip-split-example': {
    reviewedAt,
    methodology:
      '逐列重算文中的 10 筆費用、四人墊付與應攤金額，再把 3 筆轉帳回填；四人的期末餘額皆為 0。匯率比較使用同一組日圓支出分別代入 0.22 與 0.2245，情境與姓名均為示範資料。',
    sources: [],
  },
  'credit-card-fx-rate': {
    reviewedAt,
    methodology:
      '以 Visa 與 Mastercard 官方換算工具核對「卡組織匯率、授權或處理日期、發卡行額外費用、DCC 不適用卡組織換算」四項；文中費率只作試算，實際金額仍以持卡人的發卡行約定與帳單為準。',
    sources: [
      {
        title: '匯率計算機',
        publisher: 'Visa',
        url: 'https://www.visa.com.tw/support/consumer/travel-support/exchange-rate-calculator.html',
      },
      {
        title: 'Currency Exchange Rate Calculator',
        publisher: 'Mastercard',
        url: 'https://www.mastercard.com/content/mccom/eu/en/personal/get-support/currency-exchange-rate-converter.html',
      },
    ],
  },
  'roommate-utilities-split': {
    reviewedAt,
    methodology:
      '電價結構以台電住宅用電說明核對累進級距與夏月期間；5,760 元案例則逐項重算三人的墊付、應攤與兩筆轉帳。案例是算法示範，不代表任何特定住戶的實際帳單。',
    sources: [
      {
        title: '電價知識專區',
        publisher: '台灣電力公司',
        url: 'https://hc2.taipower.com.tw/2289/2363/2388/2389/10732/normalPost',
      },
    ],
  },
  'split-methods-explained': {
    reviewedAt,
    methodology:
      '分別用 3,000 元聚餐、5,760 元公費與 25,000 元共同支出重算均攤、自訂金額、份數和比例；每個案例都檢查各人應攤加總必須等於原始費用，選擇建議屬編輯經驗而非強制規則。',
    sources: [],
  },
  'restaurant-bill-split': {
    reviewedAt,
    methodology:
      '將 3,400 元餐點拆成共享菜與酒，再逐人乘上 10% 服務費；四人應付 1,155、1,155、715、715 元，加總回到帳單總額 3,740 元。其他分法是情境建議，應以現場共識為準。',
    sources: [],
  },
  'large-group-trip': {
    reviewedAt,
    methodology:
      '用 12 人各預收 8,000 元建立 96,000 元公費，逐筆扣除包車、住宿與團體餐後核對結餘 4,500 元；退款與取消規則是可直接改寫的操作範例，不代替旅宿業者條款或團體自行約定。',
    sources: [],
  },
  'rounding-and-remainders': {
    reviewedAt,
    methodology:
      '以 100 ÷ 3 驗證每種尾數分配是否守恆，並用 JavaScript 的 0.1 + 0.2 範例核對二進位浮點誤差。幣別最小單位與實際可轉帳單位可能不同，文中重點是先統一結算單位再分攤。',
    sources: [
      {
        title: 'Number.EPSILON',
        publisher: 'MDN Web Docs',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON',
      },
    ],
  },
  'spreadsheet-vs-app': {
    reviewedAt,
    methodology:
      '依文中欄位設計逐步檢查付款人、分攤名單、單一匯率與淨額守恆四個條件；公式範例以四人旅行為範圍，沒有把個人使用經驗包裝成速度或錯誤率統計。',
    sources: [],
  },
  'company-event-reimbursement': {
    reviewedAt,
    methodology:
      '先分開核對 12 名員工的公司補助與 14 份實際用餐分攤，再以財政部《統一發票使用辦法》確認發票作為記帳憑證的法規背景。各公司的核銷品項、抬頭、載具與入帳時程不同，仍須先問公司會計。',
    sources: [
      {
        title: '統一發票使用辦法',
        publisher: '中華民國財政部',
        url: 'https://law-out.mof.gov.tw/LawContent.aspx?id=FL006084',
      },
    ],
  },
  'couple-shared-expenses': {
    reviewedAt,
    methodology:
      '固定使用月收 60,000／40,000 與共同支出 32,000 的同一情境，比較均攤、收入比例與共同帳戶三種結果，並逐項重算可支配餘額。內容是討論框架，不是財務、婚姻或法律建議。',
    sources: [],
  },
  'asking-for-money-back': {
    reviewedAt,
    methodology:
      '逐句檢查四個訊息範本是否同時包含明細、金額、付款方式與可提出異議的空間；文章只提供溝通選項，不宣稱有催款成功率研究，也不把單一做法描述成適用所有關係。',
    sources: [],
  },
} as const satisfies Record<string, ArticleEvidence>

export const findArticleEvidence = (slug: string): ArticleEvidence | undefined => ARTICLE_EVIDENCE[slug as keyof typeof ARTICLE_EVIDENCE]
