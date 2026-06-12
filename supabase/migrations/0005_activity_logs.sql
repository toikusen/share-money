-- supabase/migrations/0005_activity_logs.sql
-- Activity feed: one row per logical user operation, written only inside
-- SECURITY DEFINER RPCs (no INSERT policy → clients cannot forge entries).

-- ============================================================
-- TABLE
-- ============================================================

CREATE TABLE activity_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES profiles(id),
  action     text NOT NULL CHECK (action IN (
    'trip.created', 'trip.rate_updated', 'member.joined',
    'expense.created', 'expense.updated', 'expense.deleted'
  )),
  details    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX activity_logs_trip_created_idx
  ON activity_logs (trip_id, created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select" ON activity_logs FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

-- ============================================================
-- TRIP / MEMBER RPCs (redefined with logging)
-- ============================================================

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

-- ============================================================
-- EXPENSE RPCs (redefined with logging)
-- ============================================================

CREATE OR REPLACE FUNCTION create_expense_with_splits(
  p_trip_id  uuid,
  p_title    text,
  p_amount   numeric,
  p_currency text,
  p_paid_by  uuid,
  p_paid_at  timestamptz,
  p_splits   jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid;
  v_split      jsonb;
  v_split_sum  numeric := 0;
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

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = p_trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency = 'JPY' AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'JPY_SPLIT_NOT_INTEGER';
    END IF;
  END LOOP;

  IF v_split_sum != p_amount THEN RAISE EXCEPTION 'SPLIT_SUM_MISMATCH'; END IF;

  INSERT INTO expenses (trip_id, title, amount, currency, paid_by, paid_at, created_by)
  VALUES (p_trip_id, p_title, p_amount, p_currency, p_paid_by, p_paid_at, auth.uid())
  RETURNING id INTO v_expense_id;

  INSERT INTO expense_splits (expense_id, user_id, amount)
  SELECT v_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric
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
  p_splits     jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old        expenses%ROWTYPE;
  v_split      jsonb;
  v_split_sum  numeric := 0;
  v_old_splits jsonb;
  v_new_splits jsonb;
  v_old_diff   jsonb := '{}'::jsonb;
  v_new_diff   jsonb := '{}'::jsonb;
BEGIN
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'PAID_AT_REQUIRED';
  END IF;

  -- Only the expense creator may edit (mirrors expenses_delete RLS policy)
  SELECT * INTO v_old FROM expenses
  WHERE id = p_expense_id AND created_by = auth.uid();
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;

  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = v_old.trip_id AND user_id = p_paid_by) THEN
    RAISE EXCEPTION 'PAID_BY_NOT_MEMBER';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = v_old.trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency = 'JPY' AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'JPY_SPLIT_NOT_INTEGER';
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
  IF v_old_splits IS DISTINCT FROM v_new_splits THEN
    v_old_diff := v_old_diff || jsonb_build_object('splits', v_old_splits);
    v_new_diff := v_new_diff || jsonb_build_object('splits', v_new_splits);
  END IF;

  UPDATE expenses
  SET title = p_title, amount = p_amount, currency = p_currency, paid_by = p_paid_by, paid_at = p_paid_at
  WHERE id = p_expense_id;

  DELETE FROM expense_splits WHERE expense_id = p_expense_id;
  INSERT INTO expense_splits (expense_id, user_id, amount)
  SELECT p_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric
  FROM jsonb_array_elements(p_splits) s;

  -- No-op edits produce no log entry.
  IF v_old_diff != '{}'::jsonb THEN
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_old.trip_id, auth.uid(), 'expense.updated',
            jsonb_build_object('title', p_title, 'old', v_old_diff, 'new', v_new_diff));
  END IF;
END;
$$;

-- ============================================================
-- NEW: delete_expense (replaces direct table delete in the action layer)
-- ============================================================

CREATE OR REPLACE FUNCTION delete_expense(p_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_expense expenses%ROWTYPE;
BEGIN
  -- Only the expense creator may delete (mirrors expenses_delete RLS policy)
  SELECT * INTO v_expense FROM expenses
  WHERE id = p_expense_id AND created_by = auth.uid();
  IF v_expense.id IS NULL THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (v_expense.trip_id, auth.uid(), 'expense.deleted',
          jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount, 'currency', v_expense.currency));

  DELETE FROM expenses WHERE id = p_expense_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION delete_expense(uuid) TO authenticated;
