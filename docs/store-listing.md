# Store Listing — ShareMoney

上架用素材與表單答案。Play Store 先行；iOS 欄位相同文案可重用。

## 基本資訊

| 欄位 | 值 |
|---|---|
| App 名稱（30 字內） | ShareMoney 分帳 |
| 簡短說明（80 字內） | 旅遊、聚餐、社團、合租都好用的分帳神器：記帳、分帳、結算一次搞定，即時同步。 |
| 類別 | 財經 |
| 隱私政策 URL | https://share-money.tuyucheng0407.workers.dev/privacy |
| 帳號刪除 URL（Play 必填） | https://share-money.tuyucheng0407.workers.dev/privacy#account-deletion |
| 聯絡 email | sei.tu@neutec.com.tw |

## 完整說明（4000 字內）

```
和朋友出遊、聚餐、社團出帳，誰付了門票、誰墊了晚餐，結算總是一團亂？
ShareMoney 讓分帳變簡單：

📒 一個活動一本帳
旅遊、聚餐、社團、公司活動、日常合租都能建帳本，邀請成員，所有費用集中在同一本帳。

💸 彈性分帳
每筆費用可指定付款人與分攤成員，出國旅遊可開啟外幣匯率換算。

✅ 分帳確認機制
成員可確認或提出異議，帳目透明沒糾紛。

📊 一鍵結算
自動計算每個人該收該付的金額，用最少的轉帳次數結清。

🔔 即時同步與推播
成員新增費用立即同步，重要變動推播提醒。

🔒 資料安全
使用 Google 帳號登入，資料加密傳輸，可隨時刪除帳號。
```

## Data safety form（Google Play）

| 問題 | 答案 |
|---|---|
| 是否蒐集或分享使用者資料 | 蒐集，不分享 |
| 個人資訊 | Email、姓名（Google 登入）— 帳號管理必要，非廣告用途 |
| 財務資訊 | 「使用者付款資訊」不蒐集；費用紀錄屬使用者自行輸入內容 → 申報為「其他使用者產生內容」 |
| App 活動 | 不蒐集（無 analytics SDK） |
| 裝置識別碼 | 不蒐集 |
| 位置 | 不蒐集 |
| 資料加密傳輸 | 是（HTTPS） |
| 使用者可要求刪除資料 | 是（app 內設定 → 刪除帳號；或帳號刪除 URL） |

## 截圖需求

Play Store：手機截圖至少 2 張（16:9 或 9:16，最短邊 ≥ 320px、最長邊 ≤ 3840px）。

建議畫面（皆用示範資料，避免真實 email／姓名入鏡）：

1. 帳本列表（多種類型的帳本卡片）
2. 帳本明細 — 費用列表
3. 新增費用（分帳成員選擇）
4. 結算頁（誰付誰多少）
5. 活動紀錄／通知

產生方式：Chrome DevTools device mode 以 Pixel 尺寸（1080×2400）截圖即可。

另需：
- 應用程式圖示 512×512 PNG（已有 `public/icon-512.png`）
- 主題圖片（feature graphic）1024×500 PNG — 待製作

## iOS 補充（後續）

- Privacy Nutrition Labels：對應上表（Contact Info: Email/Name — App Functionality；User Content: Other — App Functionality；皆 Linked to user、非 Tracking）
- 截圖需 6.9" 與 6.5" 兩種尺寸
- 帳號刪除入口已符合 App Store 審查規範 5.1.1(v)
