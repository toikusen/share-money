# Notification Action Log — Design

Date: 2026-07-12
Status: Approved

## Goal

Actions taken on the review/notification page (approve, reject, approve-all)
leave entries in the trip activity log, so users can review what they did.
Reuses the existing `activity_logs` table and activity page — no new
infrastructure.

## Background

- The review page (`src/components/review/ReviewList.tsx`) exposes three
  actions: `approve_expense`, `reject_expense`, `approve_all_pending` RPCs.
- Uncommitted migration `0017_settlement_confirmed_log.sql` already logs
  `settlement.confirmed` when a settlement is approved.
- Approving/rejecting a **normal expense**, and rejecting a settlement,
  currently leave no record. This design fills that gap.

## Event model (3 new actions)

| action | details | rendered text |
|---|---|---|
| `expense.approved` | `{title, amount, currency}` | 「小華 確認了『晚餐』 ¥1,200」 |
| `expense.rejected` | `{title, amount, currency}` | 「小華 拒絕了『晚餐』 ¥1,200」 |
| `settlement.rejected` | `{amount, currency, from_user}` | 「小華 拒絕了 小明 的還款 ¥500」 |

`expense.approved` means **the actor confirmed their own split** — it does
NOT mean the expense reached full approval. The RPC logs it whenever any
split flips to approved, which matches what the user did on the notification
page.

Settlement approval is already covered by `settlement.confirmed` — not
duplicated. Rejection mirrors approval's settlement/expense split so the
display text reads naturally.

## Backend (SQL)

Migration `0017_settlement_confirmed_log.sql` is uncommitted — extend it in
place (no new migration). Keep the mirror file
`supabase/functions/expense_helpers.sql` in sync.

1. `activity_logs_action_check` constraint: add the three new actions.
2. `approve_expense`: add `ELSE` branch to the existing
   `IF kind = 'settlement'` — log `expense.approved`.
3. `approve_all_pending`: the settlement-only INSERT becomes: settlements log
   `settlement.confirmed`, everything else logs `expense.approved` (one row
   per expense).
4. `reject_expense`: when the call actually flips the split to rejected,
   fetch the expense; settlement → `settlement.rejected`, else
   `expense.rejected`.

Idempotency: the log INSERT runs in the same transaction as the status
update, and only when `ROW_COUNT > 0` (or the changed set is non-empty), so
concurrent double-clicks re-check the `status <> target` predicate and only
the call that actually flipped state writes a log row.

## Frontend (TypeScript)

- `src/types/database.ts`: add three `ActivityEvent` variants.
- `src/lib/utils/activity.ts`: add three `formatActivityText` cases.
- `tests/utils/activity.test.ts`: one test per new case.
- `supabase/tests/settlement_smoke.sql`: extend smoke checks to cover every
  write path:
  - approve a single normal expense → one `expense.approved`
  - reject a single normal expense → one `expense.rejected`
  - reject a settlement → one `settlement.rejected`
  - approve-all over a mix of normal expenses and settlements → exactly one
    log row per changed expense, with the right action for each kind
  - repeated approve/reject adds no new rows
  - `details`, `actor_id`, `trip_id` are correct on each row

The activity page needs zero changes — it renders by `action`, so new events
appear automatically.

## Out of scope (YAGNI)

- Inline history view on the notification page (activity page covers it)
- Per-user private operation log table
- Activity page filtering (add if it gets noisy)
