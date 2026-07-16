-- supabase/migrations/0020_rate_update_requires_currency.sql
-- update_trip_exchange_rate on a pure-TWD ledger (foreign_currency IS NULL)
-- would trip the currency_rate_pair constraint (0019) with an opaque error.
-- Guard it explicitly. Turning FX on/off is update_trip_currency's job — it
-- enforces HAS_EXPENSES so foreign-denominated amounts can't be reinterpreted;
-- this RPC deliberately does NOT accept null as "turn FX off".
-- Body is 0005's version verbatim plus the NO_FOREIGN_CURRENCY guard.

CREATE OR REPLACE FUNCTION update_trip_exchange_rate(p_trip_id uuid, p_rate numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_rate numeric;
  v_foreign  text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN RAISE EXCEPTION 'INVALID_RATE'; END IF;

  SELECT exchange_rate, foreign_currency INTO v_old_rate, v_foreign
  FROM trips WHERE id = p_trip_id;
  IF v_foreign IS NULL THEN RAISE EXCEPTION 'NO_FOREIGN_CURRENCY'; END IF;
  IF v_old_rate = p_rate THEN RETURN; END IF;

  UPDATE trips SET exchange_rate = p_rate WHERE id = p_trip_id;

  INSERT INTO activity_logs (trip_id, actor_id, action, details)
  VALUES (p_trip_id, auth.uid(), 'trip.rate_updated',
          jsonb_build_object('old_rate', v_old_rate, 'new_rate', p_rate));
END;
$$;
