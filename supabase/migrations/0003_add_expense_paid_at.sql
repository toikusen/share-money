-- Add an editable payment time for expenses and use it for chronological lists.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

UPDATE public.expenses
SET paid_at = created_at
WHERE paid_at IS NULL;

ALTER TABLE public.expenses
  ALTER COLUMN paid_at SET DEFAULT now(),
  ALTER COLUMN paid_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS expenses_trip_paid_at_idx
  ON public.expenses (trip_id, paid_at DESC, created_at DESC);

DROP FUNCTION IF EXISTS public.create_expense_with_splits(uuid, text, numeric, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION create_expense_with_splits(
  p_trip_id  uuid,
  p_title    text,
  p_amount   numeric,
  p_currency text,
  p_paid_by  uuid,
  p_paid_at  timestamptz,
  p_splits   jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  RETURN v_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb) FROM public, anon;
GRANT  EXECUTE ON FUNCTION create_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.update_expense_with_splits(uuid, text, numeric, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION update_expense_with_splits(
  p_expense_id uuid,
  p_title      text,
  p_amount     numeric,
  p_currency   text,
  p_paid_by    uuid,
  p_paid_at    timestamptz,
  p_splits     jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trip_id   uuid;
  v_split     jsonb;
  v_split_sum numeric := 0;
BEGIN
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'PAID_AT_REQUIRED';
  END IF;

  SELECT trip_id INTO v_trip_id FROM expenses
  WHERE id = p_expense_id AND created_by = auth.uid();
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;

  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = v_trip_id AND user_id = p_paid_by) THEN
    RAISE EXCEPTION 'PAID_BY_NOT_MEMBER';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = v_trip_id AND user_id = (v_split->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'SPLIT_USER_NOT_MEMBER'; END IF;

    v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

    IF p_currency = 'JPY' AND (v_split->>'amount')::numeric != floor((v_split->>'amount')::numeric) THEN
      RAISE EXCEPTION 'JPY_SPLIT_NOT_INTEGER';
    END IF;
  END LOOP;

  IF v_split_sum != p_amount THEN RAISE EXCEPTION 'SPLIT_SUM_MISMATCH'; END IF;

  UPDATE expenses
  SET title = p_title, amount = p_amount, currency = p_currency, paid_by = p_paid_by, paid_at = p_paid_at
  WHERE id = p_expense_id;

  DELETE FROM expense_splits WHERE expense_id = p_expense_id;
  INSERT INTO expense_splits (expense_id, user_id, amount)
  SELECT p_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric
  FROM jsonb_array_elements(p_splits) s;
END;
$$;
REVOKE EXECUTE ON FUNCTION update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb) FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_expense_with_splits(uuid, text, numeric, text, uuid, timestamptz, jsonb) TO authenticated;
