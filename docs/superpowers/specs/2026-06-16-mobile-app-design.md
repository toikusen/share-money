# ShareMoney Mobile App — Design Spec

**Date:** 2026-06-16
**Status:** Approved (revised ×3 after Codex review)

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

---

## Architecture

### 雙平台共用 codebase

同一份 Next.js codebase，透過 `NEXT_PUBLIC_PLATFORM` 環境變數區分 build 行為：

- **Web**（`NEXT_PUBLIC_PLATFORM=web`）：部署至 Cloudflare Workers，部署流程不變，底層資料層改為 client-side
- **Mobile**（`NEXT_PUBLIC_PLATFORM=mobile`）：使用獨立 app 目錄結構（見下），輸出 static export → Capacitor 打包 → iOS / Android

### 資料層統一

移除所有 Server Actions，統一改為 Supabase client-side SDK 呼叫。

- **移除**：`'use server'` directive、`@supabase/ssr` package
- **保留 API 簽名**：`lib/actions/*.ts` 的函式名稱和參數不變，呼叫端 components 不需修改
- **認證 storage**：web 用 cookie storage adapter，mobile 用 localStorage storage adapter（均使用 `@supabase/supabase-js`）

---

## Mobile Static Export：SPA 架構

### 為什麼需要獨立 app 目錄

Next.js `output: 'export'` 不支援：
- 沒有完整 `generateStaticParams()` 的 dynamic routes（`/trips/[id]`、`/join/[token]` 等）
- Request-dependent Route Handlers（`auth/callback/route.ts`）

若現有的 `app/(app)/trips/[id]/page.tsx` 保留在 `app/` 目錄下，mobile build 時 Next.js 仍會掃到這些路由並 build 失敗。

### 解法：mobile build 使用替換 app 目錄

Web build 使用現有的 `app/` 目錄（維持 file-system routing）。Mobile build 使用 `app-mobile/` 目錄（純 SPA shell），透過 build script 在 build 前替換：

```
src/
  app/                      ← web build 使用（維持不動）
  app-mobile/               ← mobile build 使用
    [[...slug]]/
      page.tsx              ← 唯一 route，SPA 入口 shell
    layout.tsx              ← mobile root layout（無 middleware）
  components/
    pages/                  ← 所有 page 元件移至此（web & mobile 共用）
      TripsPage.tsx
      TripDetailPage.tsx
      TripBalancePage.tsx
      TripActivityPage.tsx
      JoinPage.tsx
      LoginPage.tsx
      SettingsPage.tsx
      AuthCallbackPage.tsx
```

### SPA Router（`[[...slug]]/page.tsx`）

```tsx
'use client'
export function generateStaticParams() { return [{ slug: [''] }] }

export default function SpaShell() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!user && !isPublicRoute(pathname)) {
    redirect('/login')
  }

  return <MobileRouter pathname={pathname} user={user} />
}
```

`MobileRouter` 根據 `pathname` 渲染對應的 `components/pages/*.tsx` 元件。動態 ID 從 `pathname` 解析（`/trips/abc123` → `id = 'abc123'`），不依賴 `useParams()`（因為 `[[...slug]]` 的 params 是 `{ slug: [...] }`，不是 `{ id }`）。

Auth guard 內建在 SPA shell，不依賴 `app/(app)/layout.tsx`。

### Web app 目錄調整

現有 `app/(app)/**/*.tsx` 和 `app/(auth)/**/*.tsx` 的 page 元件邏輯**抽取**至 `components/pages/`，原本的 Next.js page 檔案改為薄包裝（只 import + re-export component）：

```tsx
// app/(app)/trips/page.tsx
import { TripsPage } from '@/components/pages/TripsPage'
export default TripsPage
```

---

## Auth Flow

### auth/callback 統一為 client-side page

刪除 `app/(auth)/auth/callback/route.ts`（Request-dependent Route Handler，mobile build 不相容）。改為 `app/(auth)/auth/callback/page.tsx`（Client Component），web 和 mobile 統一走 client-side callback：

```tsx
'use client'
export default function AuthCallbackPage() {
  const searchParams = useSearchParams()
  useEffect(() => {
    const code = searchParams.get('code')
    if (code) supabase.auth.exchangeCodeForSession(code)
    // 然後 redirect 到 /trips
  }, [])
}
```

> `exchangeCodeForSession` 接收 auth **code** string，不是完整 URL。

### Google OAuth（Web）

改為 client-side 觸發：`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`

### Google OAuth（Mobile，必須繞過 WebView 限制）

Google 禁止在 embedded user-agent（WebView）執行 OAuth（`disallowed_useragent` 錯誤）。正確流程：

1. 呼叫 `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'sharemoney://auth/callback', skipBrowserRedirect: true } })` — 取得 `data.url` 但**不讓 Supabase 自動開啟**
2. 用 `Browser.open({ url: data.url })` 開啟**系統瀏覽器**執行 OAuth
3. 使用者完成登入，Google redirect 到 `sharemoney://auth/callback?code=xxx`
4. App 的 `@capacitor/app` `appUrlOpen` event 接收 deep link
5. 從 URL 解析 `code` query param，呼叫 `supabase.auth.exchangeCodeForSession(code)`
6. 呼叫 `Browser.close()` 關閉系統瀏覽器

登入按鈕在 `NEXT_PUBLIC_PLATFORM=mobile` 時觸發上述流程（而非 form action）。

---

## Account Deletion

### 目前 FK 問題

現有 schema 中，`trips.created_by`、`trip_members.user_id`、`expenses.paid_by`、`expenses.created_by`、`expense_splits.user_id` 均 reference `profiles(id)` 且**沒有 ON DELETE 行為**。直接 `deleteUser()` 會因 FK 違反而失敗。

### 採用匿名化策略（不硬刪除 expense 資料）

費用記錄屬於旅行共同資產，其他成員需要這些資料，刪除帳號時**保留費用紀錄但抹除個人識別資訊**：

`delete-account` Edge Function 執行順序（service role key）：

1. 將 `profiles` 的 `display_name` 改為「已刪除使用者」，`avatar_url` 設 null
2. 將 `trip_members` 中該 user 的所有記錄**刪除**（離開所有旅行）
3. 刪除 `device_tokens` 中該 user 的所有 token
4. 呼叫 `supabase.auth.admin.deleteUser(userId)`（cascades to profiles via ON DELETE CASCADE）

新增 migration：
- `trips.created_by` 加 `ON DELETE SET NULL`（creator 刪除後 trip 保留，不再有 owner）
- `expenses.paid_by`、`expenses.created_by` 加 `ON DELETE SET NULL`
- `expense_splits.user_id` 加 `ON DELETE CASCADE`（分帳 split 跟著刪）

---

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

### iOS Push Token 處理

`@capacitor/push-notifications` 的 `registration` event 在 iOS 回傳 **APNs token**。需要原生層的 FCM token 橋接：

**實作方式：自製 Capacitor native plugin（iOS）**
- 在 `ios/App/` 建立 Swift plugin，初始化 Firebase 後呼叫 `Messaging.messaging().token`
- 取得 FCM token 後透過 `notifyListeners('fcmTokenReceived', { token })` 橋接至 JS 層
- JS 側監聽 `fcmTokenReceived` event，upsert 至 `device_tokens`

這需要少量 Swift 原生程式碼，但讓 Android 和 iOS 的後端推播路徑統一（均走 FCM v1 API）。

### device_tokens 表格設計（多裝置支援）

```sql
CREATE TABLE device_tokens (
  device_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token        text NOT NULL,
  token_type   text NOT NULL CHECK (token_type IN ('fcm', 'apns')),
  platform     text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  revoked_at   timestamptz
);
```

- **唯一鍵**：`device_id`（App 首次安裝時生成並持久化，不隨 token rotation 改變）
- Token rotation：FCM token 變更時 upsert `token` by `device_id`，更新 `last_seen_at`
- 登出時設 `revoked_at`；Edge Function 發送前過濾 `revoked_at IS NULL`
- **RLS**：user 只能讀寫自己的 token（`user_id = auth.uid()`）；Edge Function 用 service role key 查詢所有成員 token

---

## Build & Release

### Android

1. 申請 Google Play Developer 帳號（$25 一次性）
2. 建立 Firebase 專案，設定 Android app，下載 `google-services.json`
3. `NEXT_PUBLIC_PLATFORM=mobile next build`（build script 先替換 `app/` → `app-mobile/`）
4. `npx cap sync android`
5. Android Studio → 建構 AAB → 上傳 Google Play Console
6. 審查期：1–3 天

### iOS

1. 申請 Apple Developer 帳號（$99/年）
2. Firebase 設定 iOS app，下載 `GoogleService-Info.plist`；設定 APNs Auth Key
3. `NEXT_PUBLIC_PLATFORM=mobile next build`
4. `npx cap sync ios`
5. **Xcode 26+**（Apple 自 2026-04-28 起要求新送審 app 使用 iOS 26 SDK 建構；需確認 Capacitor 7.x 在 Xcode 26 的相容性）
6. Xcode → 設定 Bundle ID、Capabilities（Push Notifications、Associated Domains）、簽名 → 建構 IPA → App Store Connect
7. 審查期：1–7 天

### 後續更新流程

| 改動類型 | Web | App |
|----------|-----|-----|
| UI / 業務邏輯 | `pnpm deploy` 立即生效 | 重新 build + 送審（1–7 天） |
| Supabase Edge Function | 部署即生效 | 無需送審 |
| 資料庫 schema | Migration 即生效 | 無需送審 |
| Capacitor 原生設定 | 不適用 | 重新 build + 送審 |

---

## Store Compliance Checklist

- [ ] 隱私政策 URL（App Store / Play Store 都必填）
- [ ] 帳號刪除功能（`delete-account` Edge Function + UI 入口）—— Apple 自 2022-06-30 起強制要求
- [ ] App Store / Play Store 上架說明文案
- [ ] app 截圖素材（iOS 需多種尺寸）
- [ ] Android back 按鈕行為（Capacitor WebView 內確認正常）
- [ ] iOS `NSUserNotificationUsageDescription`（推播說明文案）
- [ ] iOS `CFBundleURLTypes`（deep link scheme `sharemoney://` 設定）

---

## File Changes Summary

| 檔案 / 目錄 | 動作 |
|-------------|------|
| `lib/actions/trips.ts` | 移除 `'use server'`，改用 browser Supabase client |
| `lib/actions/expenses.ts` | 同上 |
| `lib/actions/members.ts` | 同上 |
| `lib/actions/profile.ts` | 同上 |
| `lib/supabase/client.ts` | 依 platform 回傳 cookie 或 localStorage storage adapter |
| `lib/supabase/server.ts` | 移除 |
| `app/(app)/**/*.tsx`（pages） | 邏輯抽取至 `components/pages/`，page 檔案改為薄包裝 |
| `app/(auth)/login/page.tsx` | mobile 模式改用 `skipBrowserRedirect + Browser.open()` OAuth |
| `app/(auth)/auth/callback/route.ts` | **刪除**，改為 `page.tsx`（client-side，web + mobile 共用） |
| `components/pages/`（新增目錄） | 所有 page 元件移至此（TripsPage, TripDetailPage, LoginPage, AuthCallbackPage 等） |
| `app-mobile/[[...slug]]/page.tsx` | **新增**（mobile SPA catch-all shell + auth guard + MobileRouter） |
| `app-mobile/layout.tsx` | **新增**（mobile root layout） |
| `scripts/build-mobile.sh` | **新增**（替換 app → app-mobile 目錄後執行 `next build`，完成後還原） |
| `next.config.ts` | mobile build 時加 `output: 'export'` |
| `capacitor.config.ts` | **新增**（appId, webDir, server deep link scheme 等） |
| `ios/App/` Swift plugin | **新增**（FCM token bridge：Firebase Messaging → JS `fcmTokenReceived` event） |
| `supabase/functions/send-push-notification/` | **新增** Edge Function |
| `supabase/functions/delete-account/` | **新增** Edge Function（匿名化 + `deleteUser`） |
| `supabase/migrations/0008_device_tokens.sql` | **新增**（device_tokens 表格，含多裝置設計） |
| `supabase/migrations/0009_account_deletion_fk.sql` | **新增**（trips/expenses ON DELETE SET NULL，expense_splits ON DELETE CASCADE） |

---

## Dependencies to Add

```json
{
  "dependencies": {
    "@capacitor/core": "7.x",
    "@capacitor/app": "7.x",
    "@capacitor/browser": "7.x",
    "@capacitor/push-notifications": "7.x"
  },
  "devDependencies": {
    "@capacitor/cli": "7.x",
    "@capacitor/ios": "7.x",
    "@capacitor/android": "7.x"
  }
}
```

Capacitor 7.x 為選定版本（v8 latest 但與 Xcode 26 的相容性需在實作時確認後再決定是否升級）。

---

## Prerequisites（開始實作前需備妥）

- [ ] Apple Developer 帳號（$99/年）
- [ ] Google Play Developer 帳號（$25 一次性）
- [ ] Firebase 專案（免費，需設定 Android + iOS app）
- [ ] **Mac + Xcode 26+**（Apple 自 2026-04-28 起強制要求）
- [ ] Android Studio
- [ ] 隱私政策頁面 URL
- [ ] 確認 Capacitor 7.x 在 Xcode 26 的建構相容性（若不相容則升級至 Capacitor 8.x）
