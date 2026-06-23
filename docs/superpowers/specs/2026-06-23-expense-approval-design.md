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
- 每個分擔者 = 一筆 split row,各帶自己的審核狀態。

### 費用層級狀態(推導,不存欄位)

從一筆費用的所有 splits 計算:

- 任一 split = `rejected` → 整筆 **rejected**
- 全部 split = `approved` → 整筆 **approved**(計入結算)
- 其餘 → **pending**

## 結算與圖表

`calculateMemberStats` 計算前先過濾:**只保留「所有 split 都 approved」的費用**。
pending / rejected 不計入淨額、不計入每日支出圖(`DailySpendChart`)。
trip 費用清單仍顯示這些筆,帶狀態標籤。

## RPC(SECURITY DEFINER,沿用現有模式)

### 修改

- **`create_expense_with_splits`**:插入 splits 時,`user_id = auth.uid()` 那筆設 `approved`,其餘 `pending`。
- **`update_expense_with_splits`**:重設審核 — 所有 split 回 `pending`,建立者自己那筆設 `approved`。

### 新增

- **`approve_expense(p_expense_id)`**:把「我」在該費用的 split 設為 approved。
- **`reject_expense(p_expense_id)`**:把「我」那筆設為 rejected(整筆即變 rejected)。
- **`approve_all_pending()`**:一鍵 — 把我所有 pending split 一次設 approved,自動跳過已被別人 rejected 的費用。

每個都檢查 `auth.uid()`、只能改自己那筆。錯誤訊息沿用現有 `RPC_ERROR_MESSAGES` → 中文對應。

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

`(app)/layout.tsx` 加「待審」未讀數(我的 pending split 筆數),導去 `/review`。

### trip 費用清單

- pending / rejected 費用顯示狀態標籤(如「待審 1/2」「已拒絕」),視覺淡化。
- 建立者可對 rejected 費用直接編輯(走重審)或刪除 — 沿用現有 `EditExpenseButton` / 刪除流程。

## Realtime

審核改的是 `expense_splits`,現有 `RealtimeRefresher` 監聽變動即刷新。
實作前驗證 `0004_enable_realtime.sql` 已含 `expense_splits`;若無則補。

## 範圍總結

1 欄位 + 5 個 RPC(改 2 加 3)+ 1 個新頁 `/review` + 導覽 badge + 清單狀態標籤 + 結算/圖表過濾。
無新表、無改 `expenses` schema、無動 activity 型別系統。

## 不做(YAGNI)

- 審核事件寫入 activity log(日後需稽核再加)
- 部分審核部分計入(已否決,語意混亂)
- 建立者可代他人審核 / 強制通過
- 審核留言、@提醒、推播通知
