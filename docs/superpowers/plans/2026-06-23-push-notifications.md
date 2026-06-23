# PWA 推播通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在三個審核事件(等我審核 / 被拒絕 / 全員通過)用 Web Push 主動通知使用者,即使 app 未開啟。

**Architecture:** 方案 A — 所有寫入已集中在 server actions + RPC,於 action 內 RPC 成功後直接送 Web Push;發送在 Cloudflare Worker 上用 Web Crypto 相容套件完成,讀取收件人訂閱走 service role 繞過 RLS。推播失敗絕不影響主流程。

**Tech Stack:** Next.js 16 / React 19、Supabase(Postgres + RLS + RPC)、Cloudflare Workers(OpenNext)、`@block65/webcrypto-web-push`、Web Push API + Service Worker。

**Spec:** [docs/superpowers/specs/2026-06-23-push-notifications-design.md](../specs/2026-06-23-push-notifications-design.md)

## Global Constraints

- **Next.js 16 有破壞性變更**:寫任何 Next 專屬程式前,先讀 `node_modules/next/dist/docs/` 對應指南(見 AGENTS.md)。
- Commit 用 Conventional Commits + Gitmoji,訊息英文;commit message 結尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 所有面向使用者的文案用繁體中文(台灣用語)。
- **推播發送失敗絕不影響主流程**:發送整段包 try/catch 吞錯,主 action 照常回 `{ success: true }`。
- **防 open redirect**:notification 的 `url` 只允許站內路徑(`startsWith('/')`);payload 一律 server 端組站內 path。
- **加密不手刻**:用 `@block65/webcrypto-web-push`,不自行實作 RFC8291 aes128gcm / VAPID JWT。
- 跨使用者讀訂閱、endpoint 重新歸屬走 **service role**(`SUPABASE_SERVICE_ROLE_KEY`),不靠一般 RLS。
- 失效訂閱(HTTP 404/410)即刪除該列。
- 變更 RPC 回傳型別前必須先 `DROP FUNCTION`(Postgres 不能用 `CREATE OR REPLACE` 改 return type);migration 與 `supabase/functions/expense_helpers.sql` snapshot 兩邊同步。

---

## File Structure

- `supabase/migrations/0010_push_notifications.sql` — 新表 + RLS + DROP/重建 3 個 RPC(新回傳型別)
- `supabase/functions/expense_helpers.sql` — 同步 3 個 RPC 的新定義
- `src/types/database.ts` — `PushSubscriptionRow`、`NotificationPayload` 型別
- `src/lib/notify.ts` — 純邏輯:收件人篩選 + payload 文案組裝(可單元測試)
- `src/lib/supabase/admin.ts` — service role client 工廠
- `src/lib/push.ts` — `sendPushToUsers`(讀訂閱、送 Web Push、刪失效訂閱)
- `src/lib/actions/push.ts` — `saveSubscriptionAction` / `deleteSubscriptionAction`(service role upsert / 刪除)
- `public/sw.js` — service worker(push / notificationclick)
- `src/lib/push-client.ts` — 前端共用:`enablePush()` / `disablePush()`
- `src/components/notifications/NotificationToggle.tsx` — 設定頁開關(client)
- `src/components/notifications/NotificationPrompt.tsx` — 登入後自動橫幅(client)
- `src/lib/actions/expenses.ts` — 接線三事件(modify)
- `src/app/(app)/settings/page.tsx` — 放 NotificationToggle(modify)
- `src/app/(app)/layout.tsx` — 放 NotificationPrompt(modify)
- `src/components/settings/SignOutButton.tsx` — 登出前 disablePush(modify)
- `tests/utils/notify.test.ts` — notify.ts 單元測試
- `wrangler.toml` / `.env.local.example` — env / vars

---

## Task 1: DB — push_subscriptions 表 + RPC 回傳型別

**Files:**
- Create: `supabase/migrations/0010_push_notifications.sql`
- Modify: `supabase/functions/expense_helpers.sql`(同步 3 個 RPC)

**Interfaces:**
- Produces:
  - 表 `push_subscriptions(id, user_id, endpoint UNIQUE, p256dh, auth, created_at)`
  - `approve_expense(uuid) RETURNS uuid`(本次造成全員通過回 expense_id,否則 NULL)
  - `approve_all_pending() RETURNS SETOF uuid`(本次變全員通過的 expense_id)
  - `reject_expense(uuid) RETURNS boolean`(本次真的由非 rejected 變 rejected 才回 true)

- [ ] **Step 1: 寫 migration `0010`**

```sql
-- supabase/migrations/0010_push_notifications.sql
-- Web Push: store per-device subscriptions; change approval RPCs to report
-- what actually changed so notifications fire exactly once.

-- ============================================================
-- push_subscriptions
-- ============================================================
CREATE TABLE push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Owner self-management. Normal subscription writes go through service role
-- (so a re-used endpoint can be reassigned across accounts); these policies
-- exist for owner reads and the off-switch.
CREATE POLICY "push_subscriptions_select" ON push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_subscriptions_insert" ON push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subscriptions_update" ON push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subscriptions_delete" ON push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- Approval RPCs: change return types (must DROP first)
-- ============================================================
DROP FUNCTION IF EXISTS approve_expense(uuid);
DROP FUNCTION IF EXISTS approve_all_pending();
DROP FUNCTION IF EXISTS reject_expense(uuid);

-- approve_expense: returns the expense_id IFF this call made it fully approved.
CREATE OR REPLACE FUNCTION approve_expense(p_expense_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed int;
  v_all_approved boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM expense_splits WHERE expense_id = p_expense_id AND approval_status = 'rejected') THEN
    RAISE EXCEPTION 'EXPENSE_REJECTED';
  END IF;

  UPDATE expense_splits SET approval_status = 'approved'
  WHERE expense_id = p_expense_id AND user_id = auth.uid() AND approval_status <> 'approved';
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed = 0 THEN RETURN NULL; END IF;

  SELECT bool_and(approval_status = 'approved') INTO v_all_approved
  FROM expense_splits WHERE expense_id = p_expense_id;

  IF v_all_approved THEN RETURN p_expense_id; END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION approve_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION approve_expense(uuid) TO authenticated;

-- approve_all_pending: returns expense_ids that became fully approved this call.
CREATE OR REPLACE FUNCTION approve_all_pending()
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH changed AS (
    UPDATE expense_splits es SET approval_status = 'approved'
    WHERE es.user_id = auth.uid()
      AND es.approval_status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM expense_splits s2
        WHERE s2.expense_id = es.expense_id AND s2.approval_status = 'rejected'
      )
    RETURNING es.expense_id
  )
  SELECT c.expense_id FROM (SELECT DISTINCT expense_id FROM changed) c
  WHERE (SELECT bool_and(approval_status = 'approved')
         FROM expense_splits WHERE expense_id = c.expense_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION approve_all_pending() FROM public, anon;
GRANT  EXECUTE ON FUNCTION approve_all_pending() TO authenticated;

-- reject_expense: returns true only when this call flipped it to rejected.
CREATE OR REPLACE FUNCTION reject_expense(p_expense_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_changed int;
BEGIN
  UPDATE expense_splits SET approval_status = 'rejected'
  WHERE expense_id = p_expense_id AND user_id = auth.uid() AND approval_status <> 'rejected';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed > 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION reject_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION reject_expense(uuid) TO authenticated;
```

- [ ] **Step 2: 同步 `expense_helpers.sql` snapshot**

把 `expense_helpers.sql` 內現有 `approve_expense` / `reject_expense` / `approve_all_pending` 三段,**整段換成** Step 1 中對應的新定義(含 `DROP FUNCTION IF EXISTS ...;` 置於各 `CREATE` 之前),其餘函式不動。

- [ ] **Step 3: 驗證 SQL(本地無 Supabase stack,套用到遠端時驗證)**

此步驟為人工驗證,留待部署任務(Task 11)以 `supabase db push` 套用,確認無語法錯誤、函式可建立。本任務僅交付 SQL 檔。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_push_notifications.sql supabase/functions/expense_helpers.sql
git commit -m "✨ feat(db): push_subscriptions table + approval RPCs report what changed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: notify.ts — 純邏輯(收件人篩選 + 文案)

**Files:**
- Create: `src/lib/notify.ts`
- Test: `tests/utils/notify.test.ts`

**Interfaces:**
- Produces:
  - `type NotificationPayload = { title: string; body: string; url: string }`
  - `pendingRecipients(splits: { user_id: string }[], creatorId: string): string[]`
  - `approvalNeededPayload(expenseTitle: string): NotificationPayload`
  - `rejectedPayload(expenseTitle: string, tripId: string): NotificationPayload`
  - `approvedPayload(expenseTitle: string, tripId: string): NotificationPayload`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/utils/notify.test.ts
import { describe, it, expect } from 'vitest'
import {
  pendingRecipients,
  approvalNeededPayload,
  rejectedPayload,
  approvedPayload,
} from '@/lib/notify'

describe('pendingRecipients', () => {
  it('excludes the creator and dedupes', () => {
    const splits = [{ user_id: 'me' }, { user_id: 'a' }, { user_id: 'b' }, { user_id: 'a' }]
    expect(pendingRecipients(splits, 'me').sort()).toEqual(['a', 'b'])
  })
  it('returns empty when only the creator splits', () => {
    expect(pendingRecipients([{ user_id: 'me' }], 'me')).toEqual([])
  })
})

describe('payload builders', () => {
  it('approvalNeeded points to /review', () => {
    const p = approvalNeededPayload('拉麵')
    expect(p.url).toBe('/review')
    expect(p.body).toContain('拉麵')
  })
  it('rejected/approved point to the trip and stay internal paths', () => {
    expect(rejectedPayload('拉麵', 't1').url).toBe('/trips/t1')
    expect(approvedPayload('拉麵', 't1').url).toBe('/trips/t1')
    expect(rejectedPayload('拉麵', 't1').url.startsWith('/')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/utils/notify.test.ts`
Expected: FAIL（`@/lib/notify` 不存在）

- [ ] **Step 3: 實作 `src/lib/notify.ts`**

```ts
// src/lib/notify.ts
// Pure helpers for push notifications: recipient selection and copy. No I/O.

export type NotificationPayload = { title: string; body: string; url: string }

/** Splitters who must approve = everyone in the splits except the creator. */
export function pendingRecipients(splits: { user_id: string }[], creatorId: string): string[] {
  return [...new Set(splits.map(s => s.user_id))].filter(id => id !== creatorId)
}

export function approvalNeededPayload(expenseTitle: string): NotificationPayload {
  return { title: '有費用等你審核', body: expenseTitle, url: '/review' }
}

export function rejectedPayload(expenseTitle: string, tripId: string): NotificationPayload {
  return { title: '費用被退回', body: `「${expenseTitle}」被退回,請修改後重新送審`, url: `/trips/${tripId}` }
}

export function approvedPayload(expenseTitle: string, tripId: string): NotificationPayload {
  return { title: '費用已全員通過', body: `「${expenseTitle}」已正式計入結算`, url: `/trips/${tripId}` }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/utils/notify.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/notify.ts tests/utils/notify.test.ts
git commit -m "✨ feat(notify): recipient selection and notification copy helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 依賴 + service role client + sendPushToUsers

**Files:**
- Create: `src/lib/supabase/admin.ts`, `src/lib/push.ts`
- Modify: `package.json`（新增依賴）
- Modify: `src/types/database.ts`（`PushSubscriptionRow`）

**Interfaces:**
- Consumes: `NotificationPayload`（Task 2）
- Produces:
  - `createAdminClient(): SupabaseClient`（service role,no session persistence）
  - `sendPushToUsers(userIds: string[], payload: NotificationPayload): Promise<void>`（永不 throw）

- [ ] **Step 1: 安裝 Workers 相容 push 套件**

Run: `npm install @block65/webcrypto-web-push`
Expected: 加入 `dependencies`,無錯誤。

- [ ] **Step 2: service role client**

```ts
// src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client — bypasses RLS. Use ONLY in trusted server code
 * (sending push to other users, reassigning subscription endpoints).
 * Never expose the key to the client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

- [ ] **Step 3: `PushSubscriptionRow` 型別**

在 `src/types/database.ts` 末尾加:

```ts
export type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}
```

- [ ] **Step 4: `sendPushToUsers`**

> 先確認套件 API：`buildPushPayload(message, subscription, vapid)` 回傳可直接給 `fetch(subscription.endpoint, payload)` 的物件;`message` 形如 `{ data: string, options?: { ttl?: number } }`;`subscription` 為 `{ endpoint, keys: { p256dh, auth } }`;`vapid` 為 `{ subject, publicKey, privateKey }`。實作時對照 `node_modules/@block65/webcrypto-web-push` 的型別微調欄位名。

```ts
// src/lib/push.ts
import { buildPushPayload } from '@block65/webcrypto-web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationPayload } from '@/lib/notify'

const vapid = () => ({
  subject: process.env.VAPID_SUBJECT!,
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  privateKey: process.env.VAPID_PRIVATE_KEY!,
})

/**
 * Best-effort fan-out. Reads recipients' subscriptions via service role,
 * sends each, and prunes subscriptions the push service reports as gone
 * (404/410). NEVER throws — callers fire-and-forget so the main action
 * is unaffected by push failures.
 */
export async function sendPushToUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
  try {
    if (userIds.length === 0) return
    const admin = createAdminClient()
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', userIds)
    if (error || !subs?.length) return

    const message = { data: JSON.stringify(payload), options: { ttl: 60 } }

    await Promise.all(subs.map(async sub => {
      try {
        const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
        const req = await buildPushPayload(message, subscription, vapid())
        const res = await fetch(sub.endpoint, req)
        if (res.status === 404 || res.status === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      } catch (err) {
        console.error('push send failed', { endpoint: sub.endpoint, err })
      }
    }))
  } catch (err) {
    console.error('sendPushToUsers failed', err)
  }
}
```

- [ ] **Step 5: 型別/建置檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤（若套件 message/subscription 欄位名不符,依其型別調整 Step 4)。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/supabase/admin.ts src/lib/push.ts src/types/database.ts
git commit -m "✨ feat(push): service-role sender via webcrypto-web-push, prunes dead subs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 訂閱 server actions(save / delete)

**Files:**
- Create: `src/lib/actions/push.ts`

**Interfaces:**
- Consumes: `createAdminClient`（Task 3）、`createClient`（既有 `@/lib/supabase/server`）
- Produces:
  - `saveSubscriptionAction(sub: { endpoint: string; p256dh: string; auth: string }): Promise<{ error?: string; success?: boolean }>`
  - `deleteSubscriptionAction(endpoint: string): Promise<{ success: boolean }>`

- [ ] **Step 1: 實作**

```ts
// src/lib/actions/push.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Upsert the caller's subscription via service role keyed on endpoint, so a
 * device re-used across accounts gets reassigned to the current user
 * (endpoint is UNIQUE; a plain RLS upsert would be blocked when the row still
 * belongs to the previous account).
 */
export async function saveSubscriptionAction(sub: { endpoint: string; p256dh: string; auth: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { onConflict: 'endpoint' },
    )
  if (error) {
    console.error('saveSubscription failed', error)
    return { error: '無法儲存通知訂閱' }
  }
  return { success: true }
}

export async function deleteSubscriptionAction(endpoint: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: true }
  // RLS delete policy scopes this to the caller's own rows.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return { success: true }
}
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/push.ts
git commit -m "✨ feat(push): subscription save (service-role reassign) and delete actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Service worker

**Files:**
- Create: `public/sw.js`

**Interfaces:**
- Produces: 站台根 scope 的 service worker,處理 `push` 與 `notificationclick`。

- [ ] **Step 1: 寫 `public/sw.js`**

```js
// public/sw.js — Web Push handler. Plain JS, no build step.

self.addEventListener('push', event => {
  let payload = { title: 'ShareMoney', body: '', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch (_) { /* keep defaults */ }

  // Open-redirect guard: only ever navigate to internal paths.
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/'

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url
  const target = typeof url === 'string' && url.startsWith('/') ? url : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.endsWith(target) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
```

- [ ] **Step 2: 確認檔案位於 `public/sw.js`(部署後於 Task 11 驗證 `/sw.js` 可取得且 Content-Type 正確)**

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "✨ feat(pwa): service worker for push + notificationclick (internal-path guard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 前端共用 push 客戶端

**Files:**
- Create: `src/lib/push-client.ts`

**Interfaces:**
- Consumes: `saveSubscriptionAction` / `deleteSubscriptionAction`（Task 4）
- Produces:
  - `isPushSupported(): boolean`
  - `enablePush(): Promise<'enabled' | 'denied' | 'unsupported'>`
  - `disablePush(): Promise<void>`

- [ ] **Step 1: 實作**

> 順序關鍵:**先 `Notification.requestPermission()`**(點擊後立刻呼叫),granted 後才 `register` + `subscribe`,避免中間 `await` 消耗使用者手勢。

```ts
// src/lib/push-client.ts
import { saveSubscriptionAction, deleteSubscriptionAction } from '@/lib/actions/push'

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

// VAPID public key (URL-safe base64) → Uint8Array for applicationServerKey.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function extractKeys(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON()
  return { endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth }
}

export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })
  await saveSubscriptionAction(extractKeys(sub))
  return 'enabled'
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await deleteSubscriptionAction(sub.endpoint)
    await sub.unsubscribe()
  }
}
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 3: Commit**

```bash
git add src/lib/push-client.ts
git commit -m "✨ feat(push): client enable/disable helpers (permission-first ordering)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: NotificationToggle + 設定頁

**Files:**
- Create: `src/components/notifications/NotificationToggle.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `isPushSupported` / `enablePush` / `disablePush`（Task 6）

- [ ] **Step 1: 元件**

```tsx
// src/components/notifications/NotificationToggle.tsx
'use client'

import { useEffect, useState } from 'react'
import { isPushSupported, enablePush, disablePush } from '@/lib/push-client'

type State = 'loading' | 'unsupported' | 'on' | 'off' | 'blocked'

export function NotificationToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('blocked'); return }
    navigator.serviceWorker.getRegistration('/sw.js')
      .then(reg => reg?.pushManager.getSubscription())
      .then(sub => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'))
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      if (state === 'on') { await disablePush(); setState('off') }
      else {
        const res = await enablePush()
        setState(res === 'enabled' ? 'on' : res === 'denied' ? 'blocked' : 'unsupported')
      }
    } finally { setBusy(false) }
  }

  if (state === 'loading') return null
  if (state === 'unsupported')
    return <p className="text-xs text-ink-4">此裝置不支援推播(iOS 需先將 App 加入主畫面)。</p>
  if (state === 'blocked')
    return <p className="text-xs text-ink-4">通知已被瀏覽器封鎖,請到瀏覽器設定開啟。</p>

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-ink">推播通知</p>
        <p className="text-xs text-ink-4 mt-0.5">有人找你審核、或你的費用被退回/通過時提醒你</p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={state === 'on'}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${state === 'on' ? 'bg-accent' : 'bg-line'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${state === 'on' ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 接進設定頁**

在 `src/app/(app)/settings/page.tsx`,於「顯示名稱」section 之後、`import` 區加入元件並新增一個 section:

```tsx
import { NotificationToggle } from '@/components/notifications/NotificationToggle'
```

```tsx
        {/* Notifications */}
        <section>
          <p className="text-xs font-semibold text-ink-3 mb-2 px-1">通知</p>
          <div className="bg-white rounded-2xl shadow-card p-5">
            <NotificationToggle />
          </div>
        </section>
```

- [ ] **Step 3: 建置檢查**

Run: `npx next build`
Expected: 編譯成功

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/NotificationToggle.tsx "src/app/(app)/settings/page.tsx"
git commit -m "✨ feat(settings): push notification toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: NotificationPrompt(登入後自動橫幅)

**Files:**
- Create: `src/components/notifications/NotificationPrompt.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `isPushSupported` / `enablePush`（Task 6）

- [ ] **Step 1: 元件**

```tsx
// src/components/notifications/NotificationPrompt.tsx
'use client'

import { useEffect, useState } from 'react'
import { isPushSupported, enablePush } from '@/lib/push-client'

const DISMISS_KEY = 'push-prompt-dismissed'

export function NotificationPrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) return
    if (Notification.permission !== 'default') return
    if (localStorage.getItem(DISMISS_KEY)) return
    setShow(true)
  }, [])

  if (!show) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  async function enable() {
    setBusy(true)
    try { await enablePush() } finally {
      localStorage.setItem(DISMISS_KEY, '1')
      setShow(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-card-hover p-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">開啟通知</p>
          <p className="text-xs text-ink-4 mt-0.5">有人找你審核、或你的費用有結果時提醒你</p>
        </div>
        <button type="button" onClick={dismiss} className="text-[13px] text-ink-4 px-2 py-1.5">稍後</button>
        <button type="button" onClick={enable} disabled={busy}
          className="text-[13px] font-semibold text-white bg-accent rounded-lg px-3 py-1.5 disabled:opacity-50">
          開啟
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 接進 `(app)/layout.tsx`**

```tsx
import { NotificationPrompt } from '@/components/notifications/NotificationPrompt'
```

在 `<RealtimeRefresher />` 之後加 `<NotificationPrompt />`。

- [ ] **Step 3: 建置檢查**

Run: `npx next build`
Expected: 編譯成功

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/NotificationPrompt.tsx "src/app/(app)/layout.tsx"
git commit -m "✨ feat(pwa): auto enable-notifications prompt after login

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: 登出前清除訂閱

**Files:**
- Modify: `src/components/settings/SignOutButton.tsx`

**Interfaces:**
- Consumes: `disablePush`（Task 6）

- [ ] **Step 1: 先讀現況**

Read `src/components/settings/SignOutButton.tsx`,找到觸發登出的 handler(呼叫 `supabase.auth.signOut()` 或 server action 之處)。

- [ ] **Step 2: 在登出前呼叫 disablePush**

於登出動作執行前插入(client handler 內):

```tsx
import { disablePush } from '@/lib/push-client'
// ...
await disablePush().catch(() => {})  // best-effort: clear this device's sub first
// ...原本的 signOut 流程
```

若 `SignOutButton` 目前是純 server-action 表單(無 client handler),改為 client 元件包一層 `onClick`:先 `await disablePush().catch(()=>{})` 再送出表單。保持原本登出邏輯不變。

- [ ] **Step 3: 建置檢查**

Run: `npx next build`
Expected: 編譯成功

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SignOutButton.tsx
git commit -m "✨ feat(auth): unsubscribe push on this device before sign out

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: 三事件接線到 expense actions

**Files:**
- Modify: `src/lib/actions/expenses.ts`

**Interfaces:**
- Consumes: `pendingRecipients` / `approvalNeededPayload` / `rejectedPayload` / `approvedPayload`（Task 2）、`sendPushToUsers`（Task 3）、RPC 新回傳值(Task 1)

- [ ] **Step 1: import**

在 `src/lib/actions/expenses.ts` 頂部加:

```ts
import { sendPushToUsers } from '@/lib/push'
import { pendingRecipients, approvalNeededPayload, rejectedPayload, approvedPayload } from '@/lib/notify'
```

- [ ] **Step 2: 事件① — createExpenseAction 接住 RPC 回傳並通知**

把 `createExpenseAction` 內的 rpc 呼叫改為接 `data`,成功後通知待審分擔者:

```ts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: expenseId, error } = await supabase.rpc('create_expense_with_splits', {
    p_trip_id: tripId,
    p_title: title.trim(),
    p_amount: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_paid_at: paidAtIso,
    p_splits: splits,
    p_note: note ?? null,
  })

  if (error) return { error: mapRpcError(error.message) }

  if (user && expenseId) {
    const recipients = pendingRecipients(splits, user.id)
    await sendPushToUsers(recipients, approvalNeededPayload(title.trim()))
  }

  revalidatePath(`/trips/${tripId}`)
  return { success: true }
```

- [ ] **Step 3: 事件② — rejectExpenseAction**

```ts
export async function rejectExpenseAction(expenseId: string, tripId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: didReject, error } = await supabase.rpc('reject_expense', { p_expense_id: expenseId })
  if (error) return { error: mapRpcError(error.message) }

  if (didReject) {
    const { data: exp } = await supabase
      .from('expenses')
      .select('title, trip_id, created_by')
      .eq('id', expenseId)
      .single()
    if (exp && exp.created_by !== user?.id) {
      await sendPushToUsers([exp.created_by], rejectedPayload(exp.title, exp.trip_id))
    }
  }

  revalidateApprovalSurfaces(tripId)
  return { success: true }
}
```

- [ ] **Step 4: 事件③ — approveExpenseAction（RPC 回非 null id）**

```ts
export async function approveExpenseAction(expenseId: string, tripId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: fullyApprovedId, error } = await supabase.rpc('approve_expense', { p_expense_id: expenseId })
  if (error) return { error: mapRpcError(error.message) }

  if (fullyApprovedId) {
    const { data: exp } = await supabase
      .from('expenses')
      .select('title, trip_id, created_by')
      .eq('id', fullyApprovedId)
      .single()
    if (exp && exp.created_by !== user?.id) {
      await sendPushToUsers([exp.created_by], approvedPayload(exp.title, exp.trip_id))
    }
  }

  revalidateApprovalSurfaces(tripId)
  return { success: true }
}
```

- [ ] **Step 5: 事件③ — approveAllPendingAction（RPC 回 SETOF id）**

```ts
export async function approveAllPendingAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: ids, error } = await supabase.rpc('approve_all_pending')
  if (error) return { error: mapRpcError(error.message) }

  const approvedIds = ((ids ?? []) as unknown as string[])
  if (approvedIds.length > 0) {
    const { data: exps } = await supabase
      .from('expenses')
      .select('title, trip_id, created_by')
      .in('id', approvedIds)
    for (const exp of exps ?? []) {
      if (exp.created_by !== user?.id) {
        await sendPushToUsers([exp.created_by], approvedPayload(exp.title, exp.trip_id))
      }
    }
  }

  revalidateApprovalSurfaces()
  return { success: true }
}
```

> 註:`supabase.rpc('approve_all_pending')` 對 `RETURNS SETOF uuid` 回傳的 `data` 是 uuid 陣列(可能是 `string[]` 或 `{ approve_all_pending: string }[]`,依 PostgREST 版本)。實作時 `console.log` 一次確認形狀,必要時 `.map(r => r.approve_all_pending)`。

- [ ] **Step 6: 建置 + 既有測試**

Run: `npx next build && npx vitest run`
Expected: 建置成功;75+ 既有測試 + notify 測試全過。

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/expenses.ts
git commit -m "✨ feat(expenses): push notifications on approval-needed, reject, full-approval

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Env / secrets / 部署驗證

**Files:**
- Modify: `wrangler.toml`、`.env.local.example`

**Interfaces:** 無程式介面;此任務交付可運作的部署環境與驗證。

- [ ] **Step 1: 產生 VAPID 金鑰對**

Run: `npx web-push generate-vapid-keys`
記下輸出的 `Public Key` / `Private Key`(URL-safe base64)。

- [ ] **Step 2: `.env.local`(本機)新增**

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:sei.tu@neutec.com.tw
SUPABASE_SERVICE_ROLE_KEY=<supabase service role key>
```

並在 `.env.local.example` 補上同名(值留空/示意)。

- [ ] **Step 3: `wrangler.toml` 加 public 變數**

於 `[vars]` 加:

```toml
NEXT_PUBLIC_VAPID_PUBLIC_KEY = "<public key>"
```

- [ ] **Step 4: 設定 Worker secrets(私密值不進 repo)**

Run(逐一輸入值):
```
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 5: 套用 DB migration**

Run: `supabase db push`
Expected: `0010` 套用成功(表建立、3 個 RPC 以新回傳型別重建)。

- [ ] **Step 6: 部署並驗證 service worker**

Run: `npm run deploy`
驗證:瀏覽器開 `https://<site>/sw.js` 回 200 且 `Content-Type: application/javascript`(或 `text/javascript`);若被 OpenNext asset routing 攔截,於 `open-next.config.ts` / headers 調整。

- [ ] **Step 7: 端對端手動驗證**

兩個帳號(或兩裝置):
1. A 在設定開啟通知(或登入後橫幅點開啟)→ 確認 `push_subscriptions` 有 A 的列。
2. B 新增一筆把 A 列入分擔 → A 收到「有費用等你審核」,點擊進 `/review`。
3. A 退回該費用 → B(建立者)收到「費用被退回」。
4. 多人分擔情境,最後一人通過 → 建立者收到「費用已全員通過」。

- [ ] **Step 8: Commit**

```bash
git add wrangler.toml .env.local.example
git commit -m "🔧 chore(push): VAPID public var and env example for push notifications

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- push_subscriptions 表 + RLS(含 UPDATE policy)→ Task 1 ✓
- 3 RPC 改回傳 + DROP 先行 + snapshot 同步 → Task 1 ✓
- service worker(push/click + open-redirect 防護)→ Task 5 ✓
- 啟用流程(permission-first)→ Task 6;設定開關 → Task 7;自動橫幅 → Task 8 ✓
- 帳號切換 endpoint 重歸屬(service role upsert)→ Task 4;登出清訂閱 → Task 9 ✓
- sendPushToUsers(service role 讀、送、刪失效、永不 throw)→ Task 3 ✓
- 三事件接線 + create 接 RPC 回傳 id + 去重(reject true / approve 非 null)→ Task 10 ✓
- secrets/env、sw.js content-type 驗證、e2e → Task 11 ✓
- 純邏輯單元測試(收件人/文案)→ Task 2 ✓

**Placeholder scan:** 無 TBD/TODO;每個程式步驟均有完整程式碼。兩處明確標示「實作時對照套件型別/PostgREST 形狀微調」(Task 3 Step 4、Task 10 Step 5)——屬已知的外部介面確認點,非 placeholder。

**Type consistency:** `NotificationPayload`、`pendingRecipients`、`sendPushToUsers`、`enablePush/disablePush`、`saveSubscriptionAction/deleteSubscriptionAction` 在定義與消費端簽章一致;RPC 回傳(uuid / SETOF uuid / boolean)與 Task 10 的 `data` 用法一致。
