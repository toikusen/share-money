-- supabase/functions/expense_helpers.sql

-- create_trip
CREATE OR REPLACE FUNCTION create_trip(p_name text, p_exchange_rate numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_trip_id uuid;
BEGIN
  INSERT INTO trips (name, created_by, exchange_rate)
  VALUES (p_name, auth.uid(), p_exchange_rate)
  RETURNING id INTO v_trip_id;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid());
  RETURN v_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_trip FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_trip TO authenticated;

-- join_trip
CREATE OR REPLACE FUNCTION join_trip(p_invite_token uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_trip_id uuid;
BEGIN
  SELECT id INTO v_trip_id FROM trips WHERE invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;

  INSERT INTO trip_members (trip_id, user_id) VALUES (v_trip_id, auth.uid())
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  RETURN v_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION join_trip FROM public, anon;
GRANT  EXECUTE ON FUNCTION join_trip TO authenticated;

-- create_expense_with_splits
CREATE OR REPLACE FUNCTION create_expense_with_splits(
  p_trip_id  uuid,
  p_title    text,
  p_amount   numeric,
  p_currency text,
  p_paid_by  uuid,
  p_splits   jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_expense_id uuid;
  v_split      jsonb;
  v_split_sum  numeric := 0;
BEGIN
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

  INSERT INTO expenses (trip_id, title, amount, currency, paid_by, created_by)
  VALUES (p_trip_id, p_title, p_amount, p_currency, p_paid_by, auth.uid())
  RETURNING id INTO v_expense_id;

  INSERT INTO expense_splits (expense_id, user_id, amount)
  SELECT v_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric
  FROM jsonb_array_elements(p_splits) s;

  RETURN v_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_expense_with_splits FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_expense_with_splits TO authenticated;

-- update_trip_exchange_rate
CREATE OR REPLACE FUNCTION update_trip_exchange_rate(p_trip_id uuid, p_rate numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF p_rate <= 0 THEN RAISE EXCEPTION 'INVALID_RATE'; END IF;
  UPDATE trips SET exchange_rate = p_rate WHERE id = p_trip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION update_trip_exchange_rate FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_trip_exchange_rate TO authenticated;
