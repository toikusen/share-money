# ShareMoney Mobile App — Design Spec

**Date:** 2026-06-16
**Status:** Approved (revised ×2 after Codex review)

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
- **Mobile**（`NEXT_PUBLIC_PLATFORM=mobile`）：`next build` 輸出 static export（SPA 模式）→ Capacitor 打包 → iOS / Android

### 資料層統一

移除所有 Server Actions，統一改為 Supabase client-side SDK 呼叫。

- **移除**：`'use server'` directive、`@supabase/ssr` package
- **保留 API 簽名**：`lib/actions/*.ts` 的函式名稱和參數不變，呼叫端 components 不需修改
- **認證**：web 用 cookie storage adapter，mobile 用 localStorage storage adapter（均使用 `@supabase/supabase-js`）
- **路由保護**：移除 Next.js Middleware，改為 `app/(app)/layout.tsx` 的 client-side auth guard（`useEffect` + `router.push`）

### Mobile Static Export：SPA 模式（`[[...slug]]` 策略）

Next.js `output: 'export'` 明確**不支援**沒有完整 `generateStaticParams()` 的 dynamic routes（`/trips/[id]`、`/join/[token]` 等），也不支援 Request-dependent Route Handlers。

Mobile build 採用 Next.js 官方 SPA 模式（參考 `from-vite.md`）：

1. 在 `app/` 下建立 `[[...slug]]/page.tsx`（optional catch-all），作為唯一的靜態 HTML shell，`generateStaticParams` 只回傳 `[{ slug: [''] }]`
2. 這個 shell page 掛載 client-side router（使用 `usePathname()` + `useRouter()`），根據 URL 路徑動態渲染對應的 page component
3. 所有原本的 page 元件（trips/[id]、join/[token] 等）改為純 Client Components，透過 `useParams()` 取得動態 ID，資料改用 `useEffect` 抓取
4. `output: 'export'` 只產生一個 `index.html`（SPA 入口），Capacitor WebView 載入後由 client-side routing 接管所有導航

### `auth/callback` Route Handler 衝突

`app/(auth)/auth/callback/route.ts` 是 Request-dependent Route Handler，**mobile static export build 時會直接失敗**。

解決方案：將 auth callback 改為 **client-side page**（同時適用 web 和 mobile）：

- 刪除 `route.ts`，改為 `page.tsx`（Client Component）
- Web：`/auth/callback?code=xxx` 由 client-side page 用 `useSearchParams()` 取得 code，呼叫 `supabase.auth.exchangeCodeForSession(code)` 完成登入
- Mobile：deep link `sharemoney://auth/callback?code=xxx` 由 `@capacitor/app` 的 `appUrlOpen` event 接收，parse URL 取得 code，同樣呼叫 `supabase.auth.exchangeCodeForSession(code)`

> 注意：`exchangeCodeForSession` 的參數是 auth **code** string，不是完整 URL。需先從 URL 解析出 `code` query param 再傳入。

### Auth Flow（Google OAuth）

**Web**：改為 client-side 觸發 `supabase.auth.signInWithOAuth({ provider: 'google' })`，redirect 到 `/auth/callback`（client-side page）。

**Mobile（必須繞過 WebView OAuth 限制）**：

Google 明確禁止在 embedded user-agent（WebView）內進行 OAuth 授權（會收到 `disallowed_useragent` 錯誤）。Mobile 版：

1. 觸發 `supabase.auth.signInWithOAuth` 前先用 `@capacitor/browser` 的 `Browser.open()` 開啟**系統瀏覽器**執行 OAuth 流程（而非 WebView）
2. Supabase `redirectTo` 設為 `sharemoney://auth/callback`
3. App 透過 `@capacitor/app` 的 `appUrlOpen` event 接收 deep link
4. 從 URL 解析 `code` param，呼叫 `supabase.auth.exchangeCodeForSession(code)`

登入按鈕在 `NEXT_PUBLIC_PLATFORM=mobile` 時改為呼叫 `Browser.open()`。

## Push Notifications

### 架構

```
使用者新增費用
→ Supabase DB insert（expenses table）
→ Database Webhook 觸發
→ Supabase Edge Function（send-push-notification）
→ 查詢 device_tokens table 取得 trip 成員的 FCM token
→ 呼叫 Firebase Cloud Messaging v1 API
→ 成員手機收到推播
```

### iOS Push Token 處理（重要）

`@capacitor/push-notifications` 在 iOS 的 `registration` event 回傳的是 **APNs token**，不是 FCM token。兩種策略：

**策略 A（建議）：APNs token + FCM Registration via native bridge**
- iOS 原生層安裝 Firebase iOS SDK（`GoogleService-Info.plist`）並在 AppDelegate 正確初始化 Firebase
- Capacitor 的 AppDelegate plugin system 允許 Firebase 攔截 APNs token 並與 Firebase 交換 FCM token
- 但 Capacitor JS 的 `registration` event 仍可能回 APNs token，**需在原生 AppDelegate 額外呼叫 `Messaging.messaging().token` 取得 FCM token**，並透過 `@capacitor/core`'s `notifyListeners` 橋接回 JS 層
- 這需要少量原生程式碼（AppDelegate.swift）

**策略 B：後端支援雙 token**
- Android 存 FCM token，iOS 存 APNs token
- Edge Function 根據 `platform` 欄位分別呼叫 FCM API（Android）和 APNs HTTP/2 API（iOS）
- 維護複雜度較高，但不需要原生程式碼

實作時選擇策略 A，若原生 bridge 整合困難再降級到策略 B。

### 新增項目

| 項目 | 說明 |
|------|------|
| `@capacitor/push-notifications` | 接收推播、取得 token（iOS 需搭配原生 Firebase 初始化） |
| `@capacitor/browser` | Mobile OAuth 開啟系統瀏覽器 |
| DB table: `device_tokens` | columns: `user_id`, `token`, `platform`, `updated_at`；RLS 限制只有本人可讀寫自己的 token |
| Supabase Edge Function | `send-push-notification`：用 service role key 查 token，呼叫 FCM v1 API |
| Firebase 專案 | 免費；Android 設定 `google-services.json`，iOS 設定 `GoogleService-Info.plist` |
| `delete-account` Edge Function | 用 service role key 呼叫 `supabase.auth.admin.deleteUser()`，滿足 Apple 帳號刪除要求 |

### Token 管理

App 啟動且登入後請求推播權限，取得 FCM token 後 upsert 至 `device_tokens`（唯一鍵：`user_id + platform`）。使用者登出時刪除對應 token 並呼叫 `delete-account` 之外的登出流程。

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
2. Firebase 設定 iOS app，下載 `GoogleService-Info.plist`；設定 APNs Auth Key
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

- [ ] 隱私政策 URL（App Store / Play Store 都必填）
- [ ] 帳號刪除功能（`delete-account` Edge Function + 對應 UI 入口）—— Apple 自 2022-06-30 起強制要求
- [ ] App Store / Play Store 上架說明文案
- [ ] app 截圖素材（iOS 需多種尺寸）
- [ ] Android back 按鈕行為（確保 WebView 內正常）
- [ ] iOS `NSUserNotificationUsageDescription`（推播說明文案）
- [ ] iOS `CFBundleURLTypes`（deep link scheme `sharemoney://` 設定）

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
| `app/(app)/**/*.tsx`（所有 pages） | Server Component → Client Component，資料改 useEffect 抓取 |
| `app/(auth)/login/page.tsx` | mobile 模式改用 `@capacitor/browser` 開啟 OAuth |
| `app/(auth)/auth/callback/route.ts` | **刪除**，改為 `app/(auth)/auth/callback/page.tsx`（client-side） |
| `app/[[...slug]]/page.tsx` | **新增**（mobile SPA catch-all shell） |
| `next.config.ts` | mobile build 時加 `output: 'export'` |
| `capacitor.config.ts` | 新增（Bundle ID、appId、webDir 等） |
| `ios/App/AppDelegate.swift` | 初始化 Firebase，取得 FCM token 後橋接回 JS |
| `supabase/functions/send-push-notification/` | 新增 Edge Function |
| `supabase/functions/delete-account/` | 新增 Edge Function（Apple 帳號刪除要求） |
| `supabase/migrations/` | 新增 `device_tokens` table |

## Dependencies to Add

```json
{
  "@capacitor/core": "7.x",
  "@capacitor/ios": "7.x",
  "@capacitor/android": "7.x",
  "@capacitor/push-notifications": "7.x",
  "@capacitor/app": "7.x",
  "@capacitor/browser": "7.x"
}
```

```json
{
  "devDependencies": {
    "@capacitor/cli": "7.x"
  }
}
```

版本 pin 到 `7.x`（Capacitor 8 目前 latest 但工具鏈需求待確認，實作前需核對 Capacitor 8 的 Node / Xcode 最低版本要求後再決定是否升級）。

## Prerequisites（開始實作前需備妥）

- [ ] Apple Developer 帳號（$99/年）
- [ ] Google Play Developer 帳號（$25 一次性）
- [ ] Firebase 專案（免費，需設定 Android + iOS app）
- [ ] Mac + Xcode 16+（iOS 建構必須）
- [ ] Android Studio
- [ ] 隱私政策頁面 URL
- [ ] `delete-account` 功能 UI（Apple 審查前必須存在）
