# 費用審核模式 — 設計文件

**日期:** 2026-06-23
**狀態:** 已核准,待實作

## 目標

新增一筆費用後,該費用先進入「待審」狀態,**所有分擔者確認通過後才正式計入結算**。
提供全域審核頁與一鍵審核。

## 核心決策

| 決策 | 選擇 |
|------|------|
| 生效條件 | 全體分擔者(建立者自己除外)都通過,整筆才計入結算 |
| 拒絕 | 支援。任一分擔者拒絕 → 整筆 rejected |
| 待審清單 | 全域通知頁 `/review`(跨行程),含一鍵「全部同意」 |
| 修改重審 | 建立者修改費用 → 所有審核重設為待審,重新走流程 |

## 資料模型

**不開新表、不在 `expenses` 加欄位。** 審核狀態存在 `expense_splits`,費用層級狀態用推導。

### Migration `0009_expense_approval.sql`

```sql
ALTER TABLE expense_splits ADD COLUMN approval_status text NOT NULL
  DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected'));
CREATE INDEX expense_splits_user_status_idx ON expense_splits (user_id, approval_status);
```

- `DEFAULT 'approved'`:現有舊資料全部 grandfather 成已通過,不破壞既有結算。
- **「分擔者」嚴格等於 `expense_splits` 的 row,不是 trip 全員。** 只有被選入分擔的人需要審核;沒被選入的成員不產生 split、不需審核。
- **0 元 split 也算分擔者**:若建立者把某人選入但分擔 0 元,該人仍有一筆 split,仍需審核(語意上他被列入這筆帳)。建立者自己那筆(`user_id = auth.uid()`)一律 `approved`,不論金額。

### 費用層級狀態(推導,不存欄位)

從一筆費用的所有 splits 計算:

- 任一 split = `rejected` → 整筆 **rejected**
- 全部 split = `approved` → 整筆 **approved**(計入結算)
- 其餘 → **pending**

## 型別

- `ExpenseSplit`(`src/types/database.ts`)加 `approval_status: 'pending' | 'approved' | 'rejected'`。
- 所有 `select('..., expense_splits(*)')` 的顯示型別(`ExpenseWithSplits`、`ExpenseDisplayRow` 等)自然帶到,確認編譯通過。

## 結算與圖表(所有消費端都要吃同一組 approved-only rows)

定義一個共用過濾:**只保留「所有 split 都 approved」的費用**(helper 放 `src/lib/utils/expenses.ts`,例如 `isApproved(expense)` / `approvedOnly(expenses)`)。
pending / rejected 不計入。以下消費端**全部**要套用同一過濾,避免各頁不一致:

- `calculateMemberStats`(`src/lib/utils/balance.ts`)的輸入 rows
- trip 首頁 `myNet`(`trips/[id]/page.tsx`)
- balance 頁的 `totalTWD` 等彙總(`trips/[id]/balance/page.tsx`)
- `DailySpendChart` 的輸入

trip 費用清單則**不過濾**,全部顯示但帶狀態標籤。

## RPC(SECURITY DEFINER,沿用現有模式)

> **兩處都要改:** repo 同時有 migration 與 current-state snapshot
> [`supabase/functions/expense_helpers.sql`](../../../supabase/functions/expense_helpers.sql)。
> 改 2 個 + 加 3 個 RPC,**migration `0009` 與 `expense_helpers.sql` 兩邊都要更新成一致**。
> 否則日後重套 helper SQL 會覆蓋回舊版、把審核邏輯洗掉。

### 修改

- **`create_expense_with_splits`**:插入 splits 時,`user_id = auth.uid()` 那筆設 `approved`,其餘 `pending`。
- **`update_expense_with_splits`**:重設審核 — 所有 split 回 `pending`,建立者自己那筆設 `approved`。

### 新增

- **`approve_expense(p_expense_id)`**:把「我」在該費用的 pending split 設為 approved。
  **若該費用已有任何 rejected split → 直接 raise `EXPENSE_REJECTED`**(rejected 是終態,只有建立者編輯才能重審,不允許撤回拒絕)。
- **`reject_expense(p_expense_id)`**:把「我」那筆設為 rejected(整筆即變 rejected)。
- **`approve_all_pending()`**:一鍵 — 把我所有 pending split 一次設 approved。
  **跳過已拒絕費用的實作:** `UPDATE expense_splits SET approval_status='approved' WHERE user_id=auth.uid() AND approval_status='pending' AND NOT EXISTS (SELECT 1 FROM expense_splits s2 WHERE s2.expense_id = expense_splits.expense_id AND s2.approval_status='rejected')`。

每個都檢查 `auth.uid()`、只能改自己那筆。

**rejected 終態規則:** 一旦整筆 rejected,其他 pending 分擔者不能再 approve(`approve_expense` 報錯,一鍵也跳過)。唯一出路是建立者 `update_expense_with_splits`(重設全部為 pending)或刪除。

錯誤訊息沿用現有 `RPC_ERROR_MESSAGES` → 中文對應,需新增 key:
`EXPENSE_REJECTED`(此費用已被拒絕,請等建立者修改)、以及 approve/reject 的 `NOT_MEMBER` / split 不存在等(沿用既有 key)。對應寫進 [src/lib/actions/expenses.ts](../../../src/lib/actions/expenses.ts) 的 `RPC_ERROR_MESSAGES`。

審核動作**不寫 `activity_logs`**(避免洗版,且不動 `ActivityEvent` 型別)。
`expense.created` 仍照舊在建立時記一筆。
`// ponytail: 審核事件不入 activity log,日後要稽核再加`

## 頁面

### 全域通知頁 `/review`(放進 `(app)` route group)

- 跨行程列出「等我審核」的費用:我的 split 是 `pending`、且該費用未被任何人 rejected。
- 每筆顯示:行程名、標題、金額、付款人、我要分擔多少、審核進度(如 2/3)。
- 每筆有「同意 / 拒絕」按鈕;頂部一顆「全部同意」→ `approve_all_pending`。
- 空狀態:「沒有待審核的費用」。

### 導覽 badge

`(app)/layout.tsx` 加「待審」未讀數,導去 `/review`。
**計數條件必須與 `/review` 清單一致**:我的 split 是 `pending` **且該費用沒有任何 rejected split**。
(避免「A 拒絕、B 仍 pending」時 badge 顯示 1 但 `/review` 空白。)建議把這個查詢抽成共用函式,badge 與 `/review` 共用。

### trip 費用清單

- pending / rejected 費用顯示狀態標籤(如「待審 1/2」「已拒絕」),視覺淡化。
- 建立者可對 rejected 費用直接編輯(走重審)或刪除 — 沿用現有 `EditExpenseButton` / 刪除流程。

## Realtime(必做,現況未涵蓋)

審核改的是 `expense_splits`,但現況 realtime **沒有**監聽這張表:
- migration `0004` 只 publish 了 `expenses`、`trip_members`。
- `RealtimeRefresher.tsx` 只訂閱 `expenses`、`trip_members`。

因此 `0009` 必須加:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_splits;
```

並在 `RealtimeRefresher.tsx` 新增一條訂閱:

```ts
.on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits' }, refresh)
```

否則 A 同意/拒絕後,B 的畫面與 badge 不會即時更新。

## 範圍總結

1 欄位 + 5 個 RPC(改 2 加 3)+ 1 個新頁 `/review` + 導覽 badge + 清單狀態標籤 + 結算/圖表過濾。
無新表、無改 `expenses` schema、無動 activity 型別系統。

## 不做(YAGNI)

- 審核事件寫入 activity log(日後需稽核再加)
- 部分審核部分計入(已否決,語意混亂)
- 建立者可代他人審核 / 強制通過
- 審核留言、@提醒、推播通知
