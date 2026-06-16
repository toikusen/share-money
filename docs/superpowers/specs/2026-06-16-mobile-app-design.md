# ShareMoney Mobile App — Design Spec

**Date:** 2026-06-16
**Status:** Approved

## Overview

將現有 Next.js + Supabase + Cloudflare web app 打包為 iOS + Android 原生 app，透過 Capacitor（local bundled 方式）上架至 App Store 和 Google Play，並加入推播通知功能。

## Goals

- 上架 iOS App Store 和 Google Play
- 支援推播通知（有人新增費用時通知同行成員）
- 維護單一 codebase：改 web = 改 app，不需維護兩套

## Non-Goals

- 離線模式（可列入後續迭代）
- 相機 / 收據掃描（browser API 已可處理）
- React Native 重寫

## Architecture

### 雙平台共用 codebase

同一份 Next.js codebase，透過 `NEXT_PUBLIC_PLATFORM` 環境變數區分行為：

- **Web**（`NEXT_PUBLIC_PLATFORM=web`）：部署至 Cloudflare Workers，部署流程不變，但底層資料層改為 client-side
- **Mobile**（`NEXT_PUBLIC_PLATFORM=mobile`）：`next build` 輸出 static export → Capacitor 打包 → iOS / Android

### 資料層統一（最重要的改動）

移除所有 Server Actions，統一改為 Supabase client-side SDK 呼叫。

- **移除**：`'use server'` directive、`@supabase/ssr` package（整個移除）
- **保留 API 簽名**：`lib/actions/*.ts` 的函式名稱和參數不變，呼叫端 components 不需修改
- **認證**：web 用 cookie session（`@supabase/ssr` → `@supabase/supabase-js` + storage adapter），mobile 用 localStorage session
- **路由保護**：移除 Next.js Middleware，改為 `app/(app)/layout.tsx` 的 client-side auth guard（`useEffect` + `router.push`）

### 資料抓取

Server Components 改為 Client Components，資料抓取移至 `useEffect` 或搭配 React Query / SWR（視複雜度決定，優先用 `useEffect`）。

### Auth Callback

- **Web**：維持 `/auth/callback` HTTP route handler
- **Mobile**：Supabase redirect URL 改為 `sharemoney://auth/callback`，App 透過 Capacitor App plugin 接收 deep link，手動呼叫 `supabase.auth.exchangeCodeForSession()`

## Push Notifications

### 架構

```
使用者新增費用
→ Supabase DB insert（expenses table）
→ Database Webhook
→ Supabase Edge Function（send-push-notification）
→ 查詢 device_tokens table 取得 trip 成員的 FCM token
→ 呼叫 Firebase Cloud Messaging API
→ 成員手機收到推播
```

### 新增項目

| 項目 | 說明 |
|------|------|
| `@capacitor/push-notifications` | 取得裝置 token、接收前景推播 |
| DB table: `device_tokens` | columns: `user_id`, `token`, `platform`, `updated_at` |
| Supabase Edge Function | `send-push-notification`：接收 webhook，呼叫 FCM API |
| Firebase 專案 | 免費，提供 FCM 服務（Android + iOS 共用） |

### Token 管理

App 啟動時向 Capacitor 請求推播權限，取得 token 後 upsert 至 `device_tokens`。Token 以 `user_id + platform` 為唯一鍵。

## Build & Release

### Android

1. 申請 Google Play Developer 帳號（$25 一次性）
2. 建立 Firebase 專案，設定 Android app（`google-services.json`）
3. `NEXT_PUBLIC_PLATFORM=mobile next build`（`next.config.ts` 設 `output: 'export'`）
4. `npx cap sync android`
5. Android Studio → 建構 AAB → 上傳 Google Play Console
6. 審查期：1–3 天

### iOS

1. 申請 Apple Developer 帳號（$99/年）
2. 設定 APNs 憑證，Firebase 設定 iOS app（`GoogleService-Info.plist`）
3. `NEXT_PUBLIC_PLATFORM=mobile next build`
4. `npx cap sync ios`
5. Xcode → 設定 Bundle ID、簽名 → 建構 IPA → App Store Connect
6. 審查期：1–7 天

### 後續更新流程

- **Web**：`pnpm deploy` → 立即生效
- **App**：`next build → cap sync → 各 IDE 建構 → 送審`
- UI / 業務邏輯改動：兩邊共用，各自部署一次即可

## File Changes Summary

| 檔案 | 動作 |
|------|------|
| `lib/actions/trips.ts` | 移除 `'use server'`，改用 browser Supabase client |
| `lib/actions/expenses.ts` | 同上 |
| `lib/actions/members.ts` | 同上 |
| `lib/actions/profile.ts` | 同上 |
| `lib/supabase/client.ts` | 新增 mobile 模式（localStorage session storage） |
| `lib/supabase/server.ts` | 移除 |
| `app/(app)/layout.tsx` | 加入 client-side auth guard |
| `app/(app)/trips/page.tsx` 等 | Server Component → Client Component |
| `app/(auth)/auth/callback/route.ts` | 保留給 web；新增 mobile deep link handler page |
| `next.config.ts` | 新增 mobile build 時的 `output: 'export'` 條件 |
| `capacitor.config.ts` | 新增（Capacitor 設定） |
| `supabase/functions/send-push-notification/` | 新增 Edge Function |
| `supabase/migrations/` | 新增 `device_tokens` table migration |

## Dependencies to Add

```json
{
  "@capacitor/core": "latest",
  "@capacitor/ios": "latest",
  "@capacitor/android": "latest",
  "@capacitor/push-notifications": "latest",
  "@capacitor/app": "latest"
}
```

## Prerequisites（開始實作前需備妥）

- [ ] Apple Developer 帳號
- [ ] Google Play Developer 帳號
- [ ] Firebase 專案（免費）
- [ ] Mac + Xcode（iOS 建構必須）
- [ ] Android Studio
