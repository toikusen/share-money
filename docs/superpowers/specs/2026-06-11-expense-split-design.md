# 分帳系統設計文件

**日期：** 2026-06-11  
**狀態：** 已確認

---

## 概述

多行程旅遊分帳網頁應用程式。使用者可建立多個獨立行程，邀請朋友加入，記錄費用並自動計算分帳結果。

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端框架 | Next.js App Router (TypeScript) |
| 部署 | Cloudflare Pages (`@cloudflare/next-on-pages`) |
| 資料庫 | Supabase PostgreSQL |
| 認證 | Supabase Auth + Google OAuth |
| Session 管理 | `@supabase/ssr`（cookie-based） |
| 匯率 API | ExchangeRate-API（免費方案） |

---

## 功能範圍

### 核心功能（MVP）

- Google OAuth 登入／登出
- 建立行程（名稱、自動抓取即時匯率、可手動覆蓋）
- 行程成員管理（透過分享連結加入）
- 新增費用（名稱、金額、幣別、付款人、分擔成員與金額）
- 分帳計算（最少轉帳筆數）
- 查看結算清單（誰欠誰多少，含 JPY/TWD 雙幣顯示）

### 排除於 MVP 之外

- 即時通知
- 費用圖表統計
- 標記已付款
- 其他幣別（架構預留擴充）

---

## 頁面結構

```
/                    → redirect → /trips（已登入）or /login（未登入）
/login               → Google OAuth 入口
/auth/callback       → Supabase OAuth callback
/trips               → 行程列表（所有我加入的行程）
/trips/new           → 建立新行程
/trips/[id]          → 行程詳細：費用列表 + 成員 + 匯率
/trips/[id]/balance  → 分帳結算清單
/join/[token]        → 分享連結入口（登入後加入行程）
```

---

## 資料模型

```sql
-- 對應 auth.users
profiles (
  id              uuid  PRIMARY KEY,  -- = auth.users.id
  display_name    text  NOT NULL,
  avatar_url      text,
  created_at      timestamptz DEFAULT now()
)

-- 每個旅遊行程
trips (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text  NOT NULL,
  created_by      uuid  NOT NULL REFERENCES profiles(id),
  exchange_rate   numeric(10,4) NOT NULL,  -- 1 JPY = ? TWD
  invite_token    uuid  UNIQUE DEFAULT gen_random_uuid(),
  created_at      timestamptz DEFAULT now()
)

-- 行程成員（many-to-many）
trip_members (
  trip_id         uuid  REFERENCES trips(id) ON DELETE CASCADE,
  user_id         uuid  REFERENCES profiles(id),
  joined_at       timestamptz DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
)

-- 費用記錄
expenses (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid  NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title           text  NOT NULL,
  amount          numeric(12,2) NOT NULL,
  currency        text  NOT NULL CHECK (currency IN ('JPY', 'TWD')),
  paid_by         uuid  NOT NULL REFERENCES profiles(id),
  created_by      uuid  NOT NULL REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now()
)

-- 每筆費用的分擔明細
expense_splits (
  expense_id      uuid  REFERENCES expenses(id) ON DELETE CASCADE,
  user_id         uuid  REFERENCES profiles(id),
  amount          numeric(12,2) NOT NULL,  -- 與 expense 同幣別
  PRIMARY KEY (expense_id, user_id)
)
```

---

## Row Level Security (RLS)

| 表 | 讀取 | 寫入 | 刪除 |
|----|------|------|------|
| `profiles` | 所有登入使用者 | 本人 | — |
| `trips` | trip_members 成員 | 登入使用者（建立） | 建立者 |
| `trip_members` | 同行程成員 | service role（join flow）| — |
| `expenses` | 同行程成員 | 同行程成員 | 建立者 |
| `expense_splits` | 同行程成員 | 隨 expense 一起寫入 | 隨 expense 刪除 |

**Join flow 說明：** `/join/[token]` 頁面的 Server Action 使用 Supabase service role client 查詢 invite_token 並插入 `trip_members`，繞過 RLS（使用者尚未是成員，無法通過 RLS）。

---

## 主要流程

### 登入流程
```
訪問 /trips → middleware 檢查 session → 無 session → redirect /login
點擊 Google 登入 → Supabase OAuth → Google 授權 → /auth/callback
callback: 交換 code → 寫 cookie → upsert profiles → redirect /trips
```

### 建立行程
```
/trips/new → 填名稱
Server Action: 呼叫 ExchangeRate API 取得 JPY/TWD 即時匯率
             → 若 API 失敗，回傳錯誤讓使用者手動輸入
             → INSERT trips
             → INSERT trip_members（建立者）
             → redirect /trips/[id]
```

### 加入行程（分享連結）
```
/join/[token] → 檢查登入（未登入 → /login?next=/join/[token]）
Server Action（service role）: 查詢 trips WHERE invite_token = token
             → 無效 token → 顯示「連結無效」
             → 已是成員 → redirect /trips/[id]
             → 新成員 → INSERT trip_members → redirect /trips/[id]
```

### 新增費用
```
行程頁點「新增費用」→ Modal 開啟
填寫：標題、金額、幣別、付款人、分擔成員、分擔金額（均攤或自訂）
Client 驗證：sum(splits) == expense.amount
Server Action: INSERT expenses → INSERT expense_splits（transaction）
             → 若驗證失敗回傳錯誤
```

### 分帳計算（server-side）
```
讀取行程所有 expense_splits
依 trip.exchange_rate 統一換算為 TWD
計算每人 net = paid_total - owed_total
Debt minimization：
  credits = net > 0 的人（被欠款）
  debts   = net < 0 的人（欠款）
  greedy matching → 最少筆數的轉帳清單
結果以 TWD + 原幣並列顯示
```

---

## 匯率處理

- 行程建立時呼叫 ExchangeRate-API 取得即時 JPY/TWD 匯率
- 匯率儲存在 `trips.exchange_rate`，整個行程共用
- 任何行程成員可在行程詳細頁（`/trips/[id]`）inline 修改匯率（點擊匯率旁的 ✏️）
- API 失敗時 UI 顯示提示，允許手動輸入後繼續建立

---

## 錯誤處理

| 情境 | 處理方式 |
|------|----------|
| 分帳金額總和 ≠ 費用金額 | Server Action 回傳錯誤，前端 inline 提示 |
| invite_token 無效 | 顯示「連結無效或已過期」頁面 |
| ExchangeRate API 失敗 | Fallback 手動輸入，不阻擋建立行程 |
| 未登入訪問保護路由 | Middleware redirect 到 /login |
| 非行程成員訪問行程 | RLS 拒絕，Server Component 顯示 404 |

---

## 測試策略

- **Unit test**：debt minimization 純函數、幣別換算工具函數
- **Integration test**：Server Actions（建行程、加費用、加入行程）
- **E2E（MVP 後）**：Playwright — 完整 auth → 建行程 → 新增費用 → 查結算

---

## 目錄結構（預計）

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── auth/callback/route.ts
│   ├── (app)/
│   │   ├── trips/
│   │   │   ├── page.tsx           # 行程列表
│   │   │   ├── new/page.tsx       # 建立行程
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # 行程詳細
│   │   │       └── balance/page.tsx
│   │   └── join/[token]/page.tsx
│   └── layout.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # browser client
│   │   ├── server.ts              # server client
│   │   └── middleware.ts
│   ├── actions/
│   │   ├── trips.ts               # Server Actions
│   │   ├── expenses.ts
│   │   └── members.ts
│   └── utils/
│       ├── balance.ts             # debt minimization
│       └── currency.ts            # 換算工具
├── components/
│   ├── expenses/
│   │   └── AddExpenseModal.tsx
│   └── trips/
│       └── TripCard.tsx
└── middleware.ts
```
