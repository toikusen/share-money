# 還款(部分結清)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 旅程進行中可記錄還款(可部分),收款方確認後自動沖銷兩人淨額。

**Architecture:** 還款 = 特殊 expense(`expenses.kind='settlement'`,單一 split 100% 給收款方、pending),流過既有餘額數學自動沖銷;確認沿用 expense approval 流程。消費統計(總費用、每日圖、墊付/應攤圖)過濾 `kind='expense'`。

**Tech Stack:** Next.js 16 App Router + Supabase(SQL migration / RPC / RLS)+ vitest。

**Spec:** `docs/superpowers/specs/2026-07-11-settlement-design.md`

## Global Constraints

- 專案語言:UI 文案繁體中文(台灣用語);code/comments/commit English。
- Commit 格式:Gitmoji + Conventional Commits,例 `✨ feat(settlement): add create_settlement RPC`。
- 這是 Next.js 16(breaking changes)——動到 Next API 前先讀 `node_modules/next/dist/docs/` 相關章節。
- 測試指令:`pnpm vitest run <file>`(全部:`pnpm test`)。
- SQL RPC 慣例:`SECURITY DEFINER SET search_path = public`、錯誤用 `RAISE EXCEPTION '錯誤碼'`、結尾 `REVOKE ... FROM public, anon; GRANT ... TO authenticated`。
- `supabase/functions/expense_helpers.sql` 是 RPC 的鏡像參考檔(0009 註解言明 kept in sync)——凡動 RPC,migration 與此檔都要改。
- 幣別規則:合法幣別 = trip 的 `foreign_currency` 或 `'TWD'`;`JPY/KRW/VND` 金額必須整數。
- 錯誤碼→中文訊息對照表在 `src/lib/actions/expenses.ts` 的 `RPC_ERROR_MESSAGES`。

---

### Task 1: Types、通知文案、activity 文案

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/notify.ts`
- Modify: `src/lib/utils/activity.ts`
- Test: `tests/utils/notify.test.ts`, `tests/utils/activity.test.ts`

**Interfaces:**
- Consumes: 無(第一個 task)。
- Produces:
  - `type ExpenseKind = 'expense' | 'settlement'`;`Expense.kind: ExpenseKind`
  - `ActivityEvent` 新增兩個成員(見下)
  - `settlementRecordedPayload(payerName: string, amountText: string): NotificationPayload`
  - `formatActivityText` 支援 `settlement.created` / `settlement.deleted`

- [ ] **Step 1: 寫失敗測試**

在 `tests/utils/notify.test.ts` 既有 describe 之後加:

```ts
describe('settlementRecordedPayload', () => {
  it('names the payer and amount, links to /review', () => {
    const p = settlementRecordedPayload('小明', 'NT$500')
    expect(p.title).toBe('有還款等你確認')
    expect(p.body).toContain('小明')
    expect(p.body).toContain('NT$500')
    expect(p.url).toBe('/review')
  })
})
```

(檔案開頭 import 加上 `settlementRecordedPayload`。)

在 `tests/utils/activity.test.ts` 加(該檔既有測試會提供 `nameOf` 的寫法,對齊即可;若無,用 `(id: string) => ({ u2: '小華' }[id] ?? id)`):

```ts
describe('settlement activity', () => {
  const nameOf = (id: string) => (id === 'u2' ? '小華' : id)

  it('formats settlement.created', () => {
    const text = formatActivityText(
      { action: 'settlement.created', details: { amount: 500, currency: 'TWD', to_user: 'u2' } },
      '小明',
      nameOf,
    )
    expect(text).toBe('小明 記錄了還款 NT$500.00 給 小華')
  })

  it('formats settlement.deleted', () => {
    const text = formatActivityText(
      { action: 'settlement.deleted', details: { title: '還款', amount: 1000, currency: 'JPY', to_user: 'u2' } },
      '小明',
      nameOf,
    )
    expect(text).toBe('小明 刪除了給 小華 的還款 ¥1,000')
  })
})
```

注意:`formatAmount(500, 'TWD')` 產出 `NT$500.00`(TWD decimals=2、用 `toFixed`),`formatAmount(1000, 'JPY')` 產出 `¥1,000`(0 位小數、`toLocaleString`)。斷言值以此為準,先跑一次確認實際輸出再定案字串。

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run tests/utils/notify.test.ts tests/utils/activity.test.ts`
Expected: FAIL — `settlementRecordedPayload` 不存在;activity 的 switch 缺 case(TS 編譯錯誤或回傳 undefined)。

- [ ] **Step 3: 實作**

`src/types/database.ts`:

```ts
export type ExpenseKind = 'expense' | 'settlement'
```

`Expense` type 加一行:

```ts
  kind: ExpenseKind
```

`ActivityEvent` union 加兩個成員(放在 `expense.updated` 之後):

```ts
  | { action: 'settlement.created'; details: { amount: number; currency: Currency; to_user: string } }
  | { action: 'settlement.deleted'; details: { title: string; amount: number; currency: Currency; to_user: string } }
```

`src/lib/notify.ts` 末尾加:

```ts
export function settlementRecordedPayload(payerName: string, amountText: string): NotificationPayload {
  return { title: '有還款等你確認', body: `${payerName} 記錄了還款 ${amountText},請確認`, url: '/review' }
}
```

`src/lib/utils/activity.ts` 的 switch 加兩個 case:

```ts
    case 'settlement.created':
      return `${actorName} 記錄了還款 ${formatAmount(event.details.amount, event.details.currency)} 給 ${nameOf(event.details.to_user)}`
    case 'settlement.deleted':
      return `${actorName} 刪除了給 ${nameOf(event.details.to_user)} 的還款 ${formatAmount(event.details.amount, event.details.currency)}`
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run tests/utils/notify.test.ts tests/utils/activity.test.ts`
Expected: PASS

- [ ] **Step 5: 全套測試 + commit**

Run: `pnpm test`(確認沒弄壞別的)
```bash
git add src/types/database.ts src/lib/notify.ts src/lib/utils/activity.ts tests/utils/notify.test.ts tests/utils/activity.test.ts
git commit -m "✨ feat(settlement): add kind type, activity copy, push payload"
```

---

### Task 2: Migration 0015 + RPC + SQL 煙霧測試

**Files:**
- Create: `supabase/migrations/0015_settlements.sql`
- Create: `supabase/tests/settlement_smoke.sql`
- Modify: `supabase/functions/expense_helpers.sql`(鏡像同步)

**Interfaces:**
- Consumes: 無(純 SQL)。
- Produces:
  - `expenses.kind` 欄位
  - RPC `create_settlement(p_trip_id uuid, p_to_user uuid, p_amount numeric, p_currency text, p_paid_at timestamptz) RETURNS uuid`
  - 錯誤碼:`SETTLE_SELF`、`INVALID_AMOUNT`、`SETTLEMENT_NOT_EDITABLE`(+沿用 `NOT_MEMBER`、`SPLIT_USER_NOT_MEMBER`、`INVALID_CURRENCY`、`SPLIT_NOT_INTEGER`、`PAID_AT_REQUIRED`)
  - activity actions:`settlement.created`(details `{amount, currency, to_user}`)、`settlement.deleted`(details `{title, amount, currency, to_user}`)

- [ ] **Step 1: 寫煙霧測試(先寫,對還沒存在的 RPC 必然失敗)**

Create `supabase/tests/settlement_smoke.sql`:

```sql
-- Settlement RPC smoke test. Run ONLY against a local/dev database, never prod
-- (wrapped in BEGIN..ROLLBACK, but don't tempt fate).
--
-- How to run (repo has no supabase local config yet):
--   supabase init          # once; creates supabase/config.toml
--   supabase start
--   supabase db reset      # applies all migrations
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/settlement_smoke.sql
-- Expected output: NOTICE "settlement smoke: ALL PASS" and ROLLBACK.

BEGIN;

-- Fixed UUIDs so DO-blocks (no psql var interpolation) can reference them.
-- alice = a0..01 (payer), bob = b0..02 (receiver), carol = c0..03 (non-member)
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'alice@smoke.test'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@smoke.test'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@smoke.test');
-- handle_new_user trigger creates matching profiles rows.

INSERT INTO trips (id, name, created_by, exchange_rate, foreign_currency) VALUES
  ('d0000000-0000-4000-8000-000000000010', 'smoke trip',
   'a0000000-0000-4000-8000-000000000001', 0.22, 'JPY');
INSERT INTO trip_members (trip_id, user_id) VALUES
  ('d0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000002');

CREATE TEMP TABLE smoke_ids (settlement_id uuid);

-- act as alice
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. happy path: kind, single pending split, activity log
DO $$
DECLARE v_id uuid; v_kind text; v_status text; v_count int;
BEGIN
  v_id := create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 500, 'TWD', now());
  INSERT INTO smoke_ids VALUES (v_id);

  SELECT kind INTO v_kind FROM expenses WHERE id = v_id;
  IF v_kind <> 'settlement' THEN RAISE EXCEPTION 'FAIL: kind = %', v_kind; END IF;

  SELECT count(*) INTO v_count FROM expense_splits WHERE expense_id = v_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: % splits, want 1', v_count; END IF;

  SELECT approval_status INTO v_status FROM expense_splits WHERE expense_id = v_id;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'FAIL: split status = %', v_status; END IF;

  SELECT count(*) INTO v_count FROM activity_logs
  WHERE action = 'settlement.created'
    AND details->>'to_user' = 'b0000000-0000-4000-8000-000000000002';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: settlement.created log missing'; END IF;
END $$;

-- 2. cannot settle with yourself
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'a0000000-0000-4000-8000-000000000001', 100, 'TWD', now());
  RAISE EXCEPTION 'FAIL: SETTLE_SELF not raised';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%SETTLE_SELF%' THEN RAISE; END IF;
END $$;

-- 3. NaN amount rejected (numeric accepts NaN and NaN > 0 is true in PG!)
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 'NaN'::numeric, 'TWD', now());
  RAISE EXCEPTION 'FAIL: INVALID_AMOUNT not raised for NaN';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%INVALID_AMOUNT%' THEN RAISE; END IF;
END $$;

-- 4. non-positive amount rejected
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 0, 'TWD', now());
  RAISE EXCEPTION 'FAIL: INVALID_AMOUNT not raised for 0';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%INVALID_AMOUNT%' THEN RAISE; END IF;
END $$;

-- 5. currency must be trip foreign currency or TWD
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 100, 'USD', now());
  RAISE EXCEPTION 'FAIL: INVALID_CURRENCY not raised';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%INVALID_CURRENCY%' THEN RAISE; END IF;
END $$;

-- 6. zero-decimal currency must be integer
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 100.5, 'JPY', now());
  RAISE EXCEPTION 'FAIL: SPLIT_NOT_INTEGER not raised';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%SPLIT_NOT_INTEGER%' THEN RAISE; END IF;
END $$;

-- 7. settlements are not editable via update_expense_with_splits
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT settlement_id INTO v_id FROM smoke_ids;
  PERFORM update_expense_with_splits(v_id, 'hacked', 999, 'TWD',
    'a0000000-0000-4000-8000-000000000001', now(),
    '[{"user_id":"b0000000-0000-4000-8000-000000000002","amount":999}]'::jsonb);
  RAISE EXCEPTION 'FAIL: SETTLEMENT_NOT_EDITABLE not raised';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%SETTLEMENT_NOT_EDITABLE%' THEN RAISE; END IF;
END $$;

-- 8. non-member cannot create (act as carol)
SELECT set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 100, 'TWD', now());
  RAISE EXCEPTION 'FAIL: NOT_MEMBER not raised';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%NOT_MEMBER%' THEN RAISE; END IF;
END $$;

-- 9. receiver approves via existing approve_expense
SELECT set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $$
DECLARE v_id uuid; v_status text;
BEGIN
  SELECT settlement_id INTO v_id FROM smoke_ids;
  PERFORM approve_expense(v_id);
  SELECT approval_status INTO v_status FROM expense_splits WHERE expense_id = v_id;
  IF v_status <> 'approved' THEN RAISE EXCEPTION 'FAIL: approve status = %', v_status; END IF;
END $$;

-- 10. creator deletes: settlement.deleted log with to_user
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE v_id uuid; v_count int;
BEGIN
  SELECT settlement_id INTO v_id FROM smoke_ids;
  PERFORM delete_expense(v_id);
  SELECT count(*) INTO v_count FROM activity_logs
  WHERE action = 'settlement.deleted'
    AND details->>'to_user' = 'b0000000-0000-4000-8000-000000000002'
    AND (details->>'amount')::numeric = 500;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: settlement.deleted log wrong'; END IF;
  IF EXISTS (SELECT 1 FROM expenses WHERE id = v_id) THEN
    RAISE EXCEPTION 'FAIL: expense row still exists';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'settlement smoke: ALL PASS'; END $$;

ROLLBACK;
```

- [ ] **Step 2: 跑煙霧測試確認失敗**

若本機沒有 supabase local(repo 目前沒有 `supabase/config.toml`):`supabase init && supabase start && supabase db reset`。
Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/settlement_smoke.sql`
Expected: FAIL — `function create_settlement(...) does not exist`。
(若本機無法起 supabase local,記下此步驟為 SKIPPED,後續 Step 4 同;不得無聲跳過。)

- [ ] **Step 3: 寫 migration**

Create `supabase/migrations/0015_settlements.sql`:

```sql
-- supabase/migrations/0015_settlements.sql
-- Settlements: a repayment is a special expense (kind='settlement') paid by
-- the debtor with exactly one pending split for the receiver. It flows through
-- the existing balance math (payer +amount, receiver's owed +amount) and the
-- existing approval flow (receiver must approve before it counts).

-- ============================================================
-- SCHEMA
-- ============================================================

ALTER TABLE expenses ADD COLUMN kind text NOT NULL DEFAULT 'expense'
  CHECK (kind IN ('expense', 'settlement'));

-- activity_logs.action is a closed enum (0007) — extend it or the RPCs below
-- violate the constraint on insert.
ALTER TABLE activity_logs DROP CONSTRAINT activity_logs_action_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_action_check
  CHECK (action IN (
    'trip.created', 'trip.rate_updated', 'trip.info_updated', 'member.joined',
    'expense.created', 'expense.updated', 'expense.deleted',
    'settlement.created', 'settlement.deleted'
  ));

-- ============================================================
-- create_settlement  (kept in sync with supabase/functions/expense_helpers.sql)
-- ============================================================

CREATE OR REPLACE FUNCTION create_settlement(
  p_trip_id  uuid,
  p_to_user  uuid,
  p_amount   numeric,
  p_currency text,
  p_paid_at  timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid;
  v_foreign    text;
BEGIN
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'PAID_AT_REQUIRED';
  END IF;

  -- numeric accepts 'NaN' and NaN > 0 is TRUE in PostgreSQL, so the table
  -- CHECK (amount > 0) does not stop it — reject explicitly.
  IF p_amount = 'NaN'::numeric OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  IF p_to_user = auth.uid() THEN
    RAISE EXCEPTION 'SETTLE_SELF';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = p_to_user) THEN
    RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER';
  END IF;

  SELECT foreign_currency INTO v_foreign FROM trips WHERE id = p_trip_id;
  IF p_currency NOT IN (v_foreign, 'TWD') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY';
  END IF;
  IF p_currency IN ('JPY','KRW','VND') AND p_amount != floor(p_amount) THEN
    RAISE EXCEPTION 'SPLIT_NOT_INTEGER';
  END IF;

  INSERT INTO expenses (trip_id, title, amount, currency, paid_by, paid_at, created_by, kind)
  VALUES (p_trip_id, '還款', p_amount, p_currency, auth.uid(), p_paid_at, auth.uid(), 'settlement')
  RETURNING id INTO v_expense_id;

  -- The receiver must confirm before the settlement counts toward balances.
  INSERT INTO expense_splits (expense_id, user_id, amount, approval_status)
  VALUES (v_expense_id, p_to_user, p_amount, 'pending');

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (p_trip_id, auth.uid(), 'settlement.created',
          jsonb_build_object('amount', p_amount, 'currency', p_currency, 'to_user', p_to_user));

  RETURN v_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_settlement(uuid, uuid, numeric, text, timestamptz) FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_settlement(uuid, uuid, numeric, text, timestamptz) TO authenticated;
```

接著在同一個 migration 檔內 **重建 `update_expense_with_splits`**:複製 `supabase/migrations/0012_multi_currency.sql:117-226` 的完整函式 body,**唯一改動**是在 `IF v_old.id IS NULL THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;` 之後插入:

```sql
  -- Settlements are delete-and-re-record only; editing could reshape them
  -- into arbitrary multi-split expenses.
  IF v_old.kind = 'settlement' THEN
    RAISE EXCEPTION 'SETTLEMENT_NOT_EDITABLE';
  END IF;
```

(含結尾的 REVOKE/GRANT 兩行照抄。加上註解說明「body 是 0012 版原文,僅加 settlement guard」,沿用 0012 對 0009 的註解慣例。)

最後 **重建 `delete_expense`**:複製 `supabase/migrations/0005_activity_logs.sql` 中 `delete_expense` 的完整函式,把 activity log 段改為分支:

```sql
CREATE OR REPLACE FUNCTION delete_expense(p_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
  v_to_user uuid;
BEGIN
  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
  -- Already gone (double-click, stale tab): deleting is idempotent.
  IF v_expense.id IS NULL THEN RETURN; END IF;
  -- Only the expense creator may delete (mirrors expenses_delete RLS policy)
  IF v_expense.created_by <> auth.uid() THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;

  IF v_expense.kind = 'settlement' THEN
    -- A settlement has exactly one split: the receiver. Fetch before delete
    -- so the log can say who the money was going to.
    SELECT user_id INTO v_to_user FROM expense_splits WHERE expense_id = p_expense_id LIMIT 1;
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_expense.trip_id, auth.uid(), 'settlement.deleted',
            jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount,
                               'currency', v_expense.currency, 'to_user', v_to_user));
  ELSE
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_expense.trip_id, auth.uid(), 'expense.deleted',
            jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount, 'currency', v_expense.currency));
  END IF;

  DELETE FROM expenses WHERE id = p_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION delete_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION delete_expense(uuid) TO authenticated;
```

- [ ] **Step 4: 套用 migration、跑煙霧測試確認通過**

Run: `supabase db reset`(local),然後
`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/settlement_smoke.sql`
Expected: `NOTICE: settlement smoke: ALL PASS` + `ROLLBACK`。

- [ ] **Step 5: 同步鏡像檔**

`supabase/functions/expense_helpers.sql`:
- `update_expense_with_splits`(該檔 124 行起):插入同一段 settlement guard。
- `delete_expense`(該檔 258 行起):替換為 Step 3 的新 body。
- 檔尾加上完整的 `create_settlement`(與 migration 相同)。

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0015_settlements.sql supabase/tests/settlement_smoke.sql supabase/functions/expense_helpers.sql
git commit -m "✨ feat(settlement): kind column, create_settlement RPC, edit guard, smoke test"
```

---

### Task 3: 輸入驗證 util + `createSettlementAction`

**Files:**
- Modify: `src/lib/utils/expenses.ts`
- Modify: `src/lib/actions/expenses.ts`
- Test: `tests/utils/expenses.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `settlementRecordedPayload`;Task 2 的 `create_settlement` RPC 與錯誤碼。
- Produces:
  - `validateSettlementInput(params: { amount: number; currency: Currency; fromUser: string; toUser: string }): string | null`
  - `createSettlementAction(params: { tripId: string; toUser: string; amount: number; currency: Currency; paidAt: string }): Promise<{ error?: string; success?: boolean }>`

- [ ] **Step 1: 寫失敗測試**

在 `tests/utils/expenses.test.ts` 加(import 加 `validateSettlementInput`):

```ts
describe('validateSettlementInput', () => {
  const base = { amount: 500, currency: 'TWD' as const, fromUser: 'a', toUser: 'b' }

  it('accepts a valid input', () => {
    expect(validateSettlementInput(base)).toBeNull()
  })
  it('rejects non-positive and non-finite amounts', () => {
    expect(validateSettlementInput({ ...base, amount: 0 })).toBe('金額必須大於 0')
    expect(validateSettlementInput({ ...base, amount: -5 })).toBe('金額必須大於 0')
    expect(validateSettlementInput({ ...base, amount: NaN })).toBe('金額必須大於 0')
    expect(validateSettlementInput({ ...base, amount: Infinity })).toBe('金額必須大於 0')
  })
  it('rejects fractional amounts in zero-decimal currencies', () => {
    expect(validateSettlementInput({ ...base, currency: 'JPY', amount: 100.5 })).toBe('此幣別金額必須為整數')
    expect(validateSettlementInput({ ...base, currency: 'JPY', amount: 100 })).toBeNull()
  })
  it('rejects settling with yourself', () => {
    expect(validateSettlementInput({ ...base, toUser: 'a' })).toBe('不能還款給自己')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run tests/utils/expenses.test.ts`
Expected: FAIL — `validateSettlementInput` 不存在。

- [ ] **Step 3: 實作 util**

`src/lib/utils/expenses.ts`(檔頭 import 加 `import { CURRENCIES } from './currency'`、type import 加 `Currency`):

```ts
/**
 * Validates settlement input shared by the record-settlement action/UI.
 * Returns an error message, or null when valid.
 */
export function validateSettlementInput(params: {
  amount: number
  currency: Currency
  fromUser: string
  toUser: string
}): string | null {
  const { amount, currency, fromUser, toUser } = params
  if (!Number.isFinite(amount) || amount <= 0) return '金額必須大於 0'
  if (CURRENCIES[currency].decimals === 0 && !Number.isInteger(amount)) return '此幣別金額必須為整數'
  if (fromUser === toUser) return '不能還款給自己'
  return null
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run tests/utils/expenses.test.ts`
Expected: PASS

- [ ] **Step 5: 實作 server action**

`src/lib/actions/expenses.ts`:

`RPC_ERROR_MESSAGES` 加三個 key:

```ts
  SETTLE_SELF: '不能還款給自己',
  INVALID_AMOUNT: '金額無效',
  SETTLEMENT_NOT_EDITABLE: '還款紀錄不可編輯,請刪除後重新記錄',
```

import 區:`validateExpenseInput` 旁加 `validateSettlementInput`;`from '@/lib/notify'` 那行加 `settlementRecordedPayload`;`from '@/lib/utils/currency'` 加 `formatAmount`(若尚未 import,新增 `import { formatAmount } from '@/lib/utils/currency'`)。

在 `updateExpenseAction` 之後加:

```ts
export async function createSettlementAction(params: {
  tripId: string
  toUser: string
  amount: number
  currency: Currency
  paidAt: string
}) {
  const { tripId, toUser, amount, currency, paidAt } = params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '請先登入' }

  const validationError = validateSettlementInput({ amount, currency, fromUser: user.id, toUser })
  if (validationError) return { error: validationError }

  const paidAtIso = normalizePaidAt(paidAt)
  if (!paidAtIso) return { error: '請選擇還款時間' }

  const { error } = await supabase.rpc('create_settlement', {
    p_trip_id: tripId,
    p_to_user: toUser,
    p_amount: amount,
    p_currency: currency,
    p_paid_at: paidAtIso,
  })
  if (error) return { error: mapRpcError(error.message) }

  const { data: me } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
  await sendPushToUsers([toUser], settlementRecordedPayload(me?.display_name ?? '成員', formatAmount(amount, currency)))

  revalidatePath(`/trips/${tripId}`)
  revalidatePath(`/trips/${tripId}/balance`)
  return { success: true }
}
```

- [ ] **Step 6: 型別檢查 + 全套測試 + commit**

Run: `npx tsc --noEmit && pnpm test`
Expected: 皆 PASS

```bash
git add src/lib/utils/expenses.ts src/lib/actions/expenses.ts tests/utils/expenses.test.ts
git commit -m "✨ feat(settlement): validation util and createSettlementAction"
```

---

### Task 4: 結算計算過濾(balance 頁 + trip 首頁)

**Files:**
- Modify: `src/app/(app)/trips/[id]/balance/page.tsx`
- Modify: `src/app/(app)/trips/[id]/page.tsx`
- Modify: `src/components/expenses/ExpenseList.tsx`(僅 `ExpenseDisplayRow` 型別加 `kind`)
- Test: `tests/utils/balance.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ExpenseKind`。
- Produces:
  - `ExpenseDisplayRow.kind: ExpenseKind`(Task 5/6 依賴)
  - balance 頁區分 `spendRows`(統計)與全量 rows(淨額)

- [ ] **Step 1: 寫還款流的餘額測試(行為驗證,新測試對既有純函式,預期直接通過)**

在 `tests/utils/balance.test.ts` 加:

```ts
describe('settlement flow through balance math', () => {
  // bob owes alice 109 TWD after e1 (1000 JPY @ 0.218, split 50/50)
  const expense = { id: 'e1', amount: 1000, currency: 'JPY' as const, paid_by: 'alice' }
  const expenseSplits = [
    { expense_id: 'e1', user_id: 'alice', amount: 500 },
    { expense_id: 'e1', user_id: 'bob', amount: 500 },
  ]

  it('partial repayment reduces the suggested transfer', () => {
    const settlement = { id: 's1', amount: 50, currency: 'TWD' as const, paid_by: 'bob' }
    const settlementSplit = { expense_id: 's1', user_id: 'alice', amount: 50 }
    const net = calculateNetBalances([expense, settlement], [...expenseSplits, settlementSplit], 0.218)
    const transfers = minimizeTransfers(net)
    expect(transfers).toEqual([{ from: 'bob', to: 'alice', amountTWD: 59 }])
  })

  it('full repayment settles: no transfers left', () => {
    const settlement = { id: 's1', amount: 109, currency: 'TWD' as const, paid_by: 'bob' }
    const settlementSplit = { expense_id: 's1', user_id: 'alice', amount: 109 }
    const net = calculateNetBalances([expense, settlement], [...expenseSplits, settlementSplit], 0.218)
    expect(minimizeTransfers(net)).toHaveLength(0)
  })

  it('foreign-currency repayment converts at the trip rate', () => {
    // 500 JPY = 109 TWD at 0.218 → full settle
    const settlement = { id: 's1', amount: 500, currency: 'JPY' as const, paid_by: 'bob' }
    const settlementSplit = { expense_id: 's1', user_id: 'alice', amount: 500 }
    const net = calculateNetBalances([expense, settlement], [...expenseSplits, settlementSplit], 0.218)
    expect(minimizeTransfers(net)).toHaveLength(0)
  })
})
```

Run: `pnpm vitest run tests/utils/balance.test.ts`
Expected: PASS(這組是行為鎖定,不是驅動新程式;若 FAIL 表示對餘額數學的理解錯了,停下來回報)。

- [ ] **Step 2: `ExpenseDisplayRow` 加 kind**

`src/components/expenses/ExpenseList.tsx` 的 type(第 14 行起)加一行,並把 type import 改為 `import type { ApprovalStatus, Currency, ExpenseKind } from '@/types/database'`:

```ts
  kind: ExpenseKind
```

(trip 頁查詢用 `select('*', ...)`,kind 自動帶出,型別即符。)

- [ ] **Step 3: balance 頁改計算**

`src/app/(app)/trips/[id]/balance/page.tsx`:

1. 型別 `ExpenseRow`(第 14 行)改為:

```ts
type ExpenseRow = { id: string; amount: number; currency: Currency; paid_by: string; kind: 'expense' | 'settlement' }
```

2. expenses 查詢的 select(第 30 行)加 `kind`:

```ts
        .select('id, amount, currency, paid_by, kind, expense_splits(expense_id, user_id, amount, approval_status)')
```

3. 計算區(現在的第 62-77 行)改為:

```ts
  // Only fully-approved expenses settle; pending/rejected are excluded everywhere below.
  const approvedIds = approvedExpenseIds((splits ?? []) as { expense_id: string; approval_status: 'pending' | 'approved' | 'rejected' }[])
  const approvedRows = ((expenses ?? []) as ExpenseRow[]).filter(e => approvedIds.has(e.id))
  const approvedSplits = ((splits ?? []) as SplitRow[]).filter(s => approvedIds.has(s.expense_id))

  // 還款計入淨額,但不是消費——統計(墊付/應攤圖、總費用)只看 kind='expense'
  const spendRows = approvedRows.filter(e => e.kind === 'expense')
  const spendIds = new Set(spendRows.map(e => e.id))
  const spendSplits = approvedSplits.filter(s => spendIds.has(s.expense_id))

  const stats = calculateMemberStats(spendRows, spendSplits, trip.exchange_rate)
  const net = calculateNetBalances(approvedRows, approvedSplits, trip.exchange_rate)
  const transfers = minimizeTransfers(net)
```

檔頭 import 補 `calculateNetBalances`。

4. `totalTWD` 改用 `spendRows`:

```ts
  const totalTWD = spendRows.reduce(
    (sum, e) => sum + convertToTWD(e.amount, e.currency, trip.exchange_rate),
    0
  )
```

5. `myNet`(第 90 行)改從 `net` 取:

```ts
  const myNet = net.find(n => n.userId === meId)?.netTWD ?? 0
```

6. 空狀態判斷(第 131 行)`expenseRows.length === 0` 改為 `approvedRows.length === 0 && (expenses ?? []).length === 0`——有 pending 還款但無費用時仍要渲染主畫面。原變數名 `expenseRows` 已改名 `approvedRows`,整檔搜尋替換殘留引用。
(`allStats`、`chartRows` 維持吃 `stats`,members-with-zero 補齊邏輯不變。)

- [ ] **Step 4: trip 首頁過濾每日支出圖**

`src/app/(app)/trips/[id]/page.tsx` 第 145-150 行,`DailySpendChart` 的 expenses prop 改為:

```tsx
        expenses={approvedRows
          .filter(e => e.kind === 'expense')
          .map(e => ({ paid_at: e.paid_at, amount: e.amount, currency: e.currency }))}
```

(`myNet` 卡沿用 `approvedRows` 全量計算——還款要計入淨額,不改。)

- [ ] **Step 5: 驗證 + commit**

Run: `npx tsc --noEmit && pnpm test`
Expected: PASS

```bash
git add "src/app/(app)/trips/[id]/balance/page.tsx" "src/app/(app)/trips/[id]/page.tsx" src/components/expenses/ExpenseList.tsx tests/utils/balance.test.ts
git commit -m "✨ feat(settlement): net includes settlements, spend stats exclude them"
```

---

### Task 5: 記錄還款 modal + balance 頁入口

**Files:**
- Create: `src/components/balance/RecordSettlementButton.tsx`
- Modify: `src/lib/utils/datetime.ts`(搬入 `toDateTimeLocalValue`)
- Modify: `src/components/expenses/ExpenseForm.tsx`(改 import)
- Modify: `src/app/(app)/trips/[id]/balance/page.tsx`

**Interfaces:**
- Consumes: Task 3 的 `createSettlementAction`;Task 4 的 balance 頁新計算變數。
- Produces:
  - `RecordSettlementButton(props: { tripId: string; toUserId: string; toName: string; suggestedTWD: number; foreignCurrency: Currency; exchangeRate: number })`
  - `toDateTimeLocalValue(value?: string): string`(export 自 datetime utils)

- [ ] **Step 1: 搬 `toDateTimeLocalValue` 到 datetime utils**

從 `src/components/expenses/ExpenseForm.tsx:29-35` 剪下,原樣貼到 `src/lib/utils/datetime.ts` 檔尾並加 `export`:

```ts
/** Formats an ISO string (default: now) as an <input type="datetime-local"> value in device-local time. */
export function toDateTimeLocalValue(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}
```

`ExpenseForm.tsx` 刪除原函式,改由 `@/lib/utils/datetime` import(併入該檔既有的 datetime import 行,若無則新增)。

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: 建立 `RecordSettlementButton`**

Create `src/components/balance/RecordSettlementButton.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSettlementAction } from '@/lib/actions/expenses'
import { CURRENCIES, formatAmount } from '@/lib/utils/currency'
import { toDateTimeLocalValue } from '@/lib/utils/datetime'
import type { Currency } from '@/types/database'

type Props = {
  tripId: string
  toUserId: string
  toName: string
  suggestedTWD: number
  foreignCurrency: Currency
  exchangeRate: number
}

const inputClass =
  'w-full bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent/35'

/** 依幣別小數位把建議金額轉成輸入框預設值字串 */
function suggestedFor(currency: Currency, suggestedTWD: number, exchangeRate: number): string {
  const raw = currency === 'TWD' ? suggestedTWD : suggestedTWD / exchangeRate
  return CURRENCIES[currency].decimals === 0 ? String(Math.round(raw)) : raw.toFixed(2)
}

export function RecordSettlementButton({ tripId, toUserId, toName, suggestedTWD, foreignCurrency, exchangeRate }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState<Currency>('TWD')
  const [amount, setAmount] = useState(() => suggestedFor('TWD', suggestedTWD, exchangeRate))
  const [paidAt, setPaidAt] = useState(() => toDateTimeLocalValue())

  function switchCurrency(next: Currency) {
    setCurrency(next)
    setAmount(suggestedFor(next, suggestedTWD, exchangeRate))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createSettlementAction({
        tripId,
        toUser: toUserId,
        amount: parseFloat(amount),
        currency,
        paidAt: new Date(paidAt).toISOString(),
      })
      if (res?.error) { setError(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent hover:bg-accent/15 transition-colors"
      >
        記錄還款
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={() => setOpen(false)}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-form-title"
        className="bg-white text-ink rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 sm:p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="settle-form-title" className="font-bold text-[17px]">還款給 {toName}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13px] text-ink-4 hover:text-ink-2 p-1 transition-colors"
          >
            取消
          </button>
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label htmlFor="settle-amount" className="block text-xs font-medium text-ink-3 mb-1.5">金額</label>
            <input
              id="settle-amount"
              value={amount} onChange={e => setAmount(e.target.value)}
              type="number" min="0" step={CURRENCIES[currency].decimals === 0 ? '1' : '0.01'} required
              className={`${inputClass} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="settle-currency" className="block text-xs font-medium text-ink-3 mb-1.5">幣別</label>
            <select
              id="settle-currency"
              value={currency} onChange={e => switchCurrency(e.target.value as Currency)}
              className="bg-fill border-0 rounded-[10px] px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
            >
              <option value="TWD">TWD</option>
              <option value={foreignCurrency}>{foreignCurrency}</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="settle-paid-at" className="block text-xs font-medium text-ink-3 mb-1.5">還款時間</label>
          <input
            id="settle-paid-at"
            value={paidAt} onChange={e => setPaidAt(e.target.value)}
            type="datetime-local" required
            className={inputClass}
          />
        </div>

        <p className="text-xs text-ink-4">
          建議金額 {formatAmount(suggestedTWD, 'TWD')},可改少(部分還款)。送出後待 {toName} 確認才計入結算。
        </p>

        {error && <p className="text-sm text-owe bg-owe/5 rounded-lg px-3 py-2">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-accent text-white text-sm font-semibold py-3 hover:bg-accent-deep transition-colors disabled:opacity-50"
        >
          {isPending ? '送出中…' : '記錄還款'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: balance 頁接上入口與待確認提示**

`src/app/(app)/trips/[id]/balance/page.tsx`:

1. import 加:

```ts
import { RecordSettlementButton } from '@/components/balance/RecordSettlementButton'
```

2. 計算區(Task 4 的 `transfers` 之後)加 pending 還款清單。注意 expenses 查詢帶回的 splits 含 `approval_status`:

```ts
  // 已記錄、待收款方確認的還款——顯示提示避免重複記
  const pendingSettlements = ((expenses ?? []) as (ExpenseRow & {
    expense_splits: { user_id: string; approval_status: string }[]
  })[])
    .filter(e => e.kind === 'settlement')
    .map(e => ({ id: e.id, from: e.paid_by, amount: e.amount, currency: e.currency, split: e.expense_splits[0] }))
    .filter(s => s.split?.approval_status === 'pending')
```

3. 轉帳清單 JSX(現在的第 183-190 行,金額欄位那個 `<span className="ml-auto ...">`)前面,在同一列加入按鈕——把該列改成:

```tsx
                        <span className="ml-auto flex items-center gap-2">
                          <span className="flex flex-col items-end leading-tight">
                            <span className={`text-[15px] font-semibold font-mono tabular-nums ${
                              t.to === meId ? 'text-gain' : t.from === meId ? 'text-owe' : 'text-ink-2'
                            }`}>
                              {twd(t.amountTWD)}
                            </span>
                            <span className="text-[11px] text-ink-4 font-mono tabular-nums">≈ {foreign(t.amountTWD)}</span>
                          </span>
                          {t.from === meId && (
                            <RecordSettlementButton
                              tripId={id}
                              toUserId={t.to}
                              toName={t.toName}
                              suggestedTWD={t.amountTWD}
                              foreignCurrency={trip.foreign_currency}
                              exchangeRate={trip.exchange_rate}
                            />
                          )}
                        </span>
```

4. 轉帳清單卡片之後(「與你無關的轉帳會淡化顯示」那行 `<p>` 之前)加:

```tsx
                {pendingSettlements.length > 0 && (
                  <div className="bg-amber-500/8 rounded-xl px-3.5 py-2.5 flex flex-col gap-1">
                    {pendingSettlements.map(s => (
                      <p key={s.id} className="text-[12px] text-amber-700">
                        {s.from === meId ? '你' : nameOf(s.from)} 已記錄還款 {formatAmount(s.amount, s.currency)} 給{' '}
                        {s.split.user_id === meId ? '你' : nameOf(s.split.user_id)},待確認後計入
                      </p>
                    ))}
                  </div>
                )}
```

- [ ] **Step 4: 驗證 + commit**

Run: `npx tsc --noEmit && pnpm test && pnpm lint`
Expected: PASS

手動驗證(如 local supabase + `pnpm dev` 可用):兩帳號一趟行程,A 記帳 → B 到結算頁按「記錄還款」改成部分金額送出 → A 的 review 頁出現待確認 → 確認後結算頁建議轉帳金額減少。不可用則記 SKIPPED。

```bash
git add src/components/balance/RecordSettlementButton.tsx src/lib/utils/datetime.ts src/components/expenses/ExpenseForm.tsx "src/app/(app)/trips/[id]/balance/page.tsx"
git commit -m "✨ feat(settlement): record-settlement modal on suggested transfers"
```

---

### Task 6: 費用清單的還款樣式

**Files:**
- Modify: `src/components/expenses/ExpenseList.tsx`

**Interfaces:**
- Consumes: Task 4 的 `ExpenseDisplayRow.kind`。
- Produces: 純顯示變更,無下游依賴。

- [ ] **Step 1: 還款列渲染**

`src/components/expenses/ExpenseList.tsx` 改三處:

1. component 內加 helper(`expenseGroups` 宣告附近):

```ts
  const memberName = (userId?: string) => members.find(m => m.id === userId)?.display_name ?? '成員'
  const settlementLabel = (e: ExpenseDisplayRow) => `還款給 ${memberName(e.expense_splits[0]?.user_id)}`
```

2. 標題(第 168 行)改為:

```tsx
                      <span className="font-medium text-[14.5px] text-ink break-words">
                        {expense.kind === 'settlement' ? settlementLabel(expense) : expense.title}
                      </span>
```

並在標題前加轉帳 icon(settlement 才顯示,放同一個 flex 容器裡):

```tsx
                      {expense.kind === 'settlement' && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent shrink-0">
                          <path d="M17 3l4 4-4 4" />
                          <path d="M21 7H9" />
                          <path d="M7 21l-4-4 4-4" />
                          <path d="M3 17h12" />
                        </svg>
                      )}
```

「{payer} 付」那行(第 176 行)改為:

```tsx
                      <span>{expense.payer?.display_name} {expense.kind === 'settlement' ? '還' : '付'}</span>
```

3. `EditExpenseButton` 的條件(第 187 行)改為 settlement 隱藏編輯、保留刪除:

```tsx
                    {expense.created_by === currentUserId && (
                      <div className="flex items-center">
                        {expense.kind === 'expense' && (
                          <EditExpenseButton
                            tripId={tripId}
                            members={members}
                            currentUserId={currentUserId}
                            foreignCurrency={foreignCurrency}
                            expense={{
                              id: expense.id,
                              title: expense.title,
                              amount: expense.amount,
                              currency: expense.currency,
                              paid_by: expense.paid_by,
                              paid_at: expense.paid_at,
                              note: expense.note,
                              splits: expense.expense_splits.map(s => ({ user_id: s.user_id, amount: s.amount })),
                            }}
                          />
                        )}
                        {/* 刪除表單(第 205-221 行)原樣保留,不動 */}
```

- [ ] **Step 2: 當日小計排除還款**

`groupSum`(第 102 行)開頭加一行過濾(還款不是消費,不進當日小計;整組都是還款時顯示筆數即可):

```ts
  function groupSum(items: ExpenseDisplayRow[]) {
    const spendItems = items.filter(e => e.kind === 'expense')
    if (spendItems.length === 0) return `${items.length} 筆還款`
    const uniform = spendItems.every(e => e.currency === spendItems[0].currency)
    if (uniform) {
      const sum = spendItems.reduce((a, e) => a + e.amount, 0)
      return formatAmount(sum, spendItems[0].currency)
    }
    const sum = spendItems.reduce((a, e) => a + convertToTWD(e.amount, e.currency, exchangeRate), 0)
    return `≈${formatAmount(sum, 'TWD')}`
  }
```

- [ ] **Step 3: 驗證 + commit**

Run: `npx tsc --noEmit && pnpm test && pnpm lint`
Expected: PASS

```bash
git add src/components/expenses/ExpenseList.tsx
git commit -m "✨ feat(settlement): distinct settlement rows in expense list, no edit"
```

---

### Task 7: Review 頁的確認收款文案

**Files:**
- Modify: `src/lib/reviews.ts`
- Modify: `src/components/review/ReviewList.tsx`

**Interfaces:**
- Consumes: Task 1 的 `ExpenseKind`;Task 2 的 `kind` 欄位。
- Produces: `PendingReview.kind: ExpenseKind`。

- [ ] **Step 1: reviews query 帶 kind**

`src/lib/reviews.ts`:

1. `PendingReview` type 加 `kind: ExpenseKind`(import type 加 `ExpenseKind`)。
2. `Row.expense` type 加 `kind: ExpenseKind`。
3. select 字串的 expense 欄位清單加 `kind`:

```ts
      expense:expenses!inner(
        id, title, amount, currency, paid_at, trip_id, kind,
        trip:trips!inner(name),
        payer:profiles!paid_by(display_name),
        splits:expense_splits(approval_status)
      )
```

4. map 回傳物件加 `kind: r.expense.kind,`。

- [ ] **Step 2: ReviewList 分流文案**

`src/components/review/ReviewList.tsx` 卡片內容(第 60-63 行)改為:

```tsx
                  <div className="font-medium text-[15px] text-ink break-words mt-0.5">
                    {r.kind === 'settlement' ? '還款確認' : r.title}
                  </div>
                  <div className="text-xs text-ink-4 mt-0.5">
                    {r.kind === 'settlement' ? (
                      <>{r.payerName} 表示已還你 <span className="font-mono tabular-nums">{formatAmount(r.amount, r.currency)}</span></>
                    ) : (
                      <>{r.payerName} 付 · 你分擔 <span className="font-mono tabular-nums">{formatAmount(r.myShare, r.currency)}</span></>
                    )}
                  </div>
```

同意按鈕文字(第 88 行)改為:

```tsx
                  {r.kind === 'settlement' ? '確認收款' : '同意'}
```

(拒絕按鈕與 approve/reject action 沿用;「已同意 n/n」計數對 settlement 顯示 0/1,可接受。)

- [ ] **Step 3: 驗證 + commit**

Run: `npx tsc --noEmit && pnpm test && pnpm lint`
Expected: PASS

```bash
git add src/lib/reviews.ts src/components/review/ReviewList.tsx
git commit -m "✨ feat(settlement): confirm-receipt copy on review page"
```

---

### Task 8: 端到端驗證

**Files:** 無新增(驗證 task)。

- [ ] **Step 1: 全套自動驗證**

Run: `npx tsc --noEmit && pnpm lint && pnpm test`
Expected: 全 PASS。

- [ ] **Step 2: SQL 煙霧測試(若 local supabase 可用)**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/settlement_smoke.sql`
Expected: `settlement smoke: ALL PASS`。

- [ ] **Step 3: 實際流程驗證(verify skill;local 環境可用時)**

`pnpm dev` + 兩個帳號:
1. A 建行程、記一筆 1000 JPY 均分、B 同意 → 結算頁顯示 B → A 的建議轉帳
2. B 在結算頁按「記錄還款」,金額改一半,送出 → 出現「待確認」提示;結算金額尚未變動
3. A 的 `/review` 顯示「還款確認/B 表示已還你…」→ 按「確認收款」
4. 結算頁建議轉帳金額減半;總費用、每日圖、墊付/應攤圖數字不含還款
5. 費用清單顯示「還款給 A」列,B 只有刪除鈕沒有編輯鈕
6. B 刪除該筆還款 → 結算恢復,activity 頁顯示刪除還款紀錄

無法起 local 環境則記 SKIPPED 並回報,不得宣稱驗證通過。

---

## Self-Review 紀錄

- Spec coverage:kind 欄位+constraint(T2)、create_settlement 全驗證含 NaN(T2)、edit guard(T2)、delete 分支含 to_user(T2)、鏡像同步(T2)、計算過濾四點(T4)、入口 modal 幣別/部分還款/待確認提示(T5)、清單樣式+隱藏編輯(T6)、review 文案(T7)、types/notify/activity(T1)、測試清單全對應(T1-T4 vitest、T2 smoke)。
- 不做清單(spec):無編輯 UI、無收款方主動記錄、無獨立還款表單——計畫中皆未出現,一致。
- 型別一致性:`ExpenseKind` 定義於 T1,T4/T7 引用同名;`createSettlementAction` 參數 T3 定義、T5 呼叫一致;`RecordSettlementButton` props T5 內部一致。
