# Activity Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every create/edit/delete mutation in a trip (expenses, members, trip settings) and show them to trip members as an activity feed at `/trips/[id]/activity`, with before/after diffs for expense edits.

**Architecture:** A new `activity_logs` table is written exclusively inside the existing SECURITY DEFINER RPCs (same transaction as the mutation), so each logical user operation produces exactly one log row and clients cannot forge entries. A pure formatter function turns log rows into Traditional Chinese display strings; a server component renders the feed.

**Tech Stack:** Next.js 16 (App Router, server components), Supabase (Postgres + RLS + plpgsql), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-12-activity-logs-design.md`

**Conventions for the executor:**
- AGENTS.md requires reading the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code. The existing pages (`src/app/(app)/trips/[id]/balance/page.tsx`) are the authoritative pattern: `params` is a `Promise` and must be awaited.
- Branch: `feature/activity-logs` (user preference: feature branch in a `share-money.worktrees/` worktree).
- Commit format: `<gitmoji> <type>(scope): <description>`.
- One deviation from the spec table, locked in here: when **either** `amount` or `currency` changes, **both** fields are written into `old`/`new` so the formatter always has a currency to format the amount with.

---

### Task 1: Database migration — `activity_logs` table + logging RPCs

**Files:**
- Create: `supabase/migrations/0005_activity_logs.sql`
- Modify: `supabase/functions/expense_helpers.sql` (keep snapshot in sync)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_activity_logs.sql` with exactly this content:

```sql
-- supabase/migrations/0005_activity_logs.sql
-- Activity feed: one row per logical user operation, written only inside
-- SECURITY DEFINER RPCs (no INSERT policy → clients cannot forge entries).

-- ============================================================
-- TABLE
-- ============================================================

CREATE TABLE activity_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES profiles(id),
  action     text NOT NULL CHECK (action IN (
    'trip.created', 'trip.rate_updated', 'member.joined',
    'expense.created', 'expense.updated', 'expense.deleted'
  )),
  details    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX activity_logs_trip_created_idx
  ON activity_logs (trip_id, created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select" ON activity_logs FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

-- ============================================================
-- TRIP / MEMBER RPCs (redefined with logging)
-- ============================================================

CREATE OR REPLACE FUNCTION create_trip(p_name text, p_exchange_rate numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_trip_id uuid;
BEGIN
  INSERT INTO trips (name, created_by, exchange_rate)
  VALUES (p_name, auth.uid(), p_exchange_rate)
  RETURNING id INTO v_trip_id;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid());

  INSERT INTO activity_logs (trip_id, actor_id, action)
  VALUES (v_trip_id, auth.uid(), 'trip.created');

  RETURN v_trip_id;
END;
$$;

CREATE OR REPLACE FUNCTION join_trip(p_invite_token uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trip_id uuid;
  v_count   integer;
BEGIN
  SELECT id INTO v_trip_id FROM trips WHERE invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid())
  ON CONFLICT (trip_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Re-joining via the invite link is a no-op; only log first-time joins.
  IF v_count > 0 THEN
    INSERT INTO activity_logs (trip_id, actor_id, action)
    VALUES (v_trip_id, auth.uid(), 'member.joined');
  END IF;

  RETURN v_trip_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_trip_exchange_rate(p_trip_id uuid, p_rate numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old_rate numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF p_rate <= 0 THEN RAISE EXCEPTION 'INVALID_RATE'; END IF;

  SELECT exchange_rate INTO v_old_rate FROM trips WHERE id = p_trip_id;
  IF v_old_rate = p_rate THEN RETURN; END IF;

  UPDATE trips SET exchange_rate = p_rate WHERE id = p_trip_id;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (p_trip_id, auth.uid(), 'trip.rate_updated',
          jsonb_build_object('old_rate', v_old_rate, 'new_rate', p_rate));
END;
$$;

-- ============================================================
-- EXPENSE RPCs (redefined with logging)
-- ============================================================

CREATE OR REPLACE FUNCTION create_expense_with_splits(
  p_trip_id  uuid,
  p_title    text,
  p_amount   numeric,
  p_currency text,
  p_paid_by  uuid,
  p_paid_at  timestamptz,
  p_splits   jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_expense_id uuid;
  v_split      jsonb;
  v_split_sum  numeric := 0;
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

  INSERT INTO expenses (trip_id, title, amount, currency, paid_by, paid_at, created_by)
  VALUES (p_trip_id, p_title, p_amount, p_currency, p_paid_by, p_paid_at, auth.uid())
  RETURNING id INTO v_expense_id;

  INSERT INTO expense_splits (expense_id, user_id, amount)
  SELECT v_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric
  FROM jsonb_array_elements(p_splits) s;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (p_trip_id, auth.uid(), 'expense.created',
          jsonb_build_object('title', p_title, 'amount', p_amount, 'currency', p_currency));

  RETURN v_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_expense_with_splits(
  p_expense_id uuid,
  p_title      text,
  p_amount     numeric,
  p_currency   text,
  p_paid_by    uuid,
  p_paid_at    timestamptz,
  p_splits     jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old        expenses%ROWTYPE;
  v_split      jsonb;
  v_split_sum  numeric := 0;
  v_old_splits jsonb;
  v_new_splits jsonb;
  v_old_diff   jsonb := '{}'::jsonb;
  v_new_diff   jsonb := '{}'::jsonb;
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

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = v_old.trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency = 'JPY' AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'JPY_SPLIT_NOT_INTEGER';
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
  -- amount and currency travel together so the formatter can always render
  -- the amount with its currency
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
  IF v_old_splits IS DISTINCT FROM v_new_splits THEN
    v_old_diff := v_old_diff || jsonb_build_object('splits', v_old_splits);
    v_new_diff := v_new_diff || jsonb_build_object('splits', v_new_splits);
  END IF;

  UPDATE expenses
  SET title = p_title, amount = p_amount, currency = p_currency, paid_by = p_paid_by, paid_at = p_paid_at
  WHERE id = p_expense_id;

  DELETE FROM expense_splits WHERE expense_id = p_expense_id;
  INSERT INTO expense_splits (expense_id, user_id, amount)
  SELECT p_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric
  FROM jsonb_array_elements(p_splits) s;

  -- No-op edits produce no log entry.
  IF v_old_diff != '{}'::jsonb THEN
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_old.trip_id, auth.uid(), 'expense.updated',
            jsonb_build_object('title', p_title, 'old', v_old_diff, 'new', v_new_diff));
  END IF;
END;
$$;

-- ============================================================
-- NEW: delete_expense (replaces direct table delete in the action layer)
-- ============================================================

CREATE OR REPLACE FUNCTION delete_expense(p_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_expense expenses%ROWTYPE;
BEGIN
  -- Only the expense creator may delete (mirrors expenses_delete RLS policy)
  SELECT * INTO v_expense FROM expenses
  WHERE id = p_expense_id AND created_by = auth.uid();
  IF v_expense.id IS NULL THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (v_expense.trip_id, auth.uid(), 'expense.deleted',
          jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount, 'currency', v_expense.currency));

  DELETE FROM expenses WHERE id = p_expense_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION delete_expense(uuid) TO authenticated;
```

- [ ] **Step 2: Sync the snapshot file**

`supabase/functions/expense_helpers.sql` is the repo's current-state snapshot of all RPCs. Replace the bodies of `create_trip`, `join_trip`, `update_trip_exchange_rate`, `create_expense_with_splits`, `update_expense_with_splits` with the new versions from Step 1 (identical text), and append the `delete_expense` block (function + REVOKE/GRANT) at the end of the file. Keep the existing `DROP FUNCTION IF EXISTS ...` lines and the existing REVOKE/GRANT lines for the other functions unchanged.

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: `0005_activity_logs.sql` applied without errors.
If the CLI is not linked to the project, paste the migration into the Supabase dashboard SQL editor and run it there instead, then still commit the file.

- [ ] **Step 4: Smoke-check in SQL**

In the Supabase SQL editor (or `npx supabase db ...` psql session), run:

```sql
SELECT action, details FROM activity_logs ORDER BY created_at DESC LIMIT 5;
```

Expected: empty result (no errors) — table and policies exist.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_activity_logs.sql supabase/functions/expense_helpers.sql
git commit -m "✨ feat(db): add activity_logs table and write logs in RPCs"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add the activity types**

Append to `src/types/database.ts`:

```ts
export type ActivityAction =
  | 'trip.created'
  | 'trip.rate_updated'
  | 'member.joined'
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'

// Changed-fields-only diff stored in activity_logs.details.old / .new.
// amount and currency are always written together.
export type ExpenseDiff = {
  title?: string
  amount?: number
  currency?: Currency
  paid_by?: string
  paid_at?: string
  splits?: SplitInput[]
}

export type ActivityDetails = {
  title?: string
  amount?: number
  currency?: Currency
  old_rate?: number
  new_rate?: number
  old?: ExpenseDiff
  new?: ExpenseDiff
}

export type ActivityLog = {
  id: string
  trip_id: string
  actor_id: string
  action: ActivityAction
  details: ActivityDetails
  created_at: string
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "🏷️ feat(types): add activity log types"
```

---

### Task 3: Activity text formatter (TDD)

**Files:**
- Create: `src/lib/utils/activity.ts`
- Test: `tests/utils/activity.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/utils/activity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatActivityText } from '@/lib/utils/activity'
import type { ActivityAction, ActivityDetails } from '@/types/database'

const names: Record<string, string> = { u1: '小明', u2: '小華' }
const nameOf = (id: string) => names[id] ?? '未知成員'

function fmt(action: ActivityAction, details: ActivityDetails, actor = '小明') {
  return formatActivityText({ action, details }, actor, nameOf)
}

describe('formatActivityText', () => {
  it('trip.created', () => {
    expect(fmt('trip.created', {})).toBe('小明 建立了行程')
  })

  it('member.joined', () => {
    expect(fmt('member.joined', {}, '小美')).toBe('小美 加入了行程')
  })

  it('trip.rate_updated', () => {
    expect(fmt('trip.rate_updated', { old_rate: 0.218, new_rate: 0.22 }))
      .toBe('小明 將匯率從 0.218 改為 0.22')
  })

  it('expense.created formats JPY amount', () => {
    expect(fmt('expense.created', { title: '晚餐', amount: 1500, currency: 'JPY' }))
      .toBe('小明 新增了『晚餐』 ¥1,500')
  })

  it('expense.deleted formats TWD amount', () => {
    expect(fmt('expense.deleted', { title: '車票', amount: 120, currency: 'TWD' }))
      .toBe('小明 刪除了『車票』 NT$120.00')
  })

  describe('expense.updated', () => {
    it('amount change (currency always included alongside amount)', () => {
      expect(fmt('expense.updated', {
        title: '晚餐',
        old: { amount: 1200, currency: 'JPY' },
        new: { amount: 1500, currency: 'JPY' },
      }, '小華')).toBe('小華 編輯了『晚餐』：金額從 ¥1,200 改為 ¥1,500')
    })

    it('title change', () => {
      expect(fmt('expense.updated', {
        title: '晚餐',
        old: { title: '晚飯' },
        new: { title: '晚餐' },
      })).toBe('小明 編輯了『晚餐』：名稱從『晚飯』改為『晚餐』')
    })

    it('paid_by change resolves member names', () => {
      expect(fmt('expense.updated', {
        title: '晚餐',
        old: { paid_by: 'u1' },
        new: { paid_by: 'u2' },
      })).toBe('小明 編輯了『晚餐』：付款人從 小明 改為 小華')
    })

    it('paid_at change uses expense datetime formatting', () => {
      expect(fmt('expense.updated', {
        title: '晚餐',
        old: { paid_at: '2026-06-10T10:00:00+00:00' },
        new: { paid_at: '2026-06-11T11:30:00+00:00' },
      })).toBe('小明 編輯了『晚餐』：付款時間從 2026/06/10 18:00 改為 2026/06/11 19:30')
    })

    it('splits change renders a generic message', () => {
      expect(fmt('expense.updated', {
        title: '晚餐',
        old: { splits: [{ user_id: 'u1', amount: 1500 }] },
        new: { splits: [{ user_id: 'u1', amount: 750 }, { user_id: 'u2', amount: 750 }] },
      })).toBe('小明 編輯了『晚餐』：調整了分擔方式')
    })

    it('multiple changes joined with 、', () => {
      expect(fmt('expense.updated', {
        title: '晚餐',
        old: { amount: 1200, currency: 'JPY', splits: [{ user_id: 'u1', amount: 1200 }] },
        new: { amount: 1500, currency: 'JPY', splits: [{ user_id: 'u2', amount: 1500 }] },
      })).toBe('小明 編輯了『晚餐』：金額從 ¥1,200 改為 ¥1,500、調整了分擔方式')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/activity.test.ts`
Expected: FAIL — cannot resolve `@/lib/utils/activity`.

- [ ] **Step 3: Implement the formatter**

Create `src/lib/utils/activity.ts`:

```ts
import { formatAmount } from '@/lib/utils/currency'
import { formatExpenseDateTime } from '@/lib/utils/datetime'
import type { ActivityAction, ActivityDetails, ExpenseDiff } from '@/types/database'

/**
 * Renders an activity log row as a display sentence,
 * e.g. 「小華 編輯了『晚餐』：金額從 ¥1,200 改為 ¥1,500」.
 */
export function formatActivityText(
  log: { action: ActivityAction; details: ActivityDetails },
  actorName: string,
  nameOf: (userId: string) => string,
): string {
  const d = log.details
  switch (log.action) {
    case 'trip.created':
      return `${actorName} 建立了行程`
    case 'member.joined':
      return `${actorName} 加入了行程`
    case 'trip.rate_updated':
      return `${actorName} 將匯率從 ${d.old_rate} 改為 ${d.new_rate}`
    case 'expense.created':
      return `${actorName} 新增了『${d.title}』 ${formatAmount(d.amount!, d.currency!)}`
    case 'expense.deleted':
      return `${actorName} 刪除了『${d.title}』 ${formatAmount(d.amount!, d.currency!)}`
    case 'expense.updated':
      return `${actorName} 編輯了『${d.title}』：${expenseChanges(d.old ?? {}, d.new ?? {}, nameOf).join('、')}`
  }
}

function expenseChanges(
  prev: ExpenseDiff,
  next: ExpenseDiff,
  nameOf: (userId: string) => string,
): string[] {
  const parts: string[] = []
  if (prev.title !== undefined)
    parts.push(`名稱從『${prev.title}』改為『${next.title}』`)
  if (prev.amount !== undefined)
    parts.push(`金額從 ${formatAmount(prev.amount, prev.currency!)} 改為 ${formatAmount(next.amount!, next.currency!)}`)
  if (prev.paid_by !== undefined)
    parts.push(`付款人從 ${nameOf(prev.paid_by)} 改為 ${nameOf(next.paid_by!)}`)
  if (prev.paid_at !== undefined)
    parts.push(`付款時間從 ${formatExpenseDateTime(prev.paid_at)} 改為 ${formatExpenseDateTime(next.paid_at!)}`)
  if (prev.splits !== undefined)
    parts.push('調整了分擔方式')
  return parts
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/activity.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/activity.ts tests/utils/activity.test.ts
git commit -m "✨ feat(activity): add activity log text formatter"
```

---

### Task 4: Delete expense via RPC

**Files:**
- Modify: `src/lib/actions/expenses.ts:11` (NOT_OWNER message), `src/lib/actions/expenses.ts:98-108` (deleteExpenseAction)

- [ ] **Step 1: Update the NOT_OWNER message**

In `src/lib/actions/expenses.ts`, the message now covers delete too:

```ts
  NOT_OWNER: '只有建立者可以編輯或刪除此費用',
```

- [ ] **Step 2: Switch deleteExpenseAction to the RPC**

Replace the existing `deleteExpenseAction` (direct table delete) with:

```ts
export async function deleteExpenseAction(expenseId: string, tripId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_expense', {
    p_expense_id: expenseId,
  })

  if (error) return { error: mapRpcError(error.message) }
  revalidatePath(`/trips/${tripId}`)
  return { success: true }
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all existing tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/expenses.ts
git commit -m "♻️ refactor(expenses): delete expenses via delete_expense RPC for activity logging"
```

---

### Task 5: Activity page + entry link

**Files:**
- Create: `src/app/(app)/trips/[id]/activity/page.tsx`
- Modify: `src/app/(app)/trips/[id]/page.tsx:62-67` (header links)

- [ ] **Step 1: Create the activity page**

Create `src/app/(app)/trips/[id]/activity/page.tsx` (follows the balance page's data-loading pattern):

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatActivityText } from '@/lib/utils/activity'
import { formatExpenseDateTime } from '@/lib/utils/datetime'
import type { ActivityAction, ActivityDetails } from '@/types/database'

type ActivityRow = {
  id: string
  action: ActivityAction
  details: ActivityDetails
  created_at: string
  actor: { display_name: string } | null
}

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: trip, error: tripError } = await supabase.from('trips').select('id, name').eq('id', id).single()
  if (tripError && tripError.code !== 'PGRST116') {
    console.error('Failed to load trip for activity', { tripId: id, error: tripError })
    throw new Error('無法載入行程')
  }
  if (!trip) notFound()

  const { data: memberships, error: membershipsError } = await supabase
    .from('trip_members')
    .select('user_id, profiles(id, display_name)')
    .eq('trip_id', id)

  if (membershipsError) {
    console.error('Failed to load trip members for activity', { tripId: id, error: membershipsError })
    throw new Error('無法載入行程成員')
  }

  const profileMap = new Map(
    memberships?.map(m => {
      const profile = m.profiles as unknown as { id: string; display_name: string }
      return [profile.id, profile.display_name]
    }) ?? []
  )
  const nameOf = (userId: string) => profileMap.get(userId) ?? '未知成員'

  const { data: logs, error: logsError } = await supabase
    .from('activity_logs')
    .select('id, action, details, created_at, actor:profiles!actor_id(display_name)')
    .eq('trip_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (logsError) {
    console.error('Failed to load activity logs', { tripId: id, error: logsError })
    throw new Error('無法載入活動紀錄')
  }

  const rows = (logs ?? []) as unknown as ActivityRow[]

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/trips/${id}`} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">←</Link>
        <h1 className="text-xl font-bold">活動紀錄</h1>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        {trip.name} · 最近 {rows.length} 筆異動
      </p>

      {rows.length === 0 ? (
        <p className="text-center text-gray-400 py-8">尚無活動紀錄</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map(row => (
            <li key={row.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 dark:bg-gray-900 dark:border-gray-800">
              <p className="text-sm text-gray-800 dark:text-gray-100">
                {formatActivityText(row, row.actor?.display_name ?? '未知成員', nameOf)}
              </p>
              <p className="font-mono tabular-nums text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                {formatExpenseDateTime(row.created_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Add the entry link on the trip page**

In `src/app/(app)/trips/[id]/page.tsx`, the header currently ends with the 結算 link:

```tsx
        <Link href={`/trips/${id}/balance`} className="text-sm text-indigo-600 font-medium dark:text-indigo-300">
          結算 →
        </Link>
```

Insert an 活動 link immediately before it (same style):

```tsx
        <Link href={`/trips/${id}/activity`} className="text-sm text-indigo-600 font-medium dark:text-indigo-300">
          活動
        </Link>
        <Link href={`/trips/${id}/balance`} className="text-sm text-indigo-600 font-medium dark:text-indigo-300">
          結算 →
        </Link>
```

- [ ] **Step 3: Verify build and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, then in the browser: create an expense, edit its amount, delete another expense, and open `/trips/<id>/activity`.
Expected: three entries in reverse-chronological order, the edit entry showing 「金額從 X 改為 Y」.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/trips/[id]/activity/page.tsx" "src/app/(app)/trips/[id]/page.tsx"
git commit -m "✨ feat(activity): add trip activity feed page"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full test suite, types, lint, build**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: everything passes.

- [ ] **Step 2: Spec cross-check**

Re-read `docs/superpowers/specs/2026-06-12-activity-logs-design.md` and confirm: all six actions are logged, clients have no INSERT path, no-op edits produce no log, splits render as 調整了分擔方式, page is limited to 50 rows.
