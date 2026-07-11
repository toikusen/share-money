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

-- ============================================================
-- update_expense_with_splits — body is 0012's version verbatim, with ONLY
-- one addition: a guard rejecting edits to settlements (see below).
-- ============================================================

CREATE OR REPLACE FUNCTION update_expense_with_splits(
  p_expense_id uuid,
  p_title      text,
  p_amount     numeric,
  p_currency   text,
  p_paid_by    uuid,
  p_paid_at    timestamptz,
  p_splits     jsonb,
  p_note       text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old        expenses%ROWTYPE;
  v_note       text := NULLIF(btrim(p_note), '');
  v_split      jsonb;
  v_split_sum  numeric := 0;
  v_old_splits jsonb;
  v_new_splits jsonb;
  v_old_diff   jsonb := '{}'::jsonb;
  v_new_diff   jsonb := '{}'::jsonb;
  v_foreign    text;
BEGIN
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'PAID_AT_REQUIRED';
  END IF;

  -- Only the expense creator may edit (mirrors expenses_delete RLS policy)
  SELECT * INTO v_old FROM expenses
  WHERE id = p_expense_id AND created_by = auth.uid();
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;

  -- Settlements are delete-and-re-record only; editing could reshape them
  -- into arbitrary multi-split expenses.
  IF v_old.kind = 'settlement' THEN
    RAISE EXCEPTION 'SETTLEMENT_NOT_EDITABLE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = v_old.trip_id AND user_id = p_paid_by) THEN
    RAISE EXCEPTION 'PAID_BY_NOT_MEMBER';
  END IF;

  SELECT foreign_currency INTO v_foreign FROM trips WHERE id = v_old.trip_id;
  IF p_currency NOT IN (v_foreign, 'TWD') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = v_old.trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency IN ('JPY','KRW','VND') AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'SPLIT_NOT_INTEGER';
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
  IF v_old.note IS DISTINCT FROM v_note THEN
    v_old_diff := v_old_diff || jsonb_build_object('note', v_old.note);
    v_new_diff := v_new_diff || jsonb_build_object('note', v_note);
  END IF;
  IF v_old_splits IS DISTINCT FROM v_new_splits THEN
    v_old_diff := v_old_diff || jsonb_build_object('splits', v_old_splits);
    v_new_diff := v_new_diff || jsonb_build_object('splits', v_new_splits);
  END IF;

  UPDATE expenses
  SET title = p_title, amount = p_amount, currency = p_currency, paid_by = p_paid_by, paid_at = p_paid_at, note = v_note
  WHERE id = p_expense_id;

  -- Editing resets approvals: rebuild splits as pending, creator's own approved.
  DELETE FROM expense_splits WHERE expense_id = p_expense_id;
  INSERT INTO expense_splits (expense_id, user_id, amount, approval_status)
  SELECT p_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric,
         CASE WHEN (s->>'user_id')::uuid = auth.uid() THEN 'approved' ELSE 'pending' END
  FROM jsonb_array_elements(p_splits) s;

  IF v_old_diff != '{}'::jsonb THEN
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_old.trip_id, auth.uid(), 'expense.updated',
            jsonb_build_object('title', p_title, 'old', v_old_diff, 'new', v_new_diff));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) TO authenticated;

-- ============================================================
-- delete_expense — rebuilt from 0005's version to branch the activity log
-- entry between plain expenses and settlements.
-- ============================================================

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
