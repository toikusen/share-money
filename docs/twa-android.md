# Android TWA 上架流程

## 已完成（2026-07-07）

- 環境：JDK 17（`/opt/homebrew/opt/openjdk@17`）、Android SDK（`/opt/homebrew/share/android-commandlinetools`）、Bubblewrap CLI（global）
- TWA 設定：`android-twa/twa-manifest.json`，package id `com.tuyucheng.sharemoney`
- Upload keystore：`android-twa/android.keystore`，密碼在 `android-twa/keystore.env`（皆已 gitignore，**兩個檔案都要備份**）
- 產出：`android-twa/app-release-bundle.aab`（上傳 Play 用）、`app-release-signed.apk`（本機裝置測試用）
- `public/.well-known/assetlinks.json` 已部署，含 upload key 指紋；**Play App Signing 指紋還是 placeholder**

重新 build（改 twa-manifest.json 後）：

```bash
cd android-twa
bubblewrap update --skipVersionUpgrade   # 或不加 flag 讓它升 versionCode
set -a && source keystore.env && set +a
bubblewrap build --skipPwaValidation
```

注意：gradle 用的 SDK 路徑在 `android-twa/local.properties`（`sdk.dir` 指向標準 SDK root）；
`~/.bubblewrap/config.json` 的 `androidSdkPath` 指向 `cmdline-tools/latest` 是給 bubblewrap 自己的路徑驗證用，兩者不同是刻意的。

## 商店素材與示範資料（2026-07-15 完成）

- 截圖 6 張＋feature graphic 已產出：`docs/store-assets/`（規格見 store-listing.md；
  2026-07-22 重拍，改成多種帳本類型，不再只有旅遊）
- 示範資料在**正式 Supabase**：使用者 `demo-ming/demo-hua/demo-mei@sharemoney.demo`
  （王小明／林小華／張小美）＋東京五日遊／週五燒肉聚餐／室友公費／攝影社迎新四本帳。
  UI 只有 Google 登入，這些帳號進不了 app，僅供截圖用（session cookie 注入）；
  審查員用的測試帳號仍需另建一個真的 Google 帳號。
- 重產截圖：跑 `scripts/seed-demo-data.mjs`（可重複執行；建資料＋換 session；輸出在已忽略的
  `scripts/session.json`）→ 把 session JSON
  以 `base64-` + base64url 編成 `sb-<ref>-auth-token` cookie 注入瀏覽器 → 360×800@3x 截圖。
- 上架後可清示範資料：刪 trips（cascade）＋ auth.admin 刪三個 demo user。

## 剩餘步驟（需要 Google 帳號）— 詳細版

> 選單名稱以 Play Console 2026 介面為準，小改版後位置可能略有不同。

### 0. 註冊開發者帳號（一次性）

1. 前往 https://play.google.com/console/signup，用要長期持有的 Google 帳號登入
2. 選帳號類型：**個人**（除非有公司統編要用組織帳號）
3. 付 US$25 註冊費（信用卡），填開發者名稱（商店上顯示的名稱，例如 `Tuyucheng`）
4. 完成**身分驗證**：上傳身分證件（護照/身分證），通常數小時～2 天內通過
5. ⚠️ **2023-11-13 後註冊的個人帳號**：正式上架前必須先完成封閉測試——
   **12 位測試員連續 opt-in 且實際使用 14 天**，之後才能在 Dashboard 申請
   production access。找朋友同事湊滿 12 人，中途掉到 12 以下天數可能重算。
   （組織帳號無此要求）

### 1. 建立應用程式

1. Play Console → 所有應用程式 → **建立應用程式**
2. 應用程式名稱：`ShareMoney 旅遊分帳`
3. 預設語言：`中文（繁體）– zh-TW`
4. 類型：**應用程式**；價格：**免費**（上架後不能改成付費）
5. 勾兩個聲明（開發人員計畫政策、美國出口法規）→ 建立

### 2. 內部測試 release（先上傳，很多後續表單會引用它）

1. 左側 **測試與發布 → 測試 → 內部測試** → 建立新版本
2. 首次會問 **Play 應用程式簽署**：選預設「**使用 Google 產生的應用程式簽署金鑰**」→ 繼續
3. 上傳 `android-twa/app-release-bundle.aab`
4. 版本資訊（release notes）隨意填，例：`首個內部測試版`
5. 儲存並發布到內部測試
6. **測試人員**分頁 → 建立 email 名單，加自己的 Gmail → 儲存
7. 複製「**加入測試計畫**」連結，用手機開啟 → 接受 → 從 Play 商店安裝

### 3. 回填 Play App Signing 指紋（去掉網址列的關鍵）

1. **測試與發布 → 設定 → 應用程式完整性（App integrity）→ Play 應用程式簽署** 分頁
2. 「應用程式簽署金鑰憑證」區塊 → 複製 **SHA-256 憑證指紋**
3. 取代 `public/.well-known/assetlinks.json` 裡的 `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`
   （保留第二條 upload key 指紋，本機直裝 APK 測試會用到）
4. 部署：`npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`
5. 驗證：https://developers.google.com/digital-asset-links/tools/generator
   填 host `sharemoney.cc`、package `com.tuyucheng.sharemoney`、貼上指紋 → Test statement
6. 手機上**移除重裝** app（Android 會快取驗證結果）→ 開啟後上方不應出現 Chrome 網址列

### 4. 主商店資訊（成長 → 商店發布 → 主商店資訊）

照 `docs/store-listing.md` 貼：

| 欄位 | 內容 |
|---|---|
| 應用程式名稱 | ShareMoney 旅遊分帳 |
| 簡短說明 | store-listing.md 的 80 字版 |
| 完整說明 | store-listing.md 的完整版 |
| 應用程式圖示 | `public/icon-512.png`（512×512） |
| 主題圖片 | 1024×500 PNG（待製作） |
| 手機截圖 | 至少 2 張（1080×2400 直式） |

### 5. 商店設定與應用程式內容聲明

**成長 → 商店發布 → 商店設定**：
- 類別：**旅遊與地方資訊**（建議避開「財經」——會多一份金融功能聲明與較嚴審查；ShareMoney 只是記帳，不涉金融服務）
- 聯絡 email：sei.tu@neutec.com.tw

**監控與管理 → 政策 → 應用程式內容**，逐項填：

| 項目 | 答案 |
|---|---|
| 隱私政策 | `https://sharemoney.cc/privacy` |
| 應用程式存取權 | 「全部或部分功能受限」→ 提供**測試用 Google 帳號**（帳密 + 說明「以此 Google 帳號登入即可」；審查員要能登入） |
| 廣告 | 不含廣告 |
| 內容分級 | 填問卷：類別選「公用程式/生產力」，暴力/性/賭博全部否 → 會拿到 3+ |
| 目標對象 | 18 歲以上（或 13+；不要勾兒童） |
| 新聞應用程式 | 否 |
| 資料安全 | 照 `docs/store-listing.md` 的表逐題填 |
| 帳號刪除 | 「提供帳號刪除」→ URL 填 `https://sharemoney.cc/privacy#account-deletion` |

⚠️ 應用程式存取權需要一組審查員能用的 Google 測試帳號——建一個測試用 Gmail，先在 app 裡登入過一次確認可用。

### 6. 實機驗證清單（內部測試版）

- [ ] Google 登入（TWA 內開啟 OAuth 正常返回）
- [ ] 建行程、記帳、分帳、結算
- [ ] 推播：設定 → 開啟通知 → 另一帳號新增費用 → 收到通知
- [ ] 刪除帳號：設定 → 危險區域 → 確認後回到登入頁，其他成員看到「已刪除使用者」
- [ ] 無網址列（assetlinks 生效）
- [ ] Android 返回鍵行為正常

### 7. 封閉測試 → 正式發布（個人帳號必經）

1. **測試與發布 → 測試 → 封閉測試** → 建立測試軌道，發布同一顆 .aab
2. 湊滿 **12 位測試員**，請他們點 opt-in 連結並**實際安裝使用**，維持 **14 天**
3. 14 天後 Dashboard 出現「申請正式版存取權」→ 填問卷（測試發現什麼、目標族群等）
4. 通過後：**正式版** → 建立版本 → 送審（首次審查通常 1–7 天）

## 上架前檢查

- [x] migration 0011 已套用（帳號刪除功能）
- [x] `/privacy` 正式站可存取
- [x] assetlinks.json 正式站可存取（application/json）
- [x] 商店素材：截圖 4 張＋feature graphic（`docs/store-assets/`）
- [ ] Play App Signing SHA-256 回填後重新部署
- [ ] 內部測試軌道實機跑過：登入、記帳、推播、刪除帳號
