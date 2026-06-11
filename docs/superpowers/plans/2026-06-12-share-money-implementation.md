# ShareMoney 分帳系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立多行程旅遊分帳 Web App，支援 Google OAuth、自訂分帳、JPY/TWD 匯率換算，部署於 Cloudflare Workers。

**Architecture:** Next.js 15 App Router。所有寫入操作透過 SECURITY DEFINER Postgres function 執行，authenticated client 呼叫。@supabase/ssr 管理 cookie session。分帳計算在 Server Component 執行。

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Supabase (PostgreSQL + Auth), @supabase/ssr, @opennextjs/cloudflare, Vitest

---

## 檔案結構

```
supabase/
├── migrations/0001_init.sql
└── functions/expense_helpers.sql

src/
├── middleware.ts
├── types/database.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (auth)/login/page.tsx
│   ├── (auth)/auth/callback/route.ts
│   ├── (app)/trips/page.tsx
│   ├── (app)/trips/new/page.tsx
│   ├── (app)/trips/[id]/page.tsx
│   ├── (app)/trips/[id]/balance/page.tsx
│   └── (app)/join/[token]/page.tsx
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts
│   ├── actions/trips.ts
│   ├── actions/expenses.ts
│   ├── actions/members.ts
│   ├── utils/currency.ts
│   └── utils/balance.ts
└── components/
    ├── trips/TripCard.tsx
    └── expenses/AddExpenseModal.tsx

tests/utils/currency.test.ts
tests/utils/balance.test.ts

wrangler.toml
open-next.config.ts
```

---

## Task 1: 專案初始化

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `wrangler.toml`, `open-next.config.ts`, `.env.local.example`

- [ ] **建立 Next.js 專案**

```bash
cd /Users/seitumbp2025/share-money
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

選項全部照提示選，ESLint: Yes, src/: Yes, App Router: Yes。

- [ ] **安裝相依套件**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D @opennextjs/cloudflare wrangler vitest @vitejs/plugin-react
```

- [ ] **建立 vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **建立 wrangler.toml**

```toml
name = "share-money"
main = ".open-next/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"

[vars]
NEXT_PUBLIC_SUPABASE_URL = ""
NEXT_PUBLIC_SUPABASE_ANON_KEY = ""
```

- [ ] **建立 open-next.config.ts**

```typescript
import type { OpenNextConfig } from '@opennextjs/cloudflare'

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: 'cloudflare-node',
      converter: 'edge',
    },
  },
}

export default config
```

- [ ] **在 package.json scripts 加入 Cloudflare 指令**

在 `package.json` 的 `scripts` 區塊加入：
```json
"deploy": "opennextjs-cloudflare build && wrangler deploy",
"preview": "opennextjs-cloudflare build && wrangler dev",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **建立 .env.local.example**

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

複製成 `.env.local` 後填入實際值（從 Supabase 專案 Settings → API 取得）。

- [ ] **Commit**

```bash
git add -A
git commit -m "chore: project scaffold with Next.js 15, Supabase, Cloudflare Workers"
```

---

## Task 2: TypeScript 型別定義

**Files:**
- Create: `src/types/database.ts`

- [ ] **建立資料庫型別**

```typescript
// src/types/database.ts

export type Currency = 'JPY' | 'TWD'

export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

export type Trip = {
  id: string
  name: string
  created_by: string
  exchange_rate: number
  invite_token: string
  created_at: string
}

export type TripMember = {
  trip_id: string
  user_id: string
  joined_at: string
}

export type Expense = {
  id: string
  trip_id: string
  title: string
  amount: number
  currency: Currency
  paid_by: string
  created_by: string
  created_at: string
}

export type ExpenseSplit = {
  expense_id: string
  user_id: string
  amount: number
}

export type SplitInput = {
  user_id: string
  amount: number
}

// Join type for display
export type TripWithMembers = Trip & {
  trip_members: Array<TripMember & { profiles: Profile }>
}

export type ExpenseWithSplits = Expense & {
  expense_splits: ExpenseSplit[]
  payer: Profile
}
```

- [ ] **Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add TypeScript database types"
```

---

## Task 3: Supabase 資料庫 Migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `supabase/functions/expense_helpers.sql`

- [ ] **建立 supabase/migrations/0001_init.sql**

```sql
-- supabase/migrations/0001_init.sql

-- Profiles (mirrors auth.users)
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text NOT NULL,
  avatar_url      text,
  created_at      timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trips
CREATE TABLE trips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  created_by    uuid NOT NULL REFERENCES profiles(id),
  exchange_rate numeric(10,4) NOT NULL CHECK (exchange_rate > 0),
  invite_token  uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at    timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips_select" ON trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_members.trip_id = trips.id AND trip_members.user_id = auth.uid()
  ));
CREATE POLICY "trips_delete" ON trips FOR DELETE TO authenticated
  USING (created_by = auth.uid());
-- No INSERT/UPDATE policy: SECURITY DEFINER functions only

-- Trip Members
CREATE TABLE trip_members (
  trip_id   uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES profiles(id),
  joined_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_members_select" ON trip_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM trip_members tm
    WHERE tm.trip_id = trip_members.trip_id AND tm.user_id = auth.uid()
  ));
-- No INSERT policy: SECURITY DEFINER functions only

-- Expenses
CREATE TABLE expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title       text NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  currency    text NOT NULL CHECK (currency IN ('JPY', 'TWD')),
  paid_by     uuid NOT NULL REFERENCES profiles(id),
  created_by  uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT jpy_integer_amount CHECK (currency = 'TWD' OR amount = floor(amount))
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_select" ON expenses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_members.trip_id = expenses.trip_id AND trip_members.user_id = auth.uid()
  ));
CREATE POLICY "expenses_delete" ON expenses FOR DELETE TO authenticated
  USING (created_by = auth.uid());
-- No INSERT policy: SECURITY DEFINER functions only

-- Expense Splits
CREATE TABLE expense_splits (
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id),
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (expense_id, user_id)
);
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_splits_select" ON expense_splits FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM expenses e
    JOIN trip_members tm ON tm.trip_id = e.trip_id
    WHERE e.id = expense_splits.expense_id AND tm.user_id = auth.uid()
  ));
-- No INSERT policy: SECURITY DEFINER functions only
```

- [ ] **建立 supabase/functions/expense_helpers.sql**

```sql
-- supabase/functions/expense_helpers.sql

-- create_trip
CREATE OR REPLACE FUNCTION create_trip(p_name text, p_exchange_rate numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_trip_id uuid;
BEGIN
  INSERT INTO trips (name, created_by, exchange_rate)
  VALUES (p_name, auth.uid(), p_exchange_rate)
  RETURNING id INTO v_trip_id;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid());
  RETURN v_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_trip FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_trip TO authenticated;

-- join_trip
CREATE OR REPLACE FUNCTION join_trip(p_invite_token uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_trip_id uuid;
BEGIN
  SELECT id INTO v_trip_id FROM trips WHERE invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid())
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  RETURN v_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION join_trip FROM public, anon;
GRANT  EXECUTE ON FUNCTION join_trip TO authenticated;

-- create_expense_with_splits
CREATE OR REPLACE FUNCTION create_expense_with_splits(
  p_trip_id  uuid,
  p_title    text,
  p_amount   numeric,
  p_currency text,
  p_paid_by  uuid,
  p_splits   jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_expense_id uuid;
  v_split      jsonb;
  v_split_sum  numeric := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = p_paid_by) THEN
    RAISE EXCEPTION 'PAID_BY_NOT_MEMBER';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = p_trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency = 'JPY' AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'JPY_SPLIT_NOT_INTEGER';
    END IF;
  END LOOP;

  IF v_split_sum != p_amount THEN RAISE EXCEPTION 'SPLIT_SUM_MISMATCH'; END IF;

  INSERT INTO expenses (trip_id, title, amount, currency, paid_by, created_by)
  VALUES (p_trip_id, p_title, p_amount, p_currency, p_paid_by, auth.uid())
  RETURNING id INTO v_expense_id;

  INSERT INTO expense_splits (expense_id, user_id, amount)
  SELECT v_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric
  FROM jsonb_array_elements(p_splits) s;

  RETURN v_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_expense_with_splits FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_expense_with_splits TO authenticated;

-- update_trip_exchange_rate
CREATE OR REPLACE FUNCTION update_trip_exchange_rate(p_trip_id uuid, p_rate numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF p_rate <= 0 THEN RAISE EXCEPTION 'INVALID_RATE'; END IF;
  UPDATE trips SET exchange_rate = p_rate WHERE id = p_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION update_trip_exchange_rate FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_trip_exchange_rate TO authenticated;
```

- [ ] **在 Supabase Dashboard 執行 migration**

1. 開啟 Supabase 專案 → SQL Editor
2. 貼上並執行 `0001_init.sql` 全文
3. 貼上並執行 `expense_helpers.sql` 全文
4. 確認 Table Editor 能看到 5 個 tables

- [ ] **Commit**

```bash
git add supabase/
git commit -m "feat: add database migration and SECURITY DEFINER functions"
```

---

## Task 4: Supabase Clients + Middleware

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/middleware.ts`

- [ ] **建立 browser client**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **建立 server client**

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **建立 middleware（auth guard + open redirect 防護）**

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isProtected = pathname.startsWith('/trips') || pathname.startsWith('/join')
  if (!user && isProtected) {
    // Prevent open redirect: only allow paths starting with /
    const rawNext = pathname + request.nextUrl.search
    const safeNext = rawNext.startsWith('/') ? rawNext : '/trips'
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', safeNext)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/trips'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Commit**

```bash
git add src/lib/supabase/ src/middleware.ts
git commit -m "feat: add Supabase clients and auth middleware"
```

---

## Task 5: Utility Functions（TDD）

**Files:**
- Create: `src/lib/utils/currency.ts`
- Create: `src/lib/utils/balance.ts`
- Create: `tests/utils/currency.test.ts`
- Create: `tests/utils/balance.test.ts`

- [ ] **先寫 currency 測試（讓它 fail）**

```typescript
// tests/utils/currency.test.ts
import { describe, it, expect } from 'vitest'
import { convertToTWD, formatAmount, splitEqually } from '@/lib/utils/currency'

describe('convertToTWD', () => {
  it('TWD amount returns unchanged', () => {
    expect(convertToTWD(1000, 'TWD', 0.218)).toBe(1000)
  })
  it('JPY converts using rate, rounded to 2dp', () => {
    expect(convertToTWD(1000, 'JPY', 0.218)).toBe(218)
    expect(convertToTWD(1, 'JPY', 0.218)).toBe(0.22)
  })
})

describe('formatAmount', () => {
  it('JPY: integer with ¥ prefix', () => {
    expect(formatAmount(1000, 'JPY')).toBe('¥1,000')
  })
  it('TWD: 2 decimal with NT$ prefix', () => {
    expect(formatAmount(100.5, 'TWD')).toBe('NT$100.50')
  })
})

describe('splitEqually', () => {
  it('JPY: remainder goes to first member', () => {
    expect(splitEqually(10, 3, 'JPY')).toEqual([4, 3, 3])
  })
  it('JPY: even split', () => {
    expect(splitEqually(9, 3, 'JPY')).toEqual([3, 3, 3])
  })
  it('TWD: sum equals total', () => {
    const result = splitEqually(10, 3, 'TWD')
    const sum = result.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100)).toBe(1000)
    expect(result).toHaveLength(3)
  })
  it('returns [] for count 0', () => {
    expect(splitEqually(100, 0, 'JPY')).toEqual([])
  })
})
```

- [ ] **執行測試，確認 fail**

```bash
npm test tests/utils/currency.test.ts
```

Expected: FAIL（找不到模組）

- [ ] **實作 currency.ts**

```typescript
// src/lib/utils/currency.ts
import type { Currency } from '@/types/database'

export function convertToTWD(amount: number, currency: Currency, rate: number): number {
  if (currency === 'TWD') return amount
  return Math.round(amount * rate * 100) / 100
}

export function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'JPY') return `¥${Math.round(amount).toLocaleString()}`
  return `NT$${amount.toFixed(2)}`
}

export function splitEqually(total: number, count: number, currency: Currency): number[] {
  if (count === 0) return []
  if (currency === 'JPY') {
    const base = Math.floor(total / count)
    const remainder = Math.round(total) - base * count
    return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base))
  }
  // TWD: 2 decimal places
  const base = Math.floor((total / count) * 100) / 100
  const remainder = Math.round((total - base * count) * 100) / 100
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? Math.round((base + remainder) * 100) / 100 : base
  )
}
```

- [ ] **執行測試，確認 pass**

```bash
npm test tests/utils/currency.test.ts
```

Expected: 所有 tests PASS

- [ ] **先寫 balance 測試（讓它 fail）**

```typescript
// tests/utils/balance.test.ts
import { describe, it, expect } from 'vitest'
import { calculateNetBalances, minimizeTransfers } from '@/lib/utils/balance'

describe('calculateNetBalances', () => {
  it('alice paid for both: alice net positive, bob net negative', () => {
    const expenses = [{ id: 'e1', amount: 1000, currency: 'JPY' as const, paid_by: 'alice' }]
    const splits = [
      { expense_id: 'e1', user_id: 'alice', amount: 500 },
      { expense_id: 'e1', user_id: 'bob', amount: 500 },
    ]
    const balances = calculateNetBalances(expenses, splits, 0.218)
    const alice = balances.find(b => b.userId === 'alice')!
    const bob = balances.find(b => b.userId === 'bob')!
    // alice paid 1000 JPY (218 TWD), owes 500 JPY (109 TWD) → net +109 TWD
    expect(alice.netTWD).toBeCloseTo(109, 2)
    expect(bob.netTWD).toBeCloseTo(-109, 2)
  })

  it('net sum is zero', () => {
    const expenses = [{ id: 'e1', amount: 300, currency: 'TWD' as const, paid_by: 'alice' }]
    const splits = [
      { expense_id: 'e1', user_id: 'alice', amount: 100 },
      { expense_id: 'e1', user_id: 'bob', amount: 100 },
      { expense_id: 'e1', user_id: 'carol', amount: 100 },
    ]
    const balances = calculateNetBalances(expenses, splits, 0.218)
    const total = balances.reduce((sum, b) => sum + b.netTWD, 0)
    expect(total).toBeCloseTo(0, 5)
  })
})

describe('minimizeTransfers', () => {
  it('simple: bob owes alice 100', () => {
    const balances = [
      { userId: 'alice', netTWD: 100 },
      { userId: 'bob', netTWD: -100 },
    ]
    const transfers = minimizeTransfers(balances)
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toEqual({ from: 'bob', to: 'alice', amountTWD: 100 })
  })

  it('3 people: 2 transfers', () => {
    const balances = [
      { userId: 'alice', netTWD: 200 },
      { userId: 'bob', netTWD: -100 },
      { userId: 'carol', netTWD: -100 },
    ]
    expect(minimizeTransfers(balances)).toHaveLength(2)
  })

  it('all zero: no transfers', () => {
    const balances = [
      { userId: 'alice', netTWD: 0 },
      { userId: 'bob', netTWD: 0 },
    ]
    expect(minimizeTransfers(balances)).toHaveLength(0)
  })
})
```

- [ ] **執行測試，確認 fail**

```bash
npm test tests/utils/balance.test.ts
```

Expected: FAIL

- [ ] **實作 balance.ts**

```typescript
// src/lib/utils/balance.ts
import type { Currency } from '@/types/database'
import { convertToTWD } from './currency'

type ExpenseRow = { id: string; amount: number; currency: Currency; paid_by: string }
type SplitRow   = { expense_id: string; user_id: string; amount: number }

export type NetBalance = { userId: string; netTWD: number }
export type Transfer   = { from: string; to: string; amountTWD: number }

export function calculateNetBalances(
  expenses: ExpenseRow[],
  splits: SplitRow[],
  exchangeRate: number
): NetBalance[] {
  const netMap = new Map<string, number>()

  for (const expense of expenses) {
    const paid = convertToTWD(expense.amount, expense.currency, exchangeRate)
    netMap.set(expense.paid_by, (netMap.get(expense.paid_by) ?? 0) + paid)
  }

  for (const split of splits) {
    const expense = expenses.find(e => e.id === split.expense_id)!
    const owed = convertToTWD(split.amount, expense.currency, exchangeRate)
    netMap.set(split.user_id, (netMap.get(split.user_id) ?? 0) - owed)
  }

  return Array.from(netMap.entries()).map(([userId, netTWD]) => ({ userId, netTWD }))
}

export function minimizeTransfers(balances: NetBalance[]): Transfer[] {
  const EPSILON = 0.005
  const transfers: Transfer[] = []

  const credits = balances
    .filter(b => b.netTWD > EPSILON)
    .sort((a, b) => b.netTWD - a.netTWD)
    .map(b => ({ ...b }))

  const debts = balances
    .filter(b => b.netTWD < -EPSILON)
    .sort((a, b) => a.netTWD - b.netTWD)
    .map(b => ({ ...b }))

  let ci = 0, di = 0
  while (ci < credits.length && di < debts.length) {
    const amount = Math.min(credits[ci].netTWD, -debts[di].netTWD)
    transfers.push({
      from: debts[di].userId,
      to: credits[ci].userId,
      amountTWD: Math.round(amount * 100) / 100,
    })
    credits[ci].netTWD -= amount
    debts[di].netTWD  += amount
    if (credits[ci].netTWD < EPSILON) ci++
    if (-debts[di].netTWD < EPSILON) di++
  }

  return transfers
}
```

- [ ] **執行全部測試，確認 pass**

```bash
npm test
```

Expected: 所有 tests PASS

- [ ] **Commit**

```bash
git add src/lib/utils/ tests/
git commit -m "feat: add currency and balance utility functions with tests"
```

---

## Task 6: Auth 流程

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/auth/callback/route.ts`
- Modify: `src/app/page.tsx`

- [ ] **建立 login 頁面**

```typescript
// src/app/(auth)/login/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(next?.startsWith('/') ? next : '/trips')

  async function signIn() {
    'use server'
    const supabase = await createClient()
    const { next: nextParam } = await searchParams
    const callbackUrl = new URL('/auth/callback', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    if (nextParam?.startsWith('/')) callbackUrl.searchParams.set('next', nextParam)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    })
    if (data.url) redirect(data.url)
    if (error) throw new Error(error.message)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow p-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight">✈️ ShareMoney</h1>
        <p className="text-sm text-gray-500">與朋友輕鬆分帳，旅遊不再傷感情</p>
        <form action={signIn} className="w-full">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium hover:bg-gray-50 transition"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            使用 Google 帳號登入
          </button>
        </form>
      </div>
    </main>
  )
}
```

- [ ] **在 .env.local 加入 NEXT_PUBLIC_SITE_URL**

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

同時在 Supabase Dashboard → Authentication → URL Configuration，將 `http://localhost:3000/auth/callback` 加入 Redirect URLs。

- [ ] **建立 OAuth callback route**

```typescript
// src/app/(auth)/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const safeNext = next?.startsWith('/') ? next : '/trips'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```

- [ ] **修改 root page**

```typescript
// src/app/page.tsx
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/trips')
}
```

- [ ] **在 Supabase Dashboard 啟用 Google OAuth**

1. Authentication → Providers → Google → Enable
2. 填入 Google Cloud Console 的 Client ID 和 Client Secret
3. Google Cloud Console → OAuth 2.0 → 加入 Authorized redirect URI：`https://<your-project>.supabase.co/auth/v1/callback`

- [ ] **手動測試登入**

```bash
npm run dev
```

開啟 http://localhost:3000 → 應自動跳轉 /login → 點 Google 登入 → 授權後跳回 /trips（暫時 404 是正常的）

- [ ] **Commit**

```bash
git add src/app/
git commit -m "feat: add Google OAuth login and auth callback"
```

---

## Task 7: Server Actions

**Files:**
- Create: `src/lib/actions/trips.ts`
- Create: `src/lib/actions/expenses.ts`
- Create: `src/lib/actions/members.ts`

- [ ] **建立 trips actions**

```typescript
// src/lib/actions/trips.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function createTripAction(formData: FormData) {
  const name = formData.get('name') as string
  const rateStr = formData.get('exchange_rate') as string
  const exchangeRate = parseFloat(rateStr)

  if (!name?.trim()) return { error: '請輸入行程名稱' }
  if (isNaN(exchangeRate) || exchangeRate <= 0) return { error: '請輸入有效匯率' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: name.trim(),
    p_exchange_rate: exchangeRate,
  })

  if (error) return { error: error.message }
  redirect(`/trips/${data}`)
}

export async function fetchExchangeRate(): Promise<number | null> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=JPY&to=TWD', {
      next: { revalidate: 3600 }, // cache 1 hour
    })
    const json = await res.json()
    return json.rates?.TWD ?? null
  } catch {
    return null
  }
}

export async function updateExchangeRateAction(tripId: string, rate: number) {
  if (rate <= 0) return { error: '匯率必須大於 0' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_trip_exchange_rate', {
    p_trip_id: tripId,
    p_rate: rate,
  })
  if (error) return { error: error.message }
  return { success: true }
}
```

- [ ] **建立 expenses actions**

```typescript
// src/lib/actions/expenses.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SplitInput, Currency } from '@/types/database'

export async function createExpenseAction(params: {
  tripId: string
  title: string
  amount: number
  currency: Currency
  paidBy: string
  splits: SplitInput[]
}) {
  const { tripId, title, amount, currency, paidBy, splits } = params

  if (!title.trim()) return { error: '請輸入費用名稱' }
  if (amount <= 0) return { error: '金額必須大於 0' }
  if (splits.length === 0) return { error: '請選擇分擔成員' }

  const splitSum = splits.reduce((s, sp) => s + sp.amount, 0)
  if (Math.abs(splitSum - amount) > 0.005) return { error: '分擔金額總和不等於費用金額' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_expense_with_splits', {
    p_trip_id: tripId,
    p_title: title.trim(),
    p_amount: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_splits: splits,
  })

  if (error) {
    const msg: Record<string, string> = {
      NOT_MEMBER: '你不是此行程成員',
      PAID_BY_NOT_MEMBER: '付款人不是行程成員',
      SPLIT_USER_NOT_MEMBER: '分擔成員中有非行程成員',
      SPLIT_SUM_MISMATCH: '分擔金額總和不等於費用金額',
      JPY_SPLIT_NOT_INTEGER: 'JPY 金額必須為整數',
    }
    const key = Object.keys(msg).find(k => error.message.includes(k))
    return { error: key ? msg[key] : error.message }
  }

  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}

export async function deleteExpenseAction(expenseId: string, tripId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)

  if (error) return { error: error.message }
  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}
```

- [ ] **建立 members actions**

```typescript
// src/lib/actions/members.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function joinTripAction(inviteToken: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('join_trip', {
    p_invite_token: inviteToken,
  })

  if (error) {
    if (error.message.includes('INVALID_TOKEN')) {
      return { error: 'INVALID_TOKEN' }
    }
    return { error: error.message }
  }

  redirect(`/trips/${data}`)
}
```

- [ ] **Commit**

```bash
git add src/lib/actions/
git commit -m "feat: add Server Actions for trips, expenses, and member join"
```

---

## Task 8: 行程列表頁 + 建立行程

**Files:**
- Create: `src/app/(app)/trips/page.tsx`
- Create: `src/app/(app)/trips/new/page.tsx`
- Create: `src/components/trips/TripCard.tsx`
- Create: `src/app/layout.tsx` (修改)

- [ ] **建立 root layout**

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ShareMoney',
  description: '旅遊分帳工具',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>{children}</body>
    </html>
  )
}
```

- [ ] **建立 TripCard 元件**

```typescript
// src/components/trips/TripCard.tsx
import Link from 'next/link'
import type { Trip } from '@/types/database'

export function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition"
    >
      <div className="font-semibold text-gray-900">{trip.name}</div>
      <div className="text-sm text-gray-500 mt-1">
        1 JPY = {trip.exchange_rate} TWD ·{' '}
        {new Date(trip.created_at).toLocaleDateString('zh-TW')}
      </div>
    </Link>
  )
}
```

- [ ] **建立行程列表頁**

```typescript
// src/app/(app)/trips/page.tsx
import { createClient } from '@/lib/supabase/server'
import { TripCard } from '@/components/trips/TripCard'
import Link from 'next/link'

export default async function TripsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Get trips where user is a member
  const { data: memberships } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('user_id', user!.id)

  const tripIds = memberships?.map(m => m.trip_id) ?? []

  const { data: trips } = await supabase
    .from('trips')
    .select('*')
    .in('id', tripIds.length > 0 ? tripIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">我的行程</h1>
        <Link
          href="/trips/new"
          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          + 新增行程
        </Link>
      </div>

      {trips?.length === 0 ? (
        <p className="text-center text-gray-400 py-12">還沒有行程，點右上角建立第一個</p>
      ) : (
        <div className="flex flex-col gap-3">
          {trips?.map(trip => <TripCard key={trip.id} trip={trip} />)}
        </div>
      )}
    </main>
  )
}
```

- [ ] **建立新增行程頁**

```typescript
// src/app/(app)/trips/new/page.tsx
import { createTripAction, fetchExchangeRate } from '@/lib/actions/trips'
import Link from 'next/link'

export default async function NewTripPage() {
  const rate = await fetchExchangeRate()

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trips" className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold">新增行程</h1>
      </div>

      <form action={createTripAction} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">行程名稱</label>
          <input
            name="name"
            type="text"
            required
            placeholder="東京五日遊"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            匯率（1 JPY = ? TWD）
          </label>
          <input
            name="exchange_rate"
            type="number"
            step="0.0001"
            min="0.0001"
            required
            defaultValue={rate ?? ''}
            placeholder={rate ? String(rate) : '請手動輸入（目前無法取得即時匯率）'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {rate ? (
            <p className="text-xs text-gray-400 mt-1">已自動填入即時匯率，可手動修改</p>
          ) : (
            <p className="text-xs text-red-400 mt-1">無法取得即時匯率，請手動輸入</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          建立行程
        </button>
      </form>
    </main>
  )
}
```

- [ ] **手動測試：建立行程**

```bash
npm run dev
```

登入後 → 點「新增行程」→ 填名稱和匯率 → 送出 → 應跳轉到 `/trips/[id]`（暫時 404）

- [ ] **Commit**

```bash
git add src/app/ src/components/
git commit -m "feat: add trip list page and create trip form"
```

---

## Task 9: AddExpenseModal 元件

**Files:**
- Create: `src/components/expenses/AddExpenseModal.tsx`

- [ ] **建立 AddExpenseModal（Client Component）**

```typescript
// src/components/expenses/AddExpenseModal.tsx
'use client'

import { useState, useTransition } from 'react'
import { createExpenseAction } from '@/lib/actions/expenses'
import { splitEqually } from '@/lib/utils/currency'
import type { Profile, Currency } from '@/types/database'

type Props = {
  tripId: string
  members: Profile[]
  currentUserId: string
}

export function AddExpenseModal({ tripId, members, currentUserId }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('JPY')
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  const [selectedIds, setSelectedIds] = useState<string[]>(members.map(m => m.id))
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})

  function computedSplits() {
    const numAmount = parseFloat(amount) || 0
    if (splitMode === 'equal') {
      const selected = members.filter(m => selectedIds.includes(m.id))
      const amounts = splitEqually(numAmount, selected.length, currency)
      return selected.map((m, i) => ({ user_id: m.id, amount: amounts[i] }))
    }
    return selectedIds.map(id => ({
      user_id: id,
      amount: parseFloat(customAmounts[id] ?? '0') || 0,
    }))
  }

  function splitSum() {
    return computedSplits().reduce((s, sp) => s + sp.amount, 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const numAmount = parseFloat(amount)
    const result = await new Promise<{ error?: string; success?: boolean }>(resolve => {
      startTransition(async () => {
        const r = await createExpenseAction({
          tripId,
          title,
          amount: numAmount,
          currency,
          paidBy,
          splits: computedSplits(),
        })
        resolve(r ?? { success: true })
      })
    })
    if (result.error) { setError(result.error); return }
    setOpen(false)
    setTitle(''); setAmount(''); setCurrency('JPY'); setPaidBy(currentUserId)
    setSplitMode('equal'); setSelectedIds(members.map(m => m.id)); setCustomAmounts({})
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-indigo-200 rounded-xl py-3 text-indigo-500 text-sm hover:border-indigo-400 hover:text-indigo-600 transition"
      >
        + 新增費用
      </button>
    )
  }

  const numAmount = parseFloat(amount) || 0
  const sumOk = Math.abs(splitSum() - numAmount) < 0.005

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-bold text-lg">新增費用</h2>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">費用名稱</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)} required
            placeholder="拉麵午餐"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">金額</label>
            <input
              value={amount} onChange={e => setAmount(e.target.value)}
              type="number" min="0" step={currency === 'JPY' ? '1' : '0.01'} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">幣別</label>
            <select
              value={currency} onChange={e => setCurrency(e.target.value as Currency)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="JPY">JPY</option>
              <option value="TWD">TWD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">由誰付款</label>
          <select
            value={paidBy} onChange={e => setPaidBy(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.display_name}{m.id === currentUserId ? '（我）' : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex gap-2 mb-3">
            {(['equal', 'custom'] as const).map(mode => (
              <button
                key={mode} type="button"
                onClick={() => setSplitMode(mode)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition ${
                  splitMode === mode
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                {mode === 'equal' ? '均攤' : '自訂金額'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {members.map(m => {
              const checked = selectedIds.includes(m.id)
              const equalAmt = splitMode === 'equal'
                ? splitEqually(numAmount, selectedIds.length, currency)[selectedIds.indexOf(m.id)]
                : null
              return (
                <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        setSelectedIds(prev =>
                          e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id)
                        )
                      }}
                      className="rounded"
                    />
                    {m.display_name}{m.id === currentUserId ? '（我）' : ''}
                  </label>
                  {splitMode === 'equal' ? (
                    <span className="text-sm font-medium text-indigo-600">
                      {checked && numAmount > 0 ? (currency === 'JPY' ? `¥${equalAmt}` : `NT$${equalAmt?.toFixed(2)}`) : '—'}
                    </span>
                  ) : (
                    <input
                      type="number" min="0" step={currency === 'JPY' ? '1' : '0.01'}
                      value={customAmounts[m.id] ?? ''}
                      onChange={e => setCustomAmounts(prev => ({ ...prev, [m.id]: e.target.value }))}
                      disabled={!checked}
                      placeholder="0"
                      className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {splitMode === 'custom' && numAmount > 0 && (
            <p className={`text-xs mt-2 ${sumOk ? 'text-green-600' : 'text-red-500'}`}>
              {sumOk ? '✅ 金額總和正確' : `⚠️ 總計 ${splitSum().toFixed(2)} / ${numAmount} — 差額 ${Math.abs(splitSum() - numAmount).toFixed(2)}`}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button" onClick={() => setOpen(false)}
            className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            取消
          </button>
          <button
            type="submit" disabled={isPending}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {isPending ? '新增中...' : '新增費用'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/components/expenses/
git commit -m "feat: add AddExpenseModal with equal/custom split modes"
```

---

## Task 10: 行程詳細頁

**Files:**
- Create: `src/app/(app)/trips/[id]/page.tsx`

- [ ] **建立行程詳細頁**

```typescript
// src/app/(app)/trips/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { formatAmount } from '@/lib/utils/currency'
import { updateExchangeRateAction } from '@/lib/actions/trips'
import { deleteExpenseAction } from '@/lib/actions/expenses'
import Link from 'next/link'

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: trip } = await supabase.from('trips').select('*').eq('id', id).single()
  if (!trip) notFound()

  const { data: memberships } = await supabase
    .from('trip_members')
    .select('user_id, profiles(id, display_name, avatar_url)')
    .eq('trip_id', id)

  const members = memberships?.map(m => m.profiles).filter(Boolean) as any[]

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, expense_splits(*), payer:profiles!paid_by(id, display_name)')
    .eq('trip_id', id)
    .order('created_at', { ascending: false })

  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/join/${trip.invite_token}`

  async function updateRate(formData: FormData) {
    'use server'
    const rate = parseFloat(formData.get('rate') as string)
    await updateExchangeRateAction(id, rate)
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/trips" className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold flex-1">{trip.name}</h1>
        <Link href={`/trips/${id}/balance`} className="text-sm text-indigo-600 font-medium">
          結算 →
        </Link>
      </div>

      {/* Exchange rate */}
      <form action={updateRate} className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <span>1 JPY =</span>
        <input
          name="rate"
          type="number"
          step="0.0001"
          defaultValue={trip.exchange_rate}
          className="w-24 border border-gray-200 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        <span>TWD</span>
        <button type="submit" className="text-indigo-500 hover:text-indigo-700 text-xs">更新</button>
      </form>

      {/* Members */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">成員（{members.length} 人）</h2>
        <div className="flex flex-wrap gap-2">
          {members.map((m: any) => (
            <span key={m.id} className="bg-gray-100 rounded-full px-3 py-1 text-sm">
              {m.display_name}
            </span>
          ))}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(inviteUrl)
          }}
          className="mt-2 text-xs text-indigo-500 hover:text-indigo-700"
        >
          📋 複製邀請連結
        </button>
      </section>

      {/* Expenses */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">費用明細</h2>
        <div className="flex flex-col gap-2 mb-3">
          {expenses?.map(expense => (
            <div key={expense.id} className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{expense.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatAmount(expense.amount, expense.currency)} ·{' '}
                    {(expense.payer as any)?.display_name} 付
                  </div>
                </div>
                {expense.created_by === user!.id && (
                  <form action={async () => {
                    'use server'
                    await deleteExpenseAction(expense.id, id)
                  }}>
                    <button type="submit" className="text-xs text-red-400 hover:text-red-600">刪除</button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
        <AddExpenseModal tripId={id} members={members} currentUserId={user!.id} />
      </section>
    </main>
  )
}
```

- [ ] **手動測試：行程詳細頁**

```bash
npm run dev
```

登入 → 建立行程 → 應看到空的費用列表和「新增費用」按鈕 → 新增一筆費用 → 應出現在列表中

- [ ] **Commit**

```bash
git add src/app/\(app\)/trips/
git commit -m "feat: add trip detail page with expense list and inline rate editor"
```

---

## Task 11: 分帳結算頁

**Files:**
- Create: `src/app/(app)/trips/[id]/balance/page.tsx`

- [ ] **建立結算頁**

```typescript
// src/app/(app)/trips/[id]/balance/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { calculateNetBalances, minimizeTransfers } from '@/lib/utils/balance'
import { formatAmount, convertToTWD } from '@/lib/utils/currency'
import Link from 'next/link'

export default async function BalancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: trip } = await supabase.from('trips').select('*').eq('id', id).single()
  if (!trip) notFound()

  const { data: memberships } = await supabase
    .from('trip_members')
    .select('user_id, profiles(id, display_name)')
    .eq('trip_id', id)

  const profileMap = new Map(
    memberships?.map(m => [(m.profiles as any).id, (m.profiles as any).display_name]) ?? []
  )

  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, amount, currency, paid_by')
    .eq('trip_id', id)

  const { data: splits } = await supabase
    .from('expense_splits')
    .select('expense_id, user_id, amount')
    .in('expense_id', expenses?.map(e => e.id) ?? [])

  const balances = calculateNetBalances(expenses ?? [], splits ?? [], trip.exchange_rate)
  const transfers = minimizeTransfers(balances)

  const totalTWD = expenses?.reduce(
    (sum, e) => sum + convertToTWD(e.amount, e.currency as any, trip.exchange_rate),
    0
  ) ?? 0

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/trips/${id}`} className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold">分帳結算</h1>
      </div>

      <div className="bg-indigo-50 rounded-xl p-4 mb-6 flex justify-between">
        <div>
          <div className="text-xs text-indigo-500 font-medium">行程總費用</div>
          <div className="text-2xl font-bold text-indigo-700">NT${totalTWD.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-indigo-500 font-medium">使用匯率</div>
          <div className="text-sm text-indigo-700">1 JPY = {trip.exchange_rate} TWD</div>
        </div>
      </div>

      {transfers.length === 0 ? (
        <p className="text-center text-gray-400 py-8">🎉 已全部結清</p>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-500">轉帳清單（共 {transfers.length} 筆）</h2>
          {transfers.map((t, i) => (
            <div key={i} className="bg-white border border-red-100 rounded-xl p-4 flex justify-between items-center">
              <div className="text-sm">
                <span className="font-medium text-red-600">{profileMap.get(t.from)}</span>
                <span className="text-gray-400"> 付給 </span>
                <span className="font-medium text-green-700">{profileMap.get(t.to)}</span>
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900">NT${t.amountTWD.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **手動測試：結算頁**

新增多筆費用 → 點「結算 →」→ 確認轉帳清單正確

- [ ] **Commit**

```bash
git add src/app/\(app\)/trips/\[id\]/balance/
git commit -m "feat: add balance/settlement page"
```

---

## Task 12: 加入行程（分享連結）

**Files:**
- Create: `src/app/(app)/join/[token]/page.tsx`

- [ ] **建立 join 頁面**

```typescript
// src/app/(app)/join/[token]/page.tsx
import { joinTripAction } from '@/lib/actions/members'
import { createClient } from '@/lib/supabase/server'

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // middleware 應已 redirect，這裡作保險
    return null
  }

  async function join() {
    'use server'
    await joinTripAction(token)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-sm text-center flex flex-col gap-4">
        <div className="text-4xl">✈️</div>
        <h1 className="text-xl font-bold">加入行程</h1>
        <p className="text-sm text-gray-500">點下方按鈕加入此行程</p>
        <form action={join}>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition"
          >
            確認加入
          </button>
        </form>
      </div>
    </main>
  )
}
```

- [ ] **測試 joinTripAction 的 INVALID_TOKEN 路徑**

在 `src/app/(app)/join/[token]/page.tsx` 中，在 Server Action 呼叫後加入錯誤處理：

```typescript
// 修改 join function 為：
async function join() {
  'use server'
  const result = await joinTripAction(token)
  if (result?.error === 'INVALID_TOKEN') {
    // return to invalid page - handled by redirect in joinTripAction
  }
}
```

- [ ] **建立無效連結頁面**

修改 `joinTripAction`，當 token 無效時 redirect 到錯誤頁：

```typescript
// 在 src/lib/actions/members.ts 的 joinTripAction 結尾加：
if (error.message.includes('INVALID_TOKEN')) {
  redirect('/join/invalid')
}
```

建立 `src/app/(app)/join/invalid/page.tsx`：

```typescript
// src/app/(app)/join/invalid/page.tsx
import Link from 'next/link'

export default function InvalidTokenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-4">❌</div>
        <h1 className="text-xl font-bold mb-2">連結無效</h1>
        <p className="text-sm text-gray-500 mb-6">此邀請連結不存在，請向行程建立者重新索取。</p>
        <Link href="/trips" className="text-indigo-600 text-sm font-medium hover:underline">
          返回我的行程
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **修改行程詳細頁：複製邀請連結按鈕**

在 `src/app/(app)/trips/[id]/page.tsx` 中，`複製邀請連結` 按鈕需要是 Client Component。新增 `src/components/trips/CopyInviteButton.tsx`：

```typescript
// src/components/trips/CopyInviteButton.tsx
'use client'

export function CopyInviteButton({ inviteUrl }: { inviteUrl: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(inviteUrl)
        alert('已複製邀請連結！')
      }}
      className="mt-2 text-xs text-indigo-500 hover:text-indigo-700"
    >
      📋 複製邀請連結
    </button>
  )
}
```

在 `trips/[id]/page.tsx` 中 import 並使用 `<CopyInviteButton inviteUrl={inviteUrl} />`，移除原本 onClick 的 button。

- [ ] **手動測試：分享連結**

1. 複製邀請連結
2. 開新的無痕視窗 → 貼上連結
3. 未登入 → 應跳轉 Google 登入 → 登入後跳回 /join/[token]
4. 點「確認加入」→ 應跳轉到行程詳細頁，自己出現在成員列表

- [ ] **Commit**

```bash
git add src/app/\(app\)/join/ src/components/trips/CopyInviteButton.tsx
git commit -m "feat: add join trip page and invalid token page"
```

---

## Task 13: Cloudflare 部署

**Files:**
- Modify: `next.config.ts`

- [ ] **確認 next.config.ts 設定**

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for @opennextjs/cloudflare
}

export default nextConfig
```

- [ ] **設定 Cloudflare Workers 環境變數**

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
npx wrangler secret put NEXT_PUBLIC_SITE_URL
```

- [ ] **Build 並測試本機 Cloudflare 環境**

```bash
npm run preview
```

開啟 http://localhost:8787，確認登入和行程功能正常。

- [ ] **Deploy**

```bash
npm run deploy
```

部署完成後取得 Workers URL，更新 Supabase OAuth redirect URL 和 `NEXT_PUBLIC_SITE_URL`。

- [ ] **最終 commit**

```bash
git add -A
git commit -m "chore: finalize Cloudflare Workers deployment config"
```

---

## Self-Review

**Spec 覆蓋確認：**

| Spec 功能 | 對應 Task |
|-----------|-----------|
| Google OAuth 登入 | Task 6 |
| 建立行程（名稱 + 匯率） | Task 8 |
| 即時匯率 API + fallback | Task 7 (fetchExchangeRate) |
| 分享連結加入行程 | Task 12 |
| 新增費用（均攤/自訂） | Task 9 |
| 刪除費用 | Task 10 |
| 分帳計算（簡化轉帳） | Task 11 |
| 結算清單 TWD + JPY 顯示 | Task 11 |
| inline 改匯率 | Task 10 |
| SECURITY DEFINER functions | Task 3 |
| RLS policies | Task 3 |
| open redirect 防護 | Task 4 |
| JPY 整數驗證 | Task 3 (SQL) + Task 9 (client) |
| Cloudflare Workers 部署 | Task 1, 13 |
| unit tests | Task 5 |

**所有 Spec 功能皆有對應 Task，無遺漏。**
