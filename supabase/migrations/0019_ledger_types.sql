-- supabase/migrations/0019_ledger_types.sql
-- Generalize trips into ledgers: a type column (display/defaults only — no
-- effect on settlement math) and optional foreign currency. A pure-TWD ledger
-- has foreign_currency IS NULL AND exchange_rate IS NULL.
-- Route names, table names, and type names stay "trip" on purpose (cheap, safe).

-- ============================================================
-- SCHEMA
-- ============================================================

ALTER TABLE trips ADD COLUMN type text NOT NULL DEFAULT 'travel'
  CHECK (type IN ('travel','club','company','dining','household','other'));

ALTER TABLE trips ALTER COLUMN foreign_currency DROP NOT NULL;
ALTER TABLE trips ALTER COLUMN foreign_currency DROP DEFAULT;
ALTER TABLE trips ALTER COLUMN exchange_rate DROP NOT NULL;

-- FX is on (both set) or off (both null) — never half-configured.
ALTER TABLE trips ADD CONSTRAINT currency_rate_pair
  CHECK ((foreign_currency IS NULL) = (exchange_rate IS NULL));

-- ============================================================
-- create_trip — adds p_type; currency/rate may be null (FX off).
-- Drop the 0012 signature to avoid PostgREST overload ambiguity.
-- ============================================================

DROP FUNCTION IF EXISTS create_trip(text, numeric, date, date, text);
CREATE OR REPLACE FUNCTION create_trip(
  p_name             text,
  p_exchange_rate    numeric DEFAULT NULL,
  p_start_date       date    DEFAULT NULL,
  p_end_date         date    DEFAULT NULL,
  p_foreign_currency text    DEFAULT NULL,
  p_type             text    DEFAULT 'travel'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_trip_id uuid;
BEGIN
  INSERT INTO trips (name, created_by, exchange_rate, start_date, end_date, foreign_currency, type)
  VALUES (p_name, auth.uid(), p_exchange_rate, p_start_date, p_end_date, p_foreign_currency, p_type)
  RETURNING id INTO v_trip_id;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid());

  INSERT INTO activity_logs (trip_id, actor_id, action)
  VALUES (v_trip_id, auth.uid(), 'trip.created');

  RETURN v_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_trip(text, numeric, date, date, text, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_trip(text, numeric, date, date, text, text) TO authenticated;

-- ============================================================
-- update_trip_info — adds p_type (null = leave unchanged).
-- ============================================================

DROP FUNCTION IF EXISTS update_trip_info(uuid, text, date, date);
CREATE OR REPLACE FUNCTION update_trip_info(
  p_trip_id    uuid,
  p_name       text,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL,
  p_type       text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trips WHERE id = p_trip_id AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;
  IF trim(p_name) = '' THEN RAISE EXCEPTION 'EMPTY_NAME'; END IF;

  UPDATE trips
  SET name = trim(p_name), start_date = p_start_date, end_date = p_end_date,
      type = COALESCE(p_type, type)
  WHERE id = p_trip_id;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (p_trip_id, auth.uid(), 'trip.info_updated',
          jsonb_build_object('name', trim(p_name)));
END;
$$;
REVOKE EXECUTE ON FUNCTION update_trip_info(uuid, text, date, date, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_trip_info(uuid, text, date, date, text) TO authenticated;

-- ============================================================
-- update_trip_currency — null/null pair now allowed (= turn FX off).
-- Still only before any expense exists.
-- ============================================================

CREATE OR REPLACE FUNCTION update_trip_currency(
  p_trip_id          uuid,
  p_foreign_currency text,
  p_rate             numeric
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  IF EXISTS (SELECT 1 FROM expenses WHERE trip_id = p_trip_id) THEN
    RAISE EXCEPTION 'HAS_EXPENSES';
  END IF;

  IF (p_foreign_currency IS NULL) <> (p_rate IS NULL) THEN
    RAISE EXCEPTION 'CURRENCY_RATE_MISMATCH';
  END IF;
  IF p_foreign_currency IS NOT NULL THEN
    IF p_foreign_currency NOT IN ('JPY','KRW','VND','USD','HKD','CNY','EUR','THB','GBP') THEN
      RAISE EXCEPTION 'INVALID_CURRENCY';
    END IF;
    IF p_rate <= 0 THEN RAISE EXCEPTION 'INVALID_RATE'; END IF;
  END IF;

  UPDATE trips
  SET foreign_currency = p_foreign_currency, exchange_rate = p_rate
  WHERE id = p_trip_id;
END;
$$;

-- ============================================================
-- INVALID_CURRENCY guards: `p_currency NOT IN (v_foreign, 'TWD')` is
-- NULL-unsafe — with v_foreign NULL, three-valued logic lets any currency
-- through. Rewrite the guard in the three RPCs that carry it. Bodies are the
-- latest versions (create_expense: 0012, update_expense + create_settlement:
-- 0015) verbatim, with ONLY the guard line changed.
-- ============================================================

CREATE OR REPLACE FUNCTION create_expense_with_splits(
  p_trip_id  uuid,
  p_title    text,
  p_amount   numeric,
  p_currency text,
  p_paid_by  uuid,
  p_paid_at  timestamptz,
  p_splits   jsonb,
  p_note     text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid;
  v_split      jsonb;
  v_split_sum  numeric := 0;
  v_foreign    text;
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

  SELECT foreign_currency INTO v_foreign FROM trips WHERE id = p_trip_id;
  IF p_currency <> 'TWD' AND p_currency IS DISTINCT FROM v_foreign THEN
    RAISE EXCEPTION 'INVALID_CURRENCY';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = p_trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency IN ('JPY','KRW','VND') AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'SPLIT_NOT_INTEGER';
    END IF;
  END LOOP;

  IF v_split_sum != p_amount THEN RAISE EXCEPTION 'SPLIT_SUM_MISMATCH'; END IF;

  INSERT INTO expenses (trip_id, title, amount, currency, paid_by, paid_at, note, created_by)
  VALUES (p_trip_id, p_title, p_amount, p_currency, p_paid_by, p_paid_at, NULLIF(btrim(p_note), ''), auth.uid())
  RETURNING id INTO v_expense_id;

  -- creator's own split auto-approved, others pending (unchanged from 0009)
  INSERT INTO expense_splits (expense_id, user_id, amount, approval_status)
  SELECT v_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric,
         CASE WHEN (s->>'user_id')::uuid = auth.uid() THEN 'approved' ELSE 'pending' END
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
  IF p_currency <> 'TWD' AND p_currency IS DISTINCT FROM v_foreign THEN
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
  IF p_currency <> 'TWD' AND p_currency IS DISTINCT FROM v_foreign THEN
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
