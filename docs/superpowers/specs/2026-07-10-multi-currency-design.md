# 多幣別支援 + 即時匯率

## 目標

目前行程外幣寫死日圓（JPY）。讓每個行程可選一種常用外幣（港幣、美金、韓元…），
建立行程時自動抓該幣別對台幣的即時匯率。家用幣仍固定為 TWD。

## 幣別模型

**每個行程一種外幣**（在建立行程時選定），全程只有「該外幣 + TWD」兩種幣別。
家用幣固定 TWD，所有結算換算成 TWD。

這是刻意的最小模型：一趟旅行去一個國家、用一種外幣，符合實際用法，且沿用
現有的單一 `trips.exchange_rate` 欄位，結算邏輯完全不動。

**不做**：同一行程混多種外幣（每筆費用各自幣別）。若日後需要，需改為
per-currency 匯率表，屆時另開 spec。

## 支援幣別清單

| 代碼 | 中文 | 符號 | 小數位 |
|------|------|------|--------|
| JPY | 日圓 | ¥ | 0 |
| KRW | 韓元 | ₩ | 0 |
| VND | 越南盾 | ₫ | 0 |
| USD | 美金 | $ | 2 |
| HKD | 港幣 | HK$ | 2 |
| CNY | 人民幣 | CN¥ | 2 |
| EUR | 歐元 | € | 2 |
| THB | 泰銖 | ฿ | 2 |
| GBP | 英鎊 | £ | 2 |
| TWD | 台幣 | NT$ | 2（家用幣，不可選為外幣）|

零小數幣別（金額必須為整數）：`JPY`、`KRW`、`VND`。
TWD 沿用現有 2 位小數行為，不更動既有資料。

## 元件與改動

### 1. 幣別 metadata（`src/lib/utils/currency.ts`）

新增常數表，單一事實來源：

```ts
export const CURRENCIES = {
  JPY: { label: '日圓', symbol: '¥',   decimals: 0 },
  KRW: { label: '韓元', symbol: '₩',   decimals: 0 },
  VND: { label: '越南盾', symbol: '₫', decimals: 0 },
  USD: { label: '美金', symbol: '$',   decimals: 2 },
  HKD: { label: '港幣', symbol: 'HK$', decimals: 2 },
  CNY: { label: '人民幣', symbol: 'CN¥', decimals: 2 },
  EUR: { label: '歐元', symbol: '€',   decimals: 2 },
  THB: { label: '泰銖', symbol: '฿',   decimals: 2 },
  GBP: { label: '英鎊', symbol: '£',   decimals: 2 },
  TWD: { label: '台幣', symbol: 'NT$', decimals: 2 },
} as const

// 可選為行程外幣的清單（排除家用幣 TWD）
export const FOREIGN_CURRENCIES = (Object.keys(CURRENCIES) as Currency[])
  .filter(c => c !== 'TWD')
```

改寫既有函式改為查表，取代寫死的 `=== 'JPY'`：

- `formatAmount(amount, currency)`：用 `symbol` + `decimals`。
- `splitEqually` / `splitWithRemainder`：用 `decimals === 0` 判斷是否整數幣別
  （原本只認 JPY，現改為認任何零小數幣別）。

`convertToTWD` 不動（本來就是 `amount * rate`，對任何外幣皆通用）。

### 2. 型別（`src/types/database.ts`）

`Currency` 從 `'JPY' | 'TWD'` 改為支援清單的 union（10 種）。
`trips` 型別加 `foreign_currency: Currency`。

### 3. DB migration（`supabase/migrations/0012_multi_currency.sql`）

- `trips` 加欄：
  ```sql
  ALTER TABLE trips ADD COLUMN foreign_currency text NOT NULL DEFAULT 'JPY'
    CHECK (foreign_currency IN (<清單, 不含 TWD>));
  ```
  既有 row 自動填 `'JPY'`，零遷移風險。
- `expenses.currency` CHECK：`IN ('JPY','TWD')` → 放寬成整份支援清單（含 TWD）。
- 刪 `jpy_integer_amount`，改為零小數約束：
  ```sql
  CHECK (currency NOT IN ('JPY','KRW','VND') OR amount = floor(amount))
  ```
  對 `expense_splits` 無此約束（原本也沒有），整數檢查在 RPC 內做。
- `create_trip`：加 `p_foreign_currency text DEFAULT 'JPY'` 參數（附加在尾端，
  簽名向後相容），INSERT 時寫入。重發 REVOKE/GRANT。
- `create_expense_with_splits` / `update_expense_with_splits`：
  - 整數檢查 `p_currency = 'JPY'` → `p_currency IN ('JPY','KRW','VND')`。
  - **新增信任邊界驗證**：查該行程的 `foreign_currency`，要求
    `p_currency IN (v_foreign_currency, 'TWD')`，否則 `RAISE EXCEPTION 'INVALID_CURRENCY'`。
    防前端送出與行程外幣不符的幣別（會用錯匯率換算）。
  - 錯誤代碼 `JPY_SPLIT_NOT_INTEGER` 更名為 `SPLIT_NOT_INTEGER`（前端錯誤對照同步）。

### 4. 即時匯率（`src/lib/actions/trips.ts`）

`fetchExchangeRate` 帶幣別參數：

```ts
export async function fetchExchangeRate(currency: Currency = 'JPY'): Promise<number | null>
```

- 家用幣或未知 → 回傳 `null`（TWD→TWD 不需匯率）。
- 其餘：`rate = USDTWD.Exrate / USD<currency>.Exrate`，四捨五入到 4 位。
  已驗證 rter.info 回傳含所有清單幣別（連 `USDUSD=1` 都在）。

`createTripAction`：從 formData 讀 `foreign_currency`，驗證在 `FOREIGN_CURRENCIES` 內，
傳給 `create_trip` RPC。

### 5. 前端

- **新增行程頁（`trips/new/page.tsx`）**：
  - 伺服器端一次抓整張 USD 基準匯率表，算出每個外幣→TWD 傳給 client。
  - 加「外幣」下拉（`FOREIGN_CURRENCIES`，預設 JPY），切換時即時填入對應匯率
    （純前端查表，無 round-trip）。
  - 匯率 label：「1 <外幣> = ? TWD」動態帶入所選幣別。
  - 因需 client 互動，此頁的表單抽成一個 `'use client'` 元件。
- **ExpenseForm**：幣別下拉由寫死 JPY/TWD 改為「該行程 `foreign_currency` + TWD」。
  需把 `foreignCurrency` 當 prop 傳入（新增/編輯費用的父層已有 trip 資料）。
- **寫死文案「1 JPY = X TWD」共 4 處**改讀 `trip.foreign_currency`：
  - `trips/[id]/page.tsx`（匯率工具列）
  - `trips/[id]/balance/page.tsx`（總計說明）
  - `components/trips/TripCard.tsx`
  - `trips/new/page.tsx`（見上）

## 結算與錯誤處理

- 結算不變：`calculateMemberStats`、`calculateNetBalances`、`minimizeTransfers`
  以單一 `trip.exchange_rate` 換算，適用於任何單一外幣行程。
- 匯率抓取失敗 → `fetchExchangeRate` 回 `null`，沿用現有「請手動輸入」的 fallback UI。
- RPC 新增 `INVALID_CURRENCY` 例外，前端錯誤訊息對照表補一筆。

## 測試

延續 ponytail 原則，非平凡邏輯留一個可跑的檢查：

- `currency.ts`：`splitEqually` / `splitWithRemainder` 對零小數幣別（KRW）與
  2 位小數幣別（HKD）的分帳金額 assert（沿用現有測試風格，若無測試檔則加最小自檢）。
- `fetchExchangeRate`：以固定表資料 assert `USD→TWD = USDTWD`、`JPY→TWD = USDTWD/USDJPY`。

## 相容性

舊行程 `foreign_currency` 預設 `'JPY'`、既有費用皆 JPY/TWD，行為與現況完全一致。
無資料遷移、無破壞性變更。
