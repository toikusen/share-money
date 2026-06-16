# ShareMoney Mobile App — Design Spec

**Date:** 2026-06-16
**Status:** Approved (revised after Codex review)

## Overview

將現有 Next.js + Supabase + Cloudflare web app 打包為 iOS + Android 原生 app，透過 Capacitor（local bundled 方式）上架至 App Store 和 Google Play，並加入推播通知功能。

## Goals

- 上架 iOS App Store 和 Google Play
- 支援推播通知（有人新增費用時通知同行成員）
- 單一 codebase：UI 和業務邏輯改動只需寫一次（但 app 版仍需重新 build + 送審才會生效）

## Non-Goals

- 離線模式（可列入後續迭代）
- 相機 / 收據掃描（browser API 已可處理）
- React Native 重寫

## Architecture

### 雙平台共用 codebase

同一份 Next.js codebase，透過 `NEXT_PUBLIC_PLATFORM` 環境變數區分行為：

- **Web**（`NEXT_PUBLIC_PLATFORM=web`）：部署至 Cloudflare Workers，部署流程不變，底層資料層改為 client-side
- **Mobile**（`NEXT_PUBLIC_PLATFORM=mobile`）：`next build` 輸出 static export → Capacitor 打包 → iOS / Android

### 資料層統一

移除所有 Server Actions，統一改為 Supabase client-side SDK 呼叫。

- **移除**：`'use server'` directive、`@supabase/ssr` package
- **保留 API 簽名**：`lib/actions/*.ts` 的函式名稱和參數不變，呼叫端 components 不需修改
- **認證**：web 用 cookie storage adapter，mobile 用 localStorage storage adapter（均使用 `@supabase/supabase-js`）
- **路由保護**：移除 Next.js Middleware，改為 `app/(app)/layout.tsx` 的 client-side auth guard（`useEffect` + `router.push`）

### 資料抓取

全部 Server Components 改為 Client Components，資料抓取移至 `useEffect`（優先）或 React Query。

### Dynamic Routes 處理（Static Export 限制）

`output: 'export'` 不允許 runtime dynamic routes（`/trips/[id]`、`/join/[token]` 等），需特別處理：

- 每個 dynamic route page 加入 `export function generateStaticParams() { return [{ id: 'shell' }] }` 產生靜態 HTML shell
- 頁面本身改為 Client Component，使用 `useParams()` 取得 ID（而非從 server params）
- `capacitor.config.ts` 設定 `server.errorPath = 'index.html'`，讓所有 404 fallback 到 SPA 入口，再由 Next.js client router 接管路由

這樣 `/trips/123` 在 Capacitor 內會先嘗試找靜態檔案，找不到後 fallback 到 `index.html`，由 client-side routing 渲染正確頁面。

### Auth Flow（Google OAuth）

**Web**：維持現有 `signInWithOAuth` + server-side redirect callback。

**Mobile（必須繞過 WebView OAuth 限制）**：

Google 明確禁止在 embedded user-agent（WebView）內進行 OAuth 授權（`disallowed_useragent` 錯誤）。Mobile 版必須：

1. 使用 `@capacitor/browser` 開啟**系統瀏覽器**執行 OAuth 流程
2. Supabase redirect URL 設為 `sharemoney://auth/callback`
3. App 透過 `@capacitor/app` 的 `appUrlOpen` event 接收 deep link
4. 手動呼叫 `supabase.auth.exchangeCodeForSession(url)` 完成登入

登入按鈕在 `NEXT_PUBLIC_PLATFORM=mobile` 時改為呼叫 `Browser.open()` 而非 form action。

## Push Notifications

### 架構

```
使用者新增費用
→ Supabase DB insert（expenses table）
→ Database Webhook 觸發
→ Supabase Edge Function（send-push-notification）
→ 查詢 device_tokens table 取得 trip 成員的 FCM token
→ 呼叫 Firebase Cloud Messaging API
→ 成員手機收到推播
```

### iOS Push Token 處理

`@capacitor/push-notifications` 在 iOS 回傳的是 **APNS token**，不是 FCM token。必須在 iOS 專案安裝 **Firebase iOS SDK**（`GoogleService-Info.plist`），Firebase SDK 會自動將 APNS token 交換為 FCM token，讓 Android 和 iOS 都能統一透過 FCM API 發送推播。

若不裝 Firebase iOS SDK，需改為直接呼叫 APNS HTTP/2 API（需維護兩套推播後端，不建議）。

### 新增項目

| 項目 | 說明 |
|------|------|
| `@capacitor/push-notifications` | 取得裝置 FCM token（iOS 需搭配 Firebase iOS SDK）、接收前景推播 |
| `@capacitor/browser` | Mobile OAuth 開啟系統瀏覽器 |
| DB table: `device_tokens` | columns: `user_id`, `token`, `platform`, `updated_at`；RLS 限制只有本人可讀寫自己的 token，Edge Function 用 service role key 查詢所有成員 token |
| Supabase Edge Function | `send-push-notification`：接收 webhook，用 service role key 查 token，呼叫 FCM v1 API |
| Firebase 專案 | 免費；Android 設定 `google-services.json`，iOS 設定 `GoogleService-Info.plist` |

### Token 管理

App 啟動且登入後請求推播權限，取得 token 後 upsert 至 `device_tokens`（唯一鍵：`user_id + platform`）。使用者登出時刪除對應 token。

## Build & Release

### Android

1. 申請 Google Play Developer 帳號（$25 一次性）
2. 建立 Firebase 專案，設定 Android app，下載 `google-services.json`
3. `NEXT_PUBLIC_PLATFORM=mobile next build`（`next.config.ts` 設 `output: 'export'` when mobile）
4. `npx cap sync android`
5. Android Studio → 建構 AAB → 上傳 Google Play Console
6. 補齊審查素材（見 Store Compliance Checklist）
7. 審查期：1–3 天

### iOS

1. 申請 Apple Developer 帳號（$99/年）
2. 在 Firebase 設定 iOS app，下載 `GoogleService-Info.plist`；設定 APNs Auth Key（iOS push 必須）
3. `NEXT_PUBLIC_PLATFORM=mobile next build`
4. `npx cap sync ios`
5. Xcode → 設定 Bundle ID、Capabilities（Push Notifications、Associated Domains）、簽名 → 建構 IPA → App Store Connect
6. 補齊審查素材（見 Store Compliance Checklist）
7. 審查期：1–7 天

### 後續更新流程

| 改動類型 | Web | App |
|----------|-----|-----|
| UI / 業務邏輯 | `pnpm deploy` 立即生效 | 重新 build + 送審（1–7 天） |
| Supabase Edge Function | 部署即生效 | 無需送審 |
| 資料庫 schema | Migration 即生效 | 無需送審 |
| Capacitor 原生設定 | 不適用 | 重新 build + 送審 |

## Store Compliance Checklist

Apple 和 Google 對「以網頁包裝為主的 app」有審查風險。ShareMoney 有實質功能，通過機率高，但以下項目必須在送審前完成：

- [ ] 隱私政策 URL（App Store / Play Store 都必填）
- [ ] 帳號刪除功能（Apple 2023 年起強制要求）
- [ ] app 截圖素材（iOS 需要多種尺寸）
- [ ] App Store / Play Store 上架說明文案
- [ ] Android back 按鈕行為（確保 WebView 內正常運作）
- [ ] 推播通知權限說明文案（iOS 的 `NSUserNotificationUsageDescription`）
- [ ] 確認 app 在 WebView 無法 Google OAuth 時有明確錯誤訊息

## File Changes Summary

| 檔案 | 動作 |
|------|------|
| `lib/actions/trips.ts` | 移除 `'use server'`，改用 browser Supabase client |
| `lib/actions/expenses.ts` | 同上 |
| `lib/actions/members.ts` | 同上 |
| `lib/actions/profile.ts` | 同上 |
| `lib/supabase/client.ts` | 依 platform 回傳 cookie 或 localStorage storage adapter |
| `lib/supabase/server.ts` | 移除 |
| `app/(app)/layout.tsx` | 加入 client-side auth guard |
| `app/(app)/trips/page.tsx` 等所有 page.tsx | Server Component → Client Component，資料改 useEffect 抓取 |
| `app/(app)/trips/[id]/page.tsx` 等 dynamic routes | 加入 `generateStaticParams`（回傳 shell）+ 改用 `useParams()` |
| `app/(auth)/login/page.tsx` | mobile 模式改用 `@capacitor/browser` 開啟系統瀏覽器做 OAuth |
| `app/(auth)/auth/callback/route.ts` | 保留給 web；mobile 新增 client-side deep link handler |
| `next.config.ts` | mobile build 時加 `output: 'export'` |
| `capacitor.config.ts` | 新增（含 `server.errorPath: 'index.html'`） |
| `supabase/functions/send-push-notification/` | 新增 Edge Function |
| `supabase/migrations/` | 新增 `device_tokens` table |

## Dependencies to Add

```json
{
  "@capacitor/core": "6.x",
  "@capacitor/ios": "6.x",
  "@capacitor/android": "6.x",
  "@capacitor/push-notifications": "6.x",
  "@capacitor/app": "6.x",
  "@capacitor/browser": "6.x"
}
```

版本 pin 到 6.x（目前 Capacitor 穩定主版本），不使用 `latest`。

## Prerequisites（開始實作前需備妥）

- [ ] Apple Developer 帳號（$99/年）
- [ ] Google Play Developer 帳號（$25 一次性）
- [ ] Firebase 專案（免費，需設定 Android + iOS app）
- [ ] Mac + Xcode（iOS 建構必須）
- [ ] Android Studio
- [ ] 隱私政策頁面 URL
- [ ] app 帳號刪除功能（送審前必須實作）
