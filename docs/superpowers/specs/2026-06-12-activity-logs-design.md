# Activity Logs — Design

Date: 2026-06-12
Status: Approved

## Goal

Record every create / edit / delete mutation in a trip and show it to trip
members as an in-trip activity feed (Splitwise-style), including before/after
diffs for expense edits.

## Scope

Logged events:

| action              | when                                  | details payload                                   |
| ------------------- | ------------------------------------- | ------------------------------------------------- |
| `trip.created`      | `create_trip` RPC                     | `{}`                                              |
| `trip.rate_updated` | `update_trip_exchange_rate` RPC       | `{ old_rate, new_rate }`                          |
| `member.joined`     | `join_trip` RPC                       | `{}` (actor is the joiner)                        |
| `expense.created`   | `create_expense_with_splits` RPC      | `{ title, amount, currency }`                     |
| `expense.updated`   | `update_expense_with_splits` RPC      | `{ title, old: {...}, new: {...} }` — changed fields only, among: title, amount, currency, paid_by, paid_at, splits |
| `expense.deleted`   | new `delete_expense` RPC              | `{ title, amount, currency }`                     |

Not logged: trip deletion (logs are CASCADE-deleted with the trip; there is no
surface left to display them).

## Data Model

New migration `supabase/migrations/0005_activity_logs.sql`:

```sql
CREATE TABLE activity_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES profiles(id),
  action     text NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX activity_logs_trip_created_idx
  ON activity_logs (trip_id, created_at DESC);
```

- `action` values are the six strings in the table above (enforced by a CHECK
  constraint).
- In `expense.updated` details, `old.splits` / `new.splits` are arrays of
  `{ user_id, amount }`; the splits key is present only when the split set
  actually changed. The formatter renders splits changes as a generic
  「調整了分擔方式」 rather than a per-member diff.
- RLS: `SELECT` for trip members via existing `is_trip_member(trip_id)`.
  No INSERT/UPDATE/DELETE policies — rows are written only inside
  SECURITY DEFINER functions, so clients cannot forge entries.

## Write Path (Approach A: log inside RPCs, same transaction)

All logging happens inside the existing SECURITY DEFINER RPCs so each logical
user operation produces exactly one log row, atomically with the mutation:

1. `create_expense_with_splits` — INSERT log at the end.
2. `update_expense_with_splits` — read the old expense row and old splits
   before mutating; build a `{ old, new }` jsonb diff containing only changed
   fields; skip the log entirely if nothing changed.
3. New `delete_expense(p_expense_id uuid)` RPC — validates
   `created_by = auth.uid()` (raises `NOT_OWNER`), inserts the log, deletes the
   expense. `deleteExpenseAction` in `src/lib/actions/expenses.ts` switches
   from a direct table delete to this RPC.
4. `create_trip`, `join_trip`, `update_trip_exchange_rate` — INSERT log.
   `update_trip_exchange_rate` skips the log when the rate is unchanged.

RPC redefinitions live in the same `0005` migration (CREATE OR REPLACE).

## UI

New page `src/app/(app)/trips/[id]/activity/page.tsx` (same level as
`balance/`):

- Server component; queries `activity_logs` joined with `profiles`
  (actor display name), ordered by `created_at DESC`, limited to 50 rows.
  No pagination for now.
- Rendering: a pure formatter function maps a log row to a display string,
  e.g. 「小明 新增了『晚餐』 ¥1,500」,「小華 將『晚餐』金額從 ¥1,200 改為
  ¥1,500」,「小美 加入了行程」. Amounts use existing
  `src/lib/utils/currency.ts`; timestamps use `src/lib/utils/datetime.ts`.
- Entry link from the trip detail page, following the existing balance-page
  link pattern.

## Types

- `src/types/database.ts`: add `ActivityLog` row type and the `ActivityAction`
  union; add `delete_expense` to RPC typings if RPCs are typed there.

## Error Handling

- `delete_expense` raises `NOT_OWNER`; map to a Traditional Chinese message in
  the action layer like the existing `RPC_ERROR_MESSAGES`.
- Log INSERT failures abort the whole transaction (acceptable: log and
  mutation stay consistent).

## Testing

- Unit tests in `tests/lib/` for the log-row → display-string formatter
  (all six actions, plus updated-expense diffs covering each field type and
  multi-field changes).
- No pgTAP; SQL functions are exercised manually / via the app.
