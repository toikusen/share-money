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
| 部署 | Cloudflare Workers (`@opennextjs/cloudflare`) |
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
- 分帳計算（簡化轉帳清單）
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
  exchange_rate   numeric(10,4) NOT NULL CHECK (exchange_rate > 0),  -- 1 JPY = ? TWD
  invite_token    uuid  NOT NULL UNIQUE DEFAULT gen_random_uuid(),
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
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  currency        text  NOT NULL CHECK (currency IN ('JPY', 'TWD')),
  -- JPY 為整數幣別：CHECK (currency = 'TWD' OR amount = floor(amount))
  paid_by         uuid  NOT NULL REFERENCES profiles(id),
  created_by      uuid  NOT NULL REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now()
  -- paid_by 和所有 expense_splits.user_id 必須是 trip_members；
  -- 由 create_expense_with_splits RPC 在 DB 內驗證
)

-- 每筆費用的分擔明細
expense_splits (
  expense_id      uuid  REFERENCES expenses(id) ON DELETE CASCADE,
  user_id         uuid  REFERENCES profiles(id),
  amount          numeric(12,2) NOT NULL CHECK (amount >= 0),  -- 與 expense 同幣別
  PRIMARY KEY (expense_id, user_id)
  -- sum(amount) == expense.amount 由 create_expense_with_splits RPC 強制驗證
  -- JPY expense 的每筆 split amount 也須為整數，由 RPC 驗證
)
```

---

## Row Level Security (RLS)

| 表 | SELECT | INSERT | UPDATE | DELETE |
|----|--------|--------|--------|--------|
| `profiles` | 任何登入使用者 | auth callback（SECURITY DEFINER） | 本人 | — |
| `trips` | trip_members 成員 | ❌ no policy | ❌ no policy | `created_by` |
| `trip_members` | 同行程成員 | ❌ no policy | — | — |
| `expenses` | 同行程成員 | ❌ no policy | — | `created_by` |
| `expense_splits` | 同行程成員 | ❌ no policy | — | CASCADE（隨 expense） |

`❌ no policy` = RLS 預設 deny，只有 SECURITY DEFINER function 能寫入。

---

## SECURITY DEFINER Functions

所有寫入操作透過 `SECURITY DEFINER` Postgres function 執行，以 **authenticated client**（使用者的 session）呼叫。函式內部透過 `auth.uid()` 取得操作者身份，**不接受 client 傳入 actor user_id**。

### Function 清單

**`create_trip(p_name text, p_exchange_rate numeric)`**
1. 以 `auth.uid()` 為 `created_by` INSERT trips
2. INSERT trip_members（`user_id = auth.uid()`）
3. 回傳 trip id

**`join_trip(p_invite_token uuid)`**
1. 查詢 trips WHERE invite_token = p_invite_token
2. 無效 token → RAISE EXCEPTION
3. 已是成員 → 直接回傳 trip id（幂等）
4. INSERT trip_members（`user_id = auth.uid()`）
5. 回傳 trip id

**`create_expense_with_splits(p_trip_id, p_title, p_amount, p_currency, p_paid_by, p_splits jsonb)`**
1. 驗證 `auth.uid()` 在 trip_members 中（呼叫者是成員）
2. 驗證 p_paid_by 在 trip_members 中
3. 驗證每個 splits.user_id 在 trip_members 中
4. 驗證 sum(splits.amount) == p_amount（exact match）
5. 若 p_currency = 'JPY'：驗證 p_amount 和每筆 split amount 為整數
6. INSERT expenses + INSERT expense_splits（單一 transaction）

**`update_trip_exchange_rate(p_trip_id uuid, p_rate numeric)`**
1. 驗證 `auth.uid()` 在 trip_members 中
2. 驗證 p_rate > 0
3. UPDATE trips SET exchange_rate = p_rate

### Migration 中的 privilege 設定

每個 function 必須明確撤銷預設執行權限：

```sql
-- 套用到每個 function
REVOKE EXECUTE ON FUNCTION create_trip FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_trip TO authenticated;

-- join_trip / create_expense_with_splits / update_trip_exchange_rate 同上
```

這確保匿名訪客無法呼叫任何 function。

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
             → 呼叫 create_trip(name, exchange_rate)（authenticated client，SECURITY DEFINER）
               → DB 內原子: INSERT trips + INSERT trip_members（建立者 = auth.uid()）
             → redirect /trips/[id]
```

### 加入行程（分享連結）
```
/join/[token] → 檢查登入（未登入 → /login?next=/join/[token]）
Server Action: 呼叫 join_trip(token)（authenticated client，SECURITY DEFINER）
             → 無效 token → 顯示「連結無效」
             → 已是成員 → redirect /trips/[id]
             → 新成員 → INSERT trip_members → redirect /trips/[id]
```

### 新增費用
```
行程頁點「新增費用」→ Modal 開啟
填寫：標題、金額、幣別、付款人、分擔成員、分擔金額（均攤或自訂）
Client 驗證：sum(splits) == expense.amount（快速 UX 回饋）
Server Action: 呼叫 create_expense_with_splits(...)（authenticated client，SECURITY DEFINER）
             → DB 內驗證：auth.uid() 是成員、paid_by/splits 是成員、金額總和、JPY 整數
             → 若驗證失敗，function RAISE EXCEPTION，Server Action 回傳錯誤訊息
```

### 分帳計算（server-side）
```
讀取行程所有 expense_splits
依 trip.exchange_rate 統一換算為 TWD
計算每人 net = paid_total - owed_total
Debt minimization（簡化轉帳清單）：
  credits = net > 0 的人（被欠款），依金額大到小排列
  debts   = net < 0 的人（欠款），依絕對值大到小排列
  iterative matching：最大債務人付給最大債權人，重複直到清零
  -- 旅遊群組人數小（≤10），此演算法接近最優解
結果以 TWD + 原幣並列顯示
```

---

## 金額與 Rounding 規則

| 情境 | 規則 |
|------|------|
| JPY 費用金額 | 整數（DB CHECK: `amount = floor(amount)`） |
| TWD 費用金額 | 最多 2 位小數 |
| 均攤計算餘數 | 無法整除時，餘數加到第一位成員的分擔額 |
| `sum(splits) == amount` | DB 內 exact match，不允許誤差 |
| 匯率換算（JPY→TWD）| `round(amount * exchange_rate, 2)` |
| 分帳結算顯示 | TWD 以 2 位小數顯示；JPY 以整數顯示 |

---

## 匯率處理

- 行程建立時呼叫 ExchangeRate-API 取得即時 JPY/TWD 匯率
- 匯率儲存在 `trips.exchange_rate`，整個行程共用
- 任何行程成員可在行程詳細頁（`/trips/[id]`）inline 修改匯率（點擊 ✏️ → 呼叫 `update_trip_exchange_rate` function）
- API 失敗時 UI 顯示提示，允許手動輸入後繼續建立

---

## 錯誤處理

| 情境 | 處理方式 |
|------|----------|
| 分帳金額總和 ≠ 費用金額 | Server Action 回傳錯誤，前端 inline 提示 |
| invite_token 無效 | 顯示「連結無效」頁面（token 無 expiry，不說「已過期」） |
| ExchangeRate API 失敗 | Fallback 手動輸入，不阻擋建立行程 |
| 未登入訪問保護路由 | Middleware redirect 到 `/login?next=<path>`，`next` 僅允許 `/` 開頭的相對路徑（防 open redirect） |
| 非行程成員訪問行程 | RLS 拒絕，Server Component 顯示 404 |

---

## 測試策略

- **Unit test**：debt minimization 純函數、幣別換算工具函數
- **Integration test**：Server Actions（建行程、加費用、加入行程）
- **E2E（MVP 後）**：Playwright — 完整 auth → 建行程 → 新增費用 → 查結算

---

## 目錄結構（預計）

```
supabase/
├── migrations/
│   └── 0001_init.sql           # 所有 tables + RLS policies
└── functions/
    └── expense_helpers.sql     # create_trip, join_trip, create_expense_with_splits, update_trip_exchange_rate（含 REVOKE/GRANT）

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
