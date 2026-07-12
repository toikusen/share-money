-- supabase/functions/expense_helpers.sql

-- create_trip
CREATE OR REPLACE FUNCTION create_trip(p_name text, p_exchange_rate numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_trip_id uuid;
BEGIN
  INSERT INTO trips (name, created_by, exchange_rate)
  VALUES (p_name, auth.uid(), p_exchange_rate)
  RETURNING id INTO v_trip_id;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid());

  INSERT INTO activity_logs (trip_id, actor_id, action)
  VALUES (v_trip_id, auth.uid(), 'trip.created');

  RETURN v_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_trip FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_trip TO authenticated;

-- join_trip
CREATE OR REPLACE FUNCTION join_trip(p_invite_token uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id uuid;
  v_count   integer;
BEGIN
  SELECT id INTO v_trip_id FROM trips WHERE invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid())
  ON CONFLICT (trip_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Re-joining via the invite link is a no-op; only log first-time joins.
  IF v_count > 0 THEN
    INSERT INTO activity_logs (trip_id, actor_id, action)
    VALUES (v_trip_id, auth.uid(), 'member.joined');
  END IF;

  RETURN v_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION join_trip FROM public, anon;
GRANT  EXECUTE ON FUNCTION join_trip TO authenticated;

-- create_expense_with_splits
DROP FUNCTION IF EXISTS create_expense_with_splits(uuid, text, numeric, text, uuid, jsonb);
DROP FUNCTION IF EXISTS create_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb);

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
  IF p_currency NOT IN (v_foreign, 'TWD') THEN
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

  -- Creator's own split is auto-approved; everyone else's starts pending.
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
REVOKE EXECUTE ON FUNCTION create_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) TO authenticated;

-- update_expense_with_splits
DROP FUNCTION IF EXISTS update_expense_with_splits(uuid, text, numeric, text, uuid, jsonb);
DROP FUNCTION IF EXISTS update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb);

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
  -- amount and currency travel together so the formatter can always render
  -- the amount with its currency
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

  -- No-op edits produce no log entry.
  IF v_old_diff != '{}'::jsonb THEN
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_old.trip_id, auth.uid(), 'expense.updated',
            jsonb_build_object('title', p_title, 'old', v_old_diff, 'new', v_new_diff));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb, text) TO authenticated;

-- update_trip_exchange_rate
CREATE OR REPLACE FUNCTION update_trip_exchange_rate(p_trip_id uuid, p_rate numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old_rate numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF p_rate <= 0 THEN RAISE EXCEPTION 'INVALID_RATE'; END IF;

  SELECT exchange_rate INTO v_old_rate FROM trips WHERE id = p_trip_id;
  IF v_old_rate = p_rate THEN RETURN; END IF;

  UPDATE trips SET exchange_rate = p_rate WHERE id = p_trip_id;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (p_trip_id, auth.uid(), 'trip.rate_updated',
          jsonb_build_object('old_rate', v_old_rate, 'new_rate', p_rate));
END;
$$;
REVOKE EXECUTE ON FUNCTION update_trip_exchange_rate FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_trip_exchange_rate TO authenticated;

-- delete_expense
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

-- approve_expense: returns the expense_id IFF this call made it fully approved.
DROP FUNCTION IF EXISTS approve_expense(uuid);
CREATE OR REPLACE FUNCTION approve_expense(p_expense_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed int;
  v_all_approved boolean;
  v_expense expenses%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM expense_splits WHERE expense_id = p_expense_id AND approval_status = 'rejected') THEN
    RAISE EXCEPTION 'EXPENSE_REJECTED';
  END IF;

  UPDATE expense_splits SET approval_status = 'approved'
  WHERE expense_id = p_expense_id AND user_id = auth.uid() AND approval_status <> 'approved';
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed = 0 THEN RETURN NULL; END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
  -- A settlement's only split is the receiver, so this approval IS the
  -- confirmation. paid_by is the debtor who recorded it.
  IF v_expense.kind = 'settlement' THEN
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_expense.trip_id, auth.uid(), 'settlement.confirmed',
            jsonb_build_object('amount', v_expense.amount, 'currency', v_expense.currency,
                               'from_user', v_expense.paid_by));
  ELSE
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_expense.trip_id, auth.uid(), 'expense.approved',
            jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount,
                               'currency', v_expense.currency));
  END IF;

  SELECT bool_and(approval_status = 'approved') INTO v_all_approved
  FROM expense_splits WHERE expense_id = p_expense_id;

  IF v_all_approved THEN RETURN p_expense_id; END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION approve_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION approve_expense(uuid) TO authenticated;

-- reject_expense: returns true only when this call flipped it to rejected.
DROP FUNCTION IF EXISTS reject_expense(uuid);
CREATE OR REPLACE FUNCTION reject_expense(p_expense_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed int;
  v_expense expenses%ROWTYPE;
BEGIN
  UPDATE expense_splits SET approval_status = 'rejected'
  WHERE expense_id = p_expense_id AND user_id = auth.uid() AND approval_status <> 'rejected';
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed = 0 THEN RETURN false; END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
  IF v_expense.kind = 'settlement' THEN
    -- paid_by is the debtor who recorded the settlement.
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_expense.trip_id, auth.uid(), 'settlement.rejected',
            jsonb_build_object('amount', v_expense.amount, 'currency', v_expense.currency,
                               'from_user', v_expense.paid_by));
  ELSE
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_expense.trip_id, auth.uid(), 'expense.rejected',
            jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount,
                               'currency', v_expense.currency));
  END IF;

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION reject_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION reject_expense(uuid) TO authenticated;

-- approve_all_pending: returns expense_ids that became fully approved this call.
DROP FUNCTION IF EXISTS approve_all_pending();
CREATE OR REPLACE FUNCTION approve_all_pending()
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed uuid[];
BEGIN
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
  SELECT array_agg(DISTINCT expense_id) INTO v_changed FROM changed;

  IF v_changed IS NULL THEN RETURN; END IF;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  SELECT e.trip_id, auth.uid(),
         CASE WHEN e.kind = 'settlement' THEN 'settlement.confirmed' ELSE 'expense.approved' END,
         CASE WHEN e.kind = 'settlement'
              THEN jsonb_build_object('amount', e.amount, 'currency', e.currency, 'from_user', e.paid_by)
              ELSE jsonb_build_object('title', e.title, 'amount', e.amount, 'currency', e.currency)
         END
  FROM expenses e
  WHERE e.id = ANY(v_changed);

  RETURN QUERY
  SELECT c.expense_id FROM unnest(v_changed) AS c(expense_id)
  WHERE (SELECT bool_and(approval_status = 'approved')
         FROM expense_splits WHERE expense_id = c.expense_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION approve_all_pending() FROM public, anon;
GRANT  EXECUTE ON FUNCTION approve_all_pending() TO authenticated;

-- create_settlement (kept in sync with supabase/migrations/0015_settlements.sql)
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
