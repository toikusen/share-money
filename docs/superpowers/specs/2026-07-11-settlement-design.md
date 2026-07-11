# 還款(部分結清)— 設計文件

**日期:** 2026-07-11
**狀態:** 已核准,待實作

## 目標

旅程進行中即可記錄還款,不必等旅程結束——A 在任何時間點還 B 一部分錢,
收款方確認後,該筆金額自動沖銷兩人的淨額,建議轉帳跟著更新。

## 核心決策

| 決策 | 選擇 |
|------|------|
| 資料模型 | 還款 = 特殊 expense(`kind='settlement'`),不開新表 |
| 確認機制 | 需收款方確認:沿用現有 `expense_splits.approval_status` 審核流 |
| 幣別 | TWD 或行程外幣皆可,依行程匯率換算 |
| 入口 | 結算頁「建議轉帳」中 `from === 我` 的項目旁一鍵記錄,金額預帶可改少(部分還款) |
| 編輯 | 不支援,RPC 層強制擋(`SETTLEMENT_NOT_EDITABLE`)。只能刪除重記(限建立者) |
| 記錄方向 | 只有付款方(還錢的人)能記錄;收款方負責確認 |

## 資料模型

### Migration `0015_settlements.sql`

```sql
ALTER TABLE expenses ADD COLUMN kind text NOT NULL DEFAULT 'expense'
  CHECK (kind IN ('expense', 'settlement'));
```

另外 `activity_logs.action` 的 CHECK constraint(0007 版)是封閉列舉,必須同步擴充
加入 `settlement.created` / `settlement.deleted`,否則 RPC 寫 log 時直接違反 constraint。

- `DEFAULT 'expense'`:既有資料全部 grandfather,不影響現有結算。
- 一筆還款的形狀:`kind='settlement'`、`title='還款'`、`paid_by=還錢的人`、
  **恰好一筆 split**,`user_id=收錢的人`、`amount=全額`、`approval_status='pending'`。
- 形狀約束在 RPC 層強制(單一 split、金額相等、收款方 ≠ 付款方),不加表層 constraint。

### 新 RPC `create_settlement`

```sql
create_settlement(p_trip_id uuid, p_to_user uuid, p_amount numeric,
                  p_currency text, p_paid_at timestamptz) RETURNS uuid
```

驗證(全部沿用既有錯誤碼風格,`RAISE EXCEPTION 'XXX'`;幣別規則對齊 0012):

- 呼叫者與 `p_to_user` 都是 trip 成員(`NOT_MEMBER` / `SPLIT_USER_NOT_MEMBER`)
- `p_to_user != auth.uid()`(新錯誤碼 `SETTLE_SELF`)
- `p_currency IN (trip.foreign_currency, 'TWD')`,否則 `INVALID_CURRENCY`
- `p_currency IN ('JPY','KRW','VND')` 時 `p_amount` 必須為整數(`SPLIT_NOT_INTEGER`)
- 金額必須為正數且非 NaN(新錯誤碼 `INVALID_AMOUNT`)。注意 PostgreSQL `numeric`
  接受 `'NaN'` 且 `NaN > 0` 為真,表層 `CHECK (amount > 0)` 擋不住,RPC 必須明確檢查:
  `IF p_amount = 'NaN'::numeric OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'`
- `p_paid_at` 必填(`PAID_AT_REQUIRED`)

Server Action(`createSettlementAction`)在呼叫 RPC 前做同一組基本驗證:
金額為有限正數(`Number.isFinite && > 0`)、整數幣別檢查、不可還自己。

動作:插入 expense(`kind='settlement'`, `title='還款'`, `created_by=paid_by=auth.uid()`)
+ 一筆 pending split 給 `p_to_user` + activity log `settlement.created`。

### 既有 RPC 的改動

- **`update_expense_with_splits` 加一道 guard**:`v_old.kind = 'settlement'` 時
  `RAISE EXCEPTION 'SETTLEMENT_NOT_EDITABLE'`——「不可編輯」必須在 RPC 層強制,
  不能只靠 UI 藏按鈕。
- **`delete_expense` 改寫 activity log 分支**:`kind='settlement'` 時需先查出
  唯一 split 的 `user_id`,action 寫 `settlement.deleted`、details 寫
  `{ title, amount, currency, to_user }`;`kind='expense'` 維持原樣。
- `create_expense_with_splits` 簽名不動(一般費用永遠是 `kind='expense'` default)。
- `approve_expense` / `reject_expense` / `approve_all_pending` 對 settlement 天然可用,零改動。

## 計算規則(關鍵過濾點)

還款流過現有數學即正確:A 還 B 500 → A paid +500、B owed +500 → 淨額互沖。
但**還款不是消費**,統計顯示要過濾:

| 消費端 | 資料範圍 |
|--------|----------|
| 淨額 / 建議轉帳 / balance hero / trip 首頁「你應收/應付」 | 全部 approved rows(**含** settlement) |
| 墊付 vs 應攤圖(`PaidVsShareChart`) | 只算 `kind='expense'` |
| 行程總費用 `totalTWD` | 只算 `kind='expense'` |
| 每日支出圖(`DailySpendChart`) | 只算 `kind='expense'` |

balance 頁因此算兩組:`calculateMemberStats(expenseOnly)` 給圖表、
`calculateNetBalances(all)` 給淨額與轉帳。`balance.ts` 本身零改動。

## UI

### 結算頁(`trips/[id]/balance`)

- 「建議轉帳」清單中 `from === 我` 的項目旁加「記錄還款」按鈕。
- Modal:金額預帶建議值,可自由修改(改少 = 部分還款;不設上限,多還的部分
  會自然反向沖銷)、幣別 TWD/外幣 toggle(即時換算預覽)、日期預設今天。
- 已送出待確認的還款,在建議轉帳區顯示「待 X 確認 NT$nnn」提示,避免重複記錄。

### 費用清單(`ExpenseList`)

還款留在清單內(保留時間脈絡),樣式區分:轉帳 icon、「A → B」文案、
不顯示分攤明細、狀態標籤沿用(待審/已拒絕)。
**settlement 一律隱藏 `EditExpenseButton`**(`ExpenseList.tsx:187` 目前對所有
自己建立的紀錄顯示編輯),只留刪除。

### Review 頁

settlement 的待審項文案改為「確認收款」語氣(例:「A 表示已還你 NT$500」),
按鈕沿用同意/拒絕。

## 型別 / 通知

- `Expense` 加 `kind: 'expense' | 'settlement'`(`src/types/database.ts`)。
- `ActivityEvent` 加 `settlement.created` / `settlement.deleted`
  (details:`{ amount, currency, to_user }`),activity 頁 formatter 對應。
- `notify.ts` 加 settlement 專用 payload:「X 記錄了還款 NT$nnn,請確認」;
  確認後通知付款方沿用 `approvedPayload`。
- `delete_expense` 的 settlement 分支見上方「既有 RPC 的改動」。

## Server Action

`createSettlementAction(params: { tripId, toUser, amount, currency, paidAt })`
(`src/lib/actions/expenses.ts`):呼叫 RPC → push 通知收款方 → revalidate
trip 頁 + balance 頁 + review 相關 surface。

## 測試

- `balance` utils:settlement row 流過 `calculateNetBalances` 後淨額互沖;
  部分還款後 `minimizeTransfers` 產出剩餘正確金額;全額還清後 transfers 為空。
- `expenses` utils:settlement 輸入驗證(金額為有限正數、不可還自己、整數幣別)。
- 過濾規則:含 settlement 的 rows 中,`kind='expense'` 過濾後 totalTWD 不含還款。
- RPC 層:專案目前沒有 SQL 測試設施,新增最小煙霧測試
  `supabase/tests/settlement_smoke.sql`(對 local supabase 跑,不進 CI 也先留著):
  - settlement 呼叫 `update_expense_with_splits` 必須拋 `SETTLEMENT_NOT_EDITABLE`
  - 刪除 settlement 後 activity log 的 action = `settlement.deleted` 且
    `details.to_user` 正確
  - `create_settlement` 拒絕:非成員、還自己、幣別不符、JPY 非整數、
    `'NaN'::numeric` 與非正數金額

## 明確不做(第一版)

- 還款編輯(刪除重記已覆蓋)
- 收款方主動記錄「我收到錢」
- 還款專屬歷史頁
- 自由指定任意對象的獨立還款表單(入口綁在建議轉帳上)
