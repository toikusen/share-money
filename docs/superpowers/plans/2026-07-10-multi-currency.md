# 多幣別 + 即時匯率 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓每個行程可選一種常用外幣（港幣/美金/韓元…），建立行程時自動抓該幣別對台幣即時匯率；家用幣仍固定 TWD。

**Architecture:** 沿用「單一 `trips.exchange_rate` + 家用幣 TWD」模型，行程新增 `foreign_currency` 欄位記錄該趟外幣，全程只有「外幣 + TWD」兩種幣別。幣別的符號與小數位集中在 `src/lib/utils/currency.ts` 的 `CURRENCIES` 表，取代散落的 `=== 'JPY'` 判斷。結算邏輯（`convertToTWD`/`calculateMemberStats`/`minimizeTransfers`）不動。

**Tech Stack:** Next.js（App Router，`node_modules/next/dist/docs/` 為準）、Supabase（Postgres RPC + RLS）、Vitest、TypeScript。

## Global Constraints

- 家用幣固定 `TWD`，所有結算換算成 TWD。
- 支援幣別（單一事實來源 `CURRENCIES`）：`JPY 日圓 ¥ 0位`、`KRW 韓元 ₩ 0位`、`VND 越南盾 ₫ 0位`、`USD 美金 $ 2位`、`HKD 港幣 HK$ 2位`、`CNY 人民幣 CN¥ 2位`、`EUR 歐元 € 2位`、`THB 泰銖 ฿ 2位`、`GBP 英鎊 £ 2位`、`TWD 台幣 NT$ 2位`。
- 零小數幣別（金額須為整數）：`JPY`、`KRW`、`VND`。
- 外幣可選清單 = 支援幣別排除 `TWD`。
- 即時匯率來源 `https://tw.rter.info/capi.php`（USD 基準表）；`外幣→TWD = USDTWD / USD<外幣>`，四捨五入 4 位。
- RPC 整數錯誤碼統一為 `SPLIT_NOT_INTEGER`（取代舊 `JPY_SPLIT_NOT_INTEGER`）；新增 `INVALID_CURRENCY`。
- 測試指令：`pnpm test`（= `vitest run`）。commit 訊息用 Gitmoji + Conventional Commits。
- 舊資料零遷移：既有行程 `foreign_currency` 預設 `'JPY'`。

---

### Task 1: 幣別 metadata、型別、util 泛化

把寫死的 JPY 判斷改成查 `CURRENCIES` 表。這是後續所有任務的型別與工具基礎。

**Files:**
- Modify: `src/types/database.ts`（`Currency` union、`Trip` 型別）
- Modify: `src/lib/utils/currency.ts`（新增 `CURRENCIES`、`FOREIGN_CURRENCIES`、`foreignToTwdRate`；改寫 `formatAmount`/`splitEqually`/`splitWithRemainder`）
- Test: `tests/utils/currency.test.ts`

**Interfaces:**
- Produces:
  - `type Currency = 'JPY' | 'KRW' | 'VND' | 'USD' | 'HKD' | 'CNY' | 'EUR' | 'THB' | 'GBP' | 'TWD'`
  - `CURRENCIES: Record<Currency, { label: string; symbol: string; decimals: number }>`
  - `FOREIGN_CURRENCIES: Currency[]`（不含 `TWD`）
  - `foreignToTwdRate(usdRates: Record<string, number>, currency: Currency): number | null`
  - `formatAmount(amount: number, currency: Currency): string`（不變簽名）
  - `splitEqually(total, count, currency)` / `splitWithRemainder(total, currency, entries)`（不變簽名）

- [ ] **Step 1: 改 `Currency` union 與 `Trip` 型別**

`src/types/database.ts` 第 1 行：
```ts
export type Currency = 'JPY' | 'KRW' | 'VND' | 'USD' | 'HKD' | 'CNY' | 'EUR' | 'THB' | 'GBP' | 'TWD'
```
在 `Trip` 型別（含 `exchange_rate`、`start_date` 等欄位的那個 interface/type）加一行：
```ts
  foreign_currency: Currency
```

- [ ] **Step 2: 寫失敗測試**

在 `tests/utils/currency.test.ts` 檔尾（最後一個 `})` 之後）補上：
```ts
import { CURRENCIES, FOREIGN_CURRENCIES, foreignToTwdRate } from '@/lib/utils/currency'

describe('CURRENCIES table', () => {
  it('FOREIGN_CURRENCIES excludes TWD', () => {
    expect(FOREIGN_CURRENCIES).not.toContain('TWD')
    expect(FOREIGN_CURRENCIES).toContain('JPY')
    expect(FOREIGN_CURRENCIES).toContain('HKD')
  })
})

describe('formatAmount (multi-currency)', () => {
  it('KRW: integer with ₩ prefix', () => {
    expect(formatAmount(15000, 'KRW')).toBe('₩15,000')
  })
  it('HKD: 2 decimals with HK$ prefix', () => {
    expect(formatAmount(123.4, 'HKD')).toBe('HK$123.40')
  })
})

describe('splitEqually (zero-decimal currencies)', () => {
  it('KRW splits as integers, remainder to first', () => {
    expect(splitEqually(10, 3, 'KRW')).toEqual([4, 3, 3])
  })
  it('HKD splits with 2 decimals summing to total', () => {
    const result = splitEqually(10, 3, 'HKD')
    expect(Math.round(result.reduce((a, b) => a + b, 0) * 100)).toBe(1000)
  })
})

describe('splitWithRemainder (zero-decimal currencies)', () => {
  it('KRW rounds the auto share to integers', () => {
    const result = splitWithRemainder(1000, 'KRW', [
      { id: 'a', custom: 100 },
      { id: 'b', custom: null },
      { id: 'c', custom: null },
      { id: 'd', custom: null },
    ])
    expect(result.splits[0].amount).toBe(100)
    expect(result.splits.slice(1).map(s => s.amount)).toEqual([300, 300, 300])
  })
})

describe('foreignToTwdRate', () => {
  const usd = { USDTWD: 32.088, USDJPY: 161.522, USDHKD: 7.83788, USDUSD: 1 }
  it('JPY→TWD = USDTWD / USDJPY', () => {
    expect(foreignToTwdRate(usd, 'JPY')).toBe(0.1987)
  })
  it('USD→TWD = USDTWD (USDUSD = 1)', () => {
    expect(foreignToTwdRate(usd, 'USD')).toBe(32.088)
  })
  it('TWD (home currency) returns null', () => {
    expect(foreignToTwdRate(usd, 'TWD')).toBeNull()
  })
  it('missing pair returns null', () => {
    expect(foreignToTwdRate({ USDTWD: 32 }, 'HKD')).toBeNull()
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm test -- currency`
Expected: FAIL —「CURRENCIES/FOREIGN_CURRENCIES/foreignToTwdRate is not exported」、KRW formatAmount 得到 `NT$…`。

- [ ] **Step 4: 實作 `CURRENCIES` 表與泛化工具**

`src/lib/utils/currency.ts` 第 1-11 行（import 之後、`convertToTWD` 之前與 `formatAmount`）改為：
```ts
import type { Currency } from '@/types/database'

export const CURRENCIES: Record<Currency, { label: string; symbol: string; decimals: number }> = {
  JPY: { label: '日圓', symbol: '¥', decimals: 0 },
  KRW: { label: '韓元', symbol: '₩', decimals: 0 },
  VND: { label: '越南盾', symbol: '₫', decimals: 0 },
  USD: { label: '美金', symbol: '$', decimals: 2 },
  HKD: { label: '港幣', symbol: 'HK$', decimals: 2 },
  CNY: { label: '人民幣', symbol: 'CN¥', decimals: 2 },
  EUR: { label: '歐元', symbol: '€', decimals: 2 },
  THB: { label: '泰銖', symbol: '฿', decimals: 2 },
  GBP: { label: '英鎊', symbol: '£', decimals: 2 },
  TWD: { label: '台幣', symbol: 'NT$', decimals: 2 },
}

export const FOREIGN_CURRENCIES = (Object.keys(CURRENCIES) as Currency[]).filter(c => c !== 'TWD')

/** 從 USD 基準匯率表算出 外幣→TWD 匯率；家用幣或缺資料回傳 null。 */
export function foreignToTwdRate(usdRates: Record<string, number>, currency: Currency): number | null {
  if (currency === 'TWD') return null
  const usdTwd = usdRates['USDTWD']
  const usdCur = usdRates[`USD${currency}`]
  if (!usdTwd || !usdCur) return null
  return Math.round((usdTwd / usdCur) * 10000) / 10000
}

export function convertToTWD(amount: number, currency: Currency, rate: number): number {
  if (currency === 'TWD') return amount
  return Math.round(amount * rate * 100) / 100
}

export function formatAmount(amount: number, currency: Currency): string {
  const { symbol, decimals } = CURRENCIES[currency]
  const value = decimals === 0
    ? Math.round(amount).toLocaleString()
    : amount.toFixed(decimals)
  return `${symbol}${value}`
}
```

`splitWithRemainder` 的 `round` helper（原第 46-47 行）改為：
```ts
  const decimals = CURRENCIES[currency].decimals
  const round = (n: number) =>
    decimals === 0 ? Math.round(n) : Math.round(n * 100) / 100
```

`splitEqually`（原第 67-80 行）改為以 `decimals` 分流：
```ts
export function splitEqually(total: number, count: number, currency: Currency): number[] {
  if (count === 0) return []
  if (CURRENCIES[currency].decimals === 0) {
    const base = Math.floor(total / count)
    const remainder = Math.round(total) - base * count
    return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base))
  }
  const base = Math.floor((total / count) * 100) / 100
  const remainder = Math.round((total - base * count) * 100) / 100
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? Math.round((base + remainder) * 100) / 100 : base
  )
}
```
（`formatAmount` 內原本寫死 JPY 的 `¥` 與 TWD 的 `NT$.toFixed(2)` 已由上方新版取代；確認舊版兩行已刪除。）

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm test -- currency`
Expected: PASS（含既有 JPY/TWD 案例仍綠 —— `¥1,000`、`NT$100.50` 不變）。

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/lib/utils/currency.ts tests/utils/currency.test.ts
git commit -m "✨ feat(currency): CURRENCIES table + generalize split/format to N currencies"
```

---

### Task 2: DB migration 0012（欄位、約束、RPC）

新增 `foreign_currency` 欄、放寬幣別約束、泛化整數約束、更新 3 個 RPC（含幣別信任邊界驗證）。

**Files:**
- Create: `supabase/migrations/0012_multi_currency.sql`

**Interfaces:**
- Produces:
  - `trips.foreign_currency`（`text NOT NULL DEFAULT 'JPY'`）
  - RPC `create_trip(text, numeric, date, date, text)`（尾參 `p_foreign_currency`）
  - RPC `create_expense_with_splits` / `update_expense_with_splits`：新增 `INVALID_CURRENCY`、整數錯誤碼改 `SPLIT_NOT_INTEGER`
- Consumes: Task 1 的支援幣別清單（SQL 內以字面列出）

- [ ] **Step 1: 寫 migration 檔**

Create `supabase/migrations/0012_multi_currency.sql`：
```sql
-- Multi-currency: each trip picks one foreign currency (home currency stays TWD).

-- 1. trips: which foreign currency this trip uses
ALTER TABLE trips ADD COLUMN foreign_currency text NOT NULL DEFAULT 'JPY'
  CHECK (foreign_currency IN ('JPY','KRW','VND','USD','HKD','CNY','EUR','THB','GBP'));

-- 2. expenses: allow full supported set; integer rule now covers all zero-decimal currencies
ALTER TABLE expenses DROP CONSTRAINT expenses_currency_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_currency_check
  CHECK (currency IN ('JPY','KRW','VND','USD','HKD','CNY','EUR','THB','GBP','TWD'));

ALTER TABLE expenses DROP CONSTRAINT jpy_integer_amount;
ALTER TABLE expenses ADD CONSTRAINT zero_decimal_integer_amount
  CHECK (currency NOT IN ('JPY','KRW','VND') OR amount = floor(amount));

-- 3. create_trip: add p_foreign_currency (drop old 4-arg signature to avoid overload ambiguity)
DROP FUNCTION IF EXISTS create_trip(text, numeric, date, date);
CREATE OR REPLACE FUNCTION create_trip(
  p_name             text,
  p_exchange_rate    numeric,
  p_start_date       date DEFAULT NULL,
  p_end_date         date DEFAULT NULL,
  p_foreign_currency text DEFAULT 'JPY'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_trip_id uuid;
BEGIN
  INSERT INTO trips (name, created_by, exchange_rate, start_date, end_date, foreign_currency)
  VALUES (p_name, auth.uid(), p_exchange_rate, p_start_date, p_end_date, p_foreign_currency)
  RETURNING id INTO v_trip_id;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid());

  INSERT INTO activity_logs (trip_id, actor_id, action)
  VALUES (v_trip_id, auth.uid(), 'trip.created');

  RETURN v_trip_id;
END;
$$;

-- 4. expense RPCs: generalize integer check + validate currency belongs to this trip.
--    Bodies below are 0009's current definitions verbatim, with ONLY these edits:
--    (a) declare v_foreign; (b) add INVALID_CURRENCY guard; (c) integer check
--    condition JPY → IN ('JPY','KRW','VND') and error code → SPLIT_NOT_INTEGER.
--    Approval logic (approval_status inserts) and the update diff/log are unchanged.
CREATE OR REPLACE FUNCTION create_expense_with_splits(
  p_trip_id  uuid,
  p_title    text,
  p_amount   numeric,
  p_currency text,
  p_paid_by  uuid,
  p_paid_at  timestamptz,
  p_splits   jsonb,
  p_note     text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid;
  v_split      jsonb;
  v_split_sum  numeric := 0;
  v_foreign    text;
BEGIN
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'PAID_AT_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = p_paid_by) THEN
    RAISE EXCEPTION 'PAID_BY_NOT_MEMBER';
  END IF;

  SELECT foreign_currency INTO v_foreign FROM trips WHERE id = p_trip_id;
  IF p_currency NOT IN (v_foreign, 'TWD') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = p_trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency IN ('JPY','KRW','VND') AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'SPLIT_NOT_INTEGER';
    END IF;
  END LOOP;

  IF v_split_sum != p_amount THEN RAISE EXCEPTION 'SPLIT_SUM_MISMATCH'; END IF;

  INSERT INTO expenses (trip_id, title, amount, currency, paid_by, paid_at, note, created_by)
  VALUES (p_trip_id, p_title, p_amount, p_currency, p_paid_by, p_paid_at, NULLIF(btrim(p_note), ''), auth.uid())
  RETURNING id INTO v_expense_id;

  -- creator's own split auto-approved, others pending (unchanged from 0009)
  INSERT INTO expense_splits (expense_id, user_id, amount, approval_status)
  SELECT v_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric,
         CASE WHEN (s->>'user_id')::uuid = auth.uid() THEN 'approved' ELSE 'pending' END
  FROM jsonb_array_elements(p_splits) s;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (p_trip_id, auth.uid(), 'expense.created',
          jsonb_build_object('title', p_title, 'amount', p_amount, 'currency', p_currency));

  RETURN v_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION update_expense_with_splits(
  p_expense_id uuid,
  p_title      text,
  p_amount     numeric,
  p_currency   text,
  p_paid_by    uuid,
  p_paid_at    timestamptz,
  p_splits     jsonb,
  p_note       text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old        expenses%ROWTYPE;
  v_note       text := NULLIF(btrim(p_note), '');
  v_split      jsonb;
  v_split_sum  numeric := 0;
  v_old_splits jsonb;
  v_new_splits jsonb;
  v_old_diff   jsonb := '{}'::jsonb;
  v_new_diff   jsonb := '{}'::jsonb;
  v_foreign    text;
BEGIN
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'PAID_AT_REQUIRED';
  END IF;

  -- Only the expense creator may edit (mirrors expenses_delete RLS policy)
  SELECT * INTO v_old FROM expenses
  WHERE id = p_expense_id AND created_by = auth.uid();
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;

  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = v_old.trip_id AND user_id = p_paid_by) THEN
    RAISE EXCEPTION 'PAID_BY_NOT_MEMBER';
  END IF;

  SELECT foreign_currency INTO v_foreign FROM trips WHERE id = v_old.trip_id;
  IF p_currency NOT IN (v_foreign, 'TWD') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = v_old.trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency IN ('JPY','KRW','VND') AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'SPLIT_NOT_INTEGER';
    END IF;
  END LOOP;

  IF v_split_sum != p_amount THEN RAISE EXCEPTION 'SPLIT_SUM_MISMATCH'; END IF;

  -- Diff: normalized (user_id-sorted) splits so reordering isn't a change.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', user_id, 'amount', amount) ORDER BY user_id), '[]'::jsonb)
  INTO v_old_splits
  FROM expense_splits WHERE expense_id = p_expense_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', (s->>'user_id')::uuid, 'amount', (s->>'amount')::numeric) ORDER BY (s->>'user_id')::uuid), '[]'::jsonb)
  INTO v_new_splits
  FROM jsonb_array_elements(p_splits) s;

  IF v_old.title IS DISTINCT FROM p_title THEN
    v_old_diff := v_old_diff || jsonb_build_object('title', v_old.title);
    v_new_diff := v_new_diff || jsonb_build_object('title', p_title);
  END IF;
  IF v_old.amount IS DISTINCT FROM p_amount OR v_old.currency IS DISTINCT FROM p_currency THEN
    v_old_diff := v_old_diff || jsonb_build_object('amount', v_old.amount, 'currency', v_old.currency);
    v_new_diff := v_new_diff || jsonb_build_object('amount', p_amount, 'currency', p_currency);
  END IF;
  IF v_old.paid_by IS DISTINCT FROM p_paid_by THEN
    v_old_diff := v_old_diff || jsonb_build_object('paid_by', v_old.paid_by);
    v_new_diff := v_new_diff || jsonb_build_object('paid_by', p_paid_by);
  END IF;
  IF v_old.paid_at IS DISTINCT FROM p_paid_at THEN
    v_old_diff := v_old_diff || jsonb_build_object('paid_at', v_old.paid_at);
    v_new_diff := v_new_diff || jsonb_build_object('paid_at', p_paid_at);
  END IF;
  IF v_old.note IS DISTINCT FROM v_note THEN
    v_old_diff := v_old_diff || jsonb_build_object('note', v_old.note);
    v_new_diff := v_new_diff || jsonb_build_object('note', v_note);
  END IF;
  IF v_old_splits IS DISTINCT FROM v_new_splits THEN
    v_old_diff := v_old_diff || jsonb_build_object('splits', v_old_splits);
    v_new_diff := v_new_diff || jsonb_build_object('splits', v_new_splits);
  END IF;

  UPDATE expenses
  SET title = p_title, amount = p_amount, currency = p_currency, paid_by = p_paid_by, paid_at = p_paid_at, note = v_note
  WHERE id = p_expense_id;

  -- Editing resets approvals: rebuild splits as pending, creator's own approved.
  DELETE FROM expense_splits WHERE expense_id = p_expense_id;
  INSERT INTO expense_splits (expense_id, user_id, amount, approval_status)
  SELECT p_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric,
         CASE WHEN (s->>'user_id')::uuid = auth.uid() THEN 'approved' ELSE 'pending' END
  FROM jsonb_array_elements(p_splits) s;

  IF v_old_diff != '{}'::jsonb THEN
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_old.trip_id, auth.uid(), 'expense.updated',
            jsonb_build_object('title', p_title, 'old', v_old_diff, 'new', v_new_diff));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) TO authenticated;
```

- [ ] **Step 2: 套用 migration**

Run: `pnpm supabase db push`（或專案慣用的 migration 套用指令；若不確定，先 `Read AGENTS.md` 與 `package.json` scripts 確認）
Expected: 0012 套用成功，無錯誤。

- [ ] **Step 3: 手動驗證約束**

Run（psql 或 Supabase SQL editor）：
```sql
-- 舊行程已回填 JPY
SELECT count(*) FROM trips WHERE foreign_currency IS NULL;          -- 期望 0
-- 零小數約束：KRW 小數應被擋
INSERT INTO expenses (trip_id, title, amount, currency, paid_by, created_by)
VALUES ('<任一 trip id>', 't', 100.5, 'KRW', '<uid>', '<uid>');     -- 期望 violates zero_decimal_integer_amount
```
Expected: 第一查詢回 0；INSERT 被約束擋下。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_multi_currency.sql
git commit -m "✨ feat(db): trips.foreign_currency + multi-currency RPC guards (0012)"
```

---

### Task 3: 即時匯率 action 泛化

`trips.ts` 改用 Task 1 的 `foreignToTwdRate`，並提供整張外幣→TWD 表給新增行程頁。

**Files:**
- Modify: `src/lib/actions/trips.ts:51-64`（`fetchExchangeRate`）、`createTripAction`（第 8-28 行）
- Test: `tests/utils/currency.test.ts`（已於 Task 1 涵蓋 `foreignToTwdRate`；本任務不加測試，純 I/O 包裝）

**Interfaces:**
- Consumes: `foreignToTwdRate`、`FOREIGN_CURRENCIES`、`Currency`（Task 1）
- Produces:
  - `fetchForeignRates(): Promise<Record<Currency, number | null>>`（每個外幣→TWD，抓不到為 null）
  - `createTripAction` 額外讀 `foreign_currency` 表單欄位

- [ ] **Step 1: 改寫 `fetchExchangeRate` → `fetchForeignRates`**

`src/lib/actions/trips.ts` 第 51-64 行整段換成：
```ts
import { foreignToTwdRate, FOREIGN_CURRENCIES } from '@/lib/utils/currency'
import type { Currency } from '@/types/database'

/** 抓 USD 基準匯率表，回傳每個外幣→TWD 匯率（抓不到為 null）。 */
export async function fetchForeignRates(): Promise<Record<Currency, number | null>> {
  const empty = Object.fromEntries(
    FOREIGN_CURRENCIES.map(c => [c, null]),
  ) as Record<Currency, number | null>
  try {
    const res = await fetch('https://tw.rter.info/capi.php', { next: { revalidate: 3600 } })
    const json = (await res.json()) as Record<string, { Exrate: number }>
    const usdRates = Object.fromEntries(
      Object.entries(json).map(([k, v]) => [k, v?.Exrate]),
    ) as Record<string, number>
    return Object.fromEntries(
      FOREIGN_CURRENCIES.map(c => [c, foreignToTwdRate(usdRates, c)]),
    ) as Record<Currency, number | null>
  } catch {
    return empty
  }
}
```
（`import` 兩行放到檔案頂部既有 import 區；`fetchExchangeRate` 已無其他呼叫者 —— 見 Step 3 確認。）

- [ ] **Step 2: `createTripAction` 讀取並驗證外幣**

`src/lib/actions/trips.ts` `createTripAction`（第 8-28 行）內，`exchangeRate` 驗證後加：
```ts
  const foreignCurrency = formData.get('foreign_currency') as string
  if (!FOREIGN_CURRENCIES.includes(foreignCurrency as Currency)) {
    return { error: '請選擇有效外幣' }
  }
```
RPC 呼叫加參數：
```ts
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: name.trim(),
    p_exchange_rate: exchangeRate,
    p_foreign_currency: foreignCurrency,
    ...(startDate ? { p_start_date: startDate } : {}),
    ...(endDate ? { p_end_date: endDate } : {}),
  })
```

- [ ] **Step 3: 確認舊 `fetchExchangeRate` 無殘留引用**

Run: `grep -rn "fetchExchangeRate" src`
Expected: 無結果（僅新增行程頁改用 `fetchForeignRates`，於 Task 4 處理）。若仍有，一併改掉。

- [ ] **Step 4: 型別檢查 + 測試**

Run: `pnpm test -- currency && pnpm exec tsc --noEmit`
Expected: 測試 PASS；tsc 對 `trips.ts` 無型別錯誤（新增行程頁尚未改，若該頁報 `fetchExchangeRate` 不存在屬預期，Task 4 修）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/trips.ts
git commit -m "✨ feat(rate): fetchForeignRates for all currencies; createTrip takes foreign_currency"
```

---

### Task 4: 新增行程頁 —— 外幣下拉 + 即時匯率

表單需前端互動（切幣別填匯率），抽成 `'use client'` 元件。

**Files:**
- Create: `src/app/(app)/trips/new/NewTripForm.tsx`（client 元件）
- Modify: `src/app/(app)/trips/new/page.tsx`（server：抓匯率表、渲染 client 元件）

**Interfaces:**
- Consumes: `fetchForeignRates`（Task 3）、`createTripAction`（Task 3）、`CURRENCIES`/`FOREIGN_CURRENCIES`（Task 1）
- Produces: 表單送出含 `name`、`exchange_rate`、`foreign_currency`、`start_date`、`end_date`

- [ ] **Step 1: 建立 client 表單元件**

Create `src/app/(app)/trips/new/NewTripForm.tsx`：
```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CURRENCIES, FOREIGN_CURRENCIES } from '@/lib/utils/currency'
import { createTripAction } from '@/lib/actions/trips'
import type { Currency } from '@/types/database'

const inputClass =
  'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/35'

type Props = { rates: Record<Currency, number | null> }

export function NewTripForm({ rates }: Props) {
  const [currency, setCurrency] = useState<Currency>('JPY')
  const [rate, setRate] = useState<string>(rates['JPY'] != null ? String(rates['JPY']) : '')

  function onCurrencyChange(next: Currency) {
    setCurrency(next)
    const live = rates[next]
    setRate(live != null ? String(live) : '')
  }

  const liveRate = rates[currency]

  return (
    <main className="max-w-lg mx-auto px-5 py-7">
      <div className="flex items-center gap-2.5 mb-6">
        <Link href="/trips" aria-label="返回行程" className="p-2 -ml-2 rounded-lg text-ink-3 hover:text-ink-2 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-base font-bold text-ink">新增行程</h1>
      </div>

      <form action={createTripAction} className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
        <div>
          <label htmlFor="new-trip-name" className="block text-xs font-medium text-ink-3 mb-1.5">行程名稱</label>
          <input id="new-trip-name" name="name" type="text" required placeholder="東京五日遊" className={inputClass} />
        </div>

        <div>
          <p className="text-xs font-medium text-ink-3 mb-1.5">日期區間<span className="text-ink-4 font-normal ml-1">（選填）</span></p>
          <div className="flex items-center gap-2">
            <input name="start_date" type="date" aria-label="開始日期（選填）" className={`${inputClass} flex-1`} />
            <span className="text-ink-4 text-sm shrink-0" aria-hidden="true">–</span>
            <input name="end_date" type="date" aria-label="結束日期（選填）" className={`${inputClass} flex-1`} />
          </div>
          <p className="text-xs text-ink-4 mt-1.5">填了日期，行程頁會多一張「每日支出」圖</p>
        </div>

        <div>
          <label htmlFor="new-trip-currency" className="block text-xs font-medium text-ink-3 mb-1.5">外幣</label>
          <select
            id="new-trip-currency"
            name="foreign_currency"
            value={currency}
            onChange={e => onCurrencyChange(e.target.value as Currency)}
            className="w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
          >
            {FOREIGN_CURRENCIES.map(c => (
              <option key={c} value={c}>{c}・{CURRENCIES[c].label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="new-trip-rate" className="block text-xs font-medium text-ink-3 mb-1.5">
            匯率（1 {currency} = ? TWD）
          </label>
          <input
            id="new-trip-rate"
            name="exchange_rate"
            type="number"
            step="0.0001"
            min="0.0001"
            required
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="請手動輸入"
            className={`${inputClass} font-mono tabular-nums`}
          />
          {liveRate != null ? (
            <p className="text-xs text-ink-4 mt-1.5">已自動填入即時匯率，可手動修改</p>
          ) : (
            <p className="text-xs text-owe mt-1.5">無法取得 {currency} 即時匯率，請手動輸入</p>
          )}
        </div>

        <button type="submit" className="w-full bg-accent text-white py-3 rounded-xl text-sm font-semibold hover:bg-accent-deep transition-colors">
          建立行程
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: 改 server page 抓匯率表並渲染**

`src/app/(app)/trips/new/page.tsx` 整檔換成：
```tsx
import { fetchForeignRates } from '@/lib/actions/trips'
import { NewTripForm } from './NewTripForm'

export default async function NewTripPage() {
  const rates = await fetchForeignRates()
  return <NewTripForm rates={rates} />
}
```

- [ ] **Step 3: 型別檢查**

Run: `pnpm exec tsc --noEmit`
Expected: 無型別錯誤（`fetchExchangeRate` 已無引用）。

- [ ] **Step 4: 手動驗證**

Run: `pnpm dev`，開 `/trips/new`，切換外幣下拉。
Expected: 匯率欄隨幣別即時更新（JPY→約 0.2、HKD→約 4、USD→約 32）；label 顯示「1 <幣別> = ? TWD」；抓不到時顯示紅字提示。

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/trips/new/NewTripForm.tsx" "src/app/(app)/trips/new/page.tsx"
git commit -m "✨ feat(trips): pick foreign currency on create with live rate"
```

---

### Task 5: ExpenseForm 幣別下拉 + prop 串接

費用表單幣別選項改成「該行程外幣 + TWD」，把 `foreignCurrency` 從行程頁串到表單。

**Files:**
- Modify: `src/components/expenses/ExpenseForm.tsx`（Props 加 `foreignCurrency`；下拉第 210-220 行）
- Modify: `src/components/expenses/AddExpenseModal.tsx`（Props 加 `foreignCurrency`，傳給 ExpenseForm）
- Modify: `src/components/expenses/EditExpenseButton.tsx`（Props 加 `foreignCurrency`，傳給 ExpenseForm）
- Modify: `src/components/expenses/ExpenseList.tsx`（Props 加 `foreignCurrency`，傳給 EditExpenseButton）
- Modify: `src/app/(app)/trips/[id]/page.tsx`（AddExpenseModal、ExpenseList 傳 `foreignCurrency={trip.foreign_currency}`）

**Interfaces:**
- Consumes: `CURRENCIES`（Task 1）、`trip.foreign_currency`（Task 1 型別 + Task 2 欄位）
- Produces: `ExpenseForm` 新增必填 prop `foreignCurrency: Currency`；預設幣別（新增時）= `foreignCurrency`

- [ ] **Step 1: ExpenseForm 加 prop 與動態下拉**

`ExpenseForm.tsx`：`Props` type 加一行 `foreignCurrency: Currency`（第 17-26 行 type Props 內）。
函式簽名解構加 `foreignCurrency`（第 39 行）。
`import` 加 `CURRENCIES`：把第 4 行改為
```ts
import { splitEqually, isEqualSplit, splitWithRemainder, formatAmount, CURRENCIES } from '@/lib/utils/currency'
```
初始幣別（第 45 行）改為以外幣為預設：
```ts
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? foreignCurrency)
```
幣別 `<select>`（第 212-219 行）的 options 改為：
```tsx
              value={currency} onChange={e => setCurrency(e.target.value as Currency)}
              className="bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
            >
              <option value={foreignCurrency}>{foreignCurrency}</option>
              <option value="TWD">TWD</option>
```
（`CURRENCIES` 匯入供未來用；若 lint 報 unused，改為僅在 label 需要時使用 —— 本步驟下拉只需兩碼，可不引入 `CURRENCIES`。實作者擇一，保持無 unused import。）

- [ ] **Step 2: AddExpenseModal 串 prop**

`AddExpenseModal.tsx`：`Props` 加 `foreignCurrency: Currency`（並在 import 補 `Currency`）；解構加入；`<ExpenseForm ... foreignCurrency={foreignCurrency} .../>`。

- [ ] **Step 3: EditExpenseButton 串 prop**

`EditExpenseButton.tsx`：`Props` 加 `foreignCurrency: Currency`；解構加入；`<ExpenseForm ... foreignCurrency={foreignCurrency} .../>`。

- [ ] **Step 4: ExpenseList 串 prop**

`ExpenseList.tsx`：`Props`（第 37-47 行）加 `foreignCurrency: Currency`（import 補 `Currency`）；函式解構（第 48 行）加入；`<EditExpenseButton ... foreignCurrency={foreignCurrency} />`（第 188 行附近）。

- [ ] **Step 5: 行程頁傳入**

`src/app/(app)/trips/[id]/page.tsx`：
第 198 行 `<AddExpenseModal ... />` 加 `foreignCurrency={trip.foreign_currency}`。
第 203-209 行 `<ExpenseList ... />` 加 `foreignCurrency={trip.foreign_currency}`。

- [ ] **Step 6: 型別檢查 + build**

Run: `pnpm exec tsc --noEmit`
Expected: 無錯誤（所有 ExpenseForm 使用點都已提供 `foreignCurrency`）。

- [ ] **Step 7: 手動驗證**

Run: `pnpm dev`，開一個 JPY 行程 →「記一筆」：幣別下拉只有 `JPY / TWD`，預設 JPY。
Expected: 選 TWD 可輸入小數；金額分帳依幣別小數位正確。

- [ ] **Step 8: Commit**

```bash
git add src/components/expenses/ExpenseForm.tsx src/components/expenses/AddExpenseModal.tsx src/components/expenses/EditExpenseButton.tsx src/components/expenses/ExpenseList.tsx "src/app/(app)/trips/[id]/page.tsx"
git commit -m "✨ feat(expenses): currency dropdown reflects trip foreign currency"
```

---

### Task 6: RPC 錯誤對照 + 寫死幣別文案

前端錯誤訊息對應新錯誤碼，並把 4 處「1 JPY = X TWD」改讀行程外幣。

**Files:**
- Modify: `src/lib/actions/expenses.ts:11-20`（`RPC_ERROR_MESSAGES`）
- Modify: `src/app/(app)/trips/[id]/page.tsx`（匯率工具列 label，約第 168 行）
- Modify: `src/app/(app)/trips/[id]/balance/page.tsx`（總計說明，約第 196 行）
- Modify: `src/components/trips/TripCard.tsx:21`

**Interfaces:**
- Consumes: `trip.foreign_currency`（型別 Task 1）

- [ ] **Step 1: 更新錯誤對照表**

`src/lib/actions/expenses.ts` 的 `RPC_ERROR_MESSAGES`：把 `JPY_SPLIT_NOT_INTEGER` 那行換成，並新增一行：
```ts
  SPLIT_NOT_INTEGER: '此幣別金額必須為整數',
  INVALID_CURRENCY: '幣別與此行程不符',
```

- [ ] **Step 2: 行程頁匯率工具列**

`src/app/(app)/trips/[id]/page.tsx` 約第 168 行 `<span>匯率 1 JPY =</span>` 改為：
```tsx
        <span>匯率 1 {trip.foreign_currency} =</span>
```

- [ ] **Step 3: balance 頁總計說明**

`src/app/(app)/trips/[id]/balance/page.tsx` 約第 196 行 `1 JPY = {trip.exchange_rate} TWD` 改為：
```tsx
                行程總費用 {twd(totalTWD)} · {profileMap.size} 位成員 · 1 {trip.foreign_currency} = {trip.exchange_rate} TWD
```

- [ ] **Step 4: TripCard**

`src/components/trips/TripCard.tsx:21` `1 JPY = {trip.exchange_rate} TWD` 改為：
```tsx
          1 {trip.foreign_currency} = {trip.exchange_rate} TWD
```

- [ ] **Step 5: 型別檢查 + 全測試**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: tsc 無錯；所有 Vitest PASS。

- [ ] **Step 6: 手動驗證整條流程**

Run: `pnpm dev`
- 建一個 HKD 行程 → 匯率自動填入 → 建立成功。
- 記一筆 HKD 費用（含小數）+ 一筆 TWD 費用 → balance 頁換算正確、文案顯示「1 HKD = … TWD」。
- 既有 JPY 行程行為不變。

Expected: 全部符合。

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/expenses.ts "src/app/(app)/trips/[id]/page.tsx" "src/app/(app)/trips/[id]/balance/page.tsx" src/components/trips/TripCard.tsx
git commit -m "✨ feat(currency): map new RPC errors; rate labels use trip foreign currency"
```

---

## Self-Review

**Spec coverage:**
- 幣別 metadata + util 泛化 → Task 1 ✅
- 型別 union + Trip.foreign_currency → Task 1 ✅
- migration（欄位/約束/3 RPC/信任邊界驗證/錯誤碼改名）→ Task 2 ✅
- fetchExchangeRate 泛化 → Task 3 ✅
- createTripAction 讀外幣 → Task 3 ✅
- 新增行程頁下拉 + 一次抓表前端切換 → Task 4 ✅
- ExpenseForm 下拉「外幣 + TWD」+ prop 串接 → Task 5 ✅
- 4 處寫死文案 → Task 4（新增頁）+ Task 6（其餘 3 處）✅
- 錯誤對照表 → Task 6 ✅
- 測試（零小數 KRW、2 位 HKD、foreignToTwdRate）→ Task 1 ✅

**Placeholder scan:** 無 TBD/TODO；SQL、TSX、測試皆為完整可貼程式碼。Task 2 的兩個 expense RPC 函式體 = 0009 現行定義逐字複製，僅套用三處最小改動（宣告 `v_foreign`、加 `INVALID_CURRENCY` guard、整數檢查改零小數集合 + 錯誤碼），approval_status 插入與 update 的 diff/log 完整保留。

**Type consistency:** `foreignToTwdRate`、`fetchForeignRates`、`CURRENCIES`、`FOREIGN_CURRENCIES`、`foreign_currency`、`SPLIT_NOT_INTEGER`、`INVALID_CURRENCY` 在各 Task 間命名一致；`ExpenseForm` 的 `foreignCurrency` prop 於 Task 5 全鏈串接（page → AddExpenseModal / ExpenseList → EditExpenseButton → ExpenseForm）。

**已知風險：** Task 2 SQL 已對齊 0009，無殘留骨架。`update` RPC 的 `expense.updated` diff 會把 `currency` 與 `amount` 一起記入 activity log —— 幣別種類變多不影響格式（formatter 已 amount+currency 綁定）。
