-- Allow switching a trip's foreign currency + rate, but ONLY before any expense
-- exists (expense amounts are stored in their original currency, so changing the
-- currency after the fact would misinterpret them). Enforced server-side here.
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

  IF p_foreign_currency NOT IN ('JPY','KRW','VND','USD','HKD','CNY','EUR','THB','GBP') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY';
  END IF;
  IF p_rate <= 0 THEN RAISE EXCEPTION 'INVALID_RATE'; END IF;

  UPDATE trips
  SET foreign_currency = p_foreign_currency, exchange_rate = p_rate
  WHERE id = p_trip_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_trip_currency(uuid, text, numeric) FROM public, anon;
GRANT  EXECUTE ON FUNCTION update_trip_currency(uuid, text, numeric) TO authenticated;
