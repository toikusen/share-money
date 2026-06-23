# PWA 推播通知 — 設計文件

**日期:** 2026-06-23
**狀態:** 已核准,待實作
**前置:** 依賴已上線的費用審核模式([2026-06-23-expense-approval-design.md](./2026-06-23-expense-approval-design.md))

## 目標

用 Web Push 在三個審核事件主動通知使用者(即使 app 沒開啟):

1. **有費用等我審核** — 別人新增費用把我列入分擔 → 通知我
2. **我的費用被拒絕** — 我建立的費用被某分擔者拒絕 → 通知我(建立者)
3. **我的費用全員通過** — 我建立的費用最後一人也通過、正式計入 → 通知我(建立者)

預設意圖為「開」:登入後主動跳啟用提示,使用者點一下授權即訂閱;可在設定關閉。

## 硬限制(設計約束)

- Web Push **無法靜默自動開啟**:訂閱必須先取得通知權限,而權限授予必須由**使用者手勢**觸發。
- **iOS** 只在「已加入主畫面的 PWA」且 iOS 16.4+ 支援 Web Push。
- 因此「預設開啟」= 預設意圖開 + 自動跳一次啟用提示(需一次點擊),不是零點擊。

## 架構(方案 A:從 server action 直送)

所有寫入已集中在 server actions + RPC,收件人在 action 內即可得知,故直接在 action 送推播,不另架 Supabase Edge Function。

### 資料模型 — migration `0010_push_notifications.sql`

```sql
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
-- 使用者只能讀寫自己的訂閱;發送給別人時走 service role 繞過 RLS。
CREATE POLICY "push_subscriptions_select" ON push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_subscriptions_insert" ON push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subscriptions_delete" ON push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());
```

- 一個使用者多裝置 = 多列。`endpoint` UNIQUE;重新訂閱 upsert(`on conflict (endpoint)`)。

### RPC 改回傳值(同一個 `0010`,並同步 `expense_helpers.sql` snapshot)

事件③需要知道「這次操作讓哪些費用變成全員通過」。由 RPC 自己回報,避免事後再查的競態與重複通知。

- `approve_expense(p_expense_id)` **RETURNS uuid**:若此次造成整筆全員通過則回該 expense_id,否則回 NULL。(已 rejected 時照舊 raise `EXPENSE_REJECTED`。)
- `approve_all_pending()` **RETURNS SETOF uuid**:回此次變成全員通過的所有 expense_id。

判定「全員通過」:該費用所有 split 皆 `approved`。

### Service worker — `public/sw.js`(目前不存在)

- `push` 事件:解析 payload `{ title, body, url }` → `self.registration.showNotification(title, { body, data: { url } })`
- `notificationclick` 事件:`clients.openWindow(url)`(或聚焦既有分頁)
- 靜態檔放 `public/sw.js`,scope `/`。

### 啟用流程 — client

**`NotificationToggle`(設定頁新「通知」區塊)**
- 偵測支援度(`'serviceWorker' in navigator && 'PushManager' in window`)。不支援 → 顯示提示(iOS 需先加入主畫面)。
- 「開啟通知」:`register('/sw.js')` → `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <NEXT_PUBLIC_VAPID_PUBLIC_KEY> })` → 把訂閱(endpoint/keys)交給 `saveSubscriptionAction` upsert。
- 「關閉通知」:`subscription.unsubscribe()` + `deleteSubscriptionAction`(刪該 endpoint 列)。
- 顯示目前狀態(已開啟 / 未開啟 / 已被瀏覽器封鎖)。

**自動啟用提示 — `NotificationPrompt`(放 `(app)/layout.tsx`)**
- 出現條件:支援推播 **且** `Notification.permission === 'default'` **且** 未被本機關閉過(`localStorage['push-prompt-dismissed']` 未設)。
- 一張底部橫幅:「開啟通知,有人找你審核就會提醒你」+「開啟」/「稍後」。
- 「開啟」→ 走上面同一套訂閱流程。「稍後」→ 設 `localStorage['push-prompt-dismissed']`,之後不再自動跳(仍可在設定開啟)。

### 發送 — `src/lib/push.ts`

`sendPushToUsers(userIds: string[], payload: { title; body; url })`:
- 用 **service role** 建立 Supabase client(`SUPABASE_SERVICE_ROLE_KEY`)讀取收件人所有訂閱。
- 逐筆送 Web Push;HTTP `404/410`(訂閱失效)→ 刪除該訂閱列。
- **加密不自己寫**:採用 Cloudflare Workers 相容的 Web Push 套件(fetch + Web Crypto 版,實作時對官方文件確認套件與版本)。RFC8291 的 aes128gcm 加密屬安全路徑,絕不手刻。
  `// ponytail: 加 1 個 workers 相容 push 套件,勝過手刻 crypto`
- **發送失敗絕不影響主流程**:整段包 try/catch 吞錯,主 action 照常回 `success`。

### 接線 — 既有 server actions

| 事件 | 觸發點 | 收件人 | url |
|---|---|---|---|
| ① 等我審核 | `createExpenseAction` 成功後 | `splits` 的 user_id 排除建立者(= auth.uid()) | `/review` |
| ② 被拒絕 | `rejectExpenseAction` 成功後 | 該費用 `created_by` | `/trips/{tripId}` |
| ③ 全員通過 | `approveExpenseAction`(RPC 回非 null)/ `approveAllPendingAction`(RPC 回的每個 id) | 各該費用 `created_by`(排除操作者) | `/trips/{tripId}` |

- 收件人 id 與顯示文字(標題/付款人/金額)在 action 內組出 `payload`。
- ②③需要 `created_by` / `title` / `trip_id`:reject 後查該 expense;approve 後針對回傳的 expense_id 查。

### Secrets / env(部署時設定)

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — public,放 `wrangler.toml [vars]`
- `VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`(`mailto:...`) — Worker secret
- `SUPABASE_SERVICE_ROLE_KEY` — Worker secret(跨使用者讀訂閱)
- 本機 `.env.local` 對應補上

## 測試

純邏輯做單元測試:
- payload builder(三事件文案組裝)
- 收件人篩選(分擔者排除建立者;approve 排除操作者)

crypto 簽章/加密與實際發送無法單測,略過(整合測試時手動驗證)。

## 範圍總結

1 新表 + 2 RPC 改回傳 + `sw.js` + `NotificationToggle` + `NotificationPrompt` + `saveSubscriptionAction`/`deleteSubscriptionAction` + `push.ts`(1 新依賴)+ 3 處 action 接線 + secrets。

## 不做(YAGNI)

- 通知偏好細分(逐事件開關)— 一個總開關就好
- 通知中心 / 歷史(已有 `/review` 頁)
- 後端排程/批次、retry 佇列(失敗即丟,失效訂閱即刪)
- 「有人同意一筆(非最後一筆)」「成員加入」等噪音事件
