-- Ledger-types (0019/0020) smoke test. Run ONLY against a local/dev database, never prod
-- (wrapped in BEGIN..ROLLBACK, but don't tempt fate).
--
-- How to run:
--   supabase start
--   supabase db reset      # applies all migrations
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ledger_types_smoke.sql
-- Expected output: NOTICE "ledger types smoke: ALL PASS" and ROLLBACK.

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'alice@smoke.test');
-- handle_new_user trigger creates the profiles row.

-- act as alice
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. legacy-shaped insert (no type) defaults to 'travel'
DO $$
DECLARE v_type text;
BEGIN
  INSERT INTO trips (id, name, created_by, exchange_rate, foreign_currency) VALUES
    ('d0000000-0000-4000-8000-000000000010', 'legacy trip',
     'a0000000-0000-4000-8000-000000000001', 0.22, 'JPY');
  SELECT type INTO v_type FROM trips WHERE id = 'd0000000-0000-4000-8000-000000000010';
  IF v_type <> 'travel' THEN RAISE EXCEPTION 'FAIL: default type = %', v_type; END IF;
END $$;

-- 2. all six types pass the CHECK
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['travel','club','company','dining','household','other'] LOOP
    INSERT INTO trips (name, created_by, type)
    VALUES ('type ' || v, 'a0000000-0000-4000-8000-000000000001', v);
  END LOOP;
END $$;

-- 3. unknown type rejected
DO $$ BEGIN
  INSERT INTO trips (name, created_by, type)
  VALUES ('bad type', 'a0000000-0000-4000-8000-000000000001', 'party');
  RAISE EXCEPTION 'FAIL: unknown type accepted';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 4. half-configured FX pair rejected (currency without rate, rate without currency)
DO $$ BEGIN
  INSERT INTO trips (name, created_by, foreign_currency)
  VALUES ('half pair a', 'a0000000-0000-4000-8000-000000000001', 'JPY');
  RAISE EXCEPTION 'FAIL: currency without rate accepted';
EXCEPTION WHEN check_violation THEN NULL;
END $$;
DO $$ BEGIN
  INSERT INTO trips (name, created_by, exchange_rate)
  VALUES ('half pair b', 'a0000000-0000-4000-8000-000000000001', 0.22);
  RAISE EXCEPTION 'FAIL: rate without currency accepted';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

CREATE TEMP TABLE smoke_ids (twd_trip_id uuid);

-- 5. create_trip RPC: pure-TWD dining ledger (null currency pair, single day)
DO $$
DECLARE v_id uuid; v_trip trips%ROWTYPE;
BEGIN
  v_id := create_trip('smoke dining', NULL, '2026-06-20', '2026-06-20', NULL, 'dining');
  INSERT INTO smoke_ids VALUES (v_id);

  SELECT * INTO v_trip FROM trips WHERE id = v_id;
  IF v_trip.type <> 'dining' THEN RAISE EXCEPTION 'FAIL: rpc type = %', v_trip.type; END IF;
  IF v_trip.foreign_currency IS NOT NULL OR v_trip.exchange_rate IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: pure-TWD trip has FX values';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = v_id) THEN
    RAISE EXCEPTION 'FAIL: creator not a member';
  END IF;
END $$;

-- 6. pure-TWD trip: TWD expense OK, foreign currency rejected
DO $$
DECLARE v_trip uuid; v_id uuid;
BEGIN
  SELECT twd_trip_id INTO v_trip FROM smoke_ids;
  v_id := create_expense_with_splits(v_trip, 'hot pot', 300, 'TWD',
    'a0000000-0000-4000-8000-000000000001', now(),
    '[{"user_id":"a0000000-0000-4000-8000-000000000001","amount":300}]'::jsonb);
  IF v_id IS NULL THEN RAISE EXCEPTION 'FAIL: TWD expense rejected'; END IF;
END $$;
DO $$
DECLARE v_trip uuid;
BEGIN
  SELECT twd_trip_id INTO v_trip FROM smoke_ids;
  PERFORM create_expense_with_splits(v_trip, 'sushi', 300, 'JPY',
    'a0000000-0000-4000-8000-000000000001', now(),
    '[{"user_id":"a0000000-0000-4000-8000-000000000001","amount":300}]'::jsonb);
  RAISE EXCEPTION 'FAIL: JPY accepted in pure-TWD trip';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%INVALID_CURRENCY%' THEN RAISE; END IF;
END $$;

-- 7. update_trip_exchange_rate on pure-TWD trip → NO_FOREIGN_CURRENCY (0020)
DO $$
DECLARE v_trip uuid;
BEGIN
  SELECT twd_trip_id INTO v_trip FROM smoke_ids;
  PERFORM update_trip_exchange_rate(v_trip, 0.25);
  RAISE EXCEPTION 'FAIL: rate update accepted on pure-TWD trip';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%NO_FOREIGN_CURRENCY%' THEN RAISE; END IF;
END $$;

-- 8. update_trip_currency: null/null turns FX off (no expenses yet); half pair rejected
DO $$
DECLARE v_id uuid; v_trip trips%ROWTYPE;
BEGIN
  v_id := create_trip('smoke travel', 0.22, NULL, NULL, 'JPY', 'travel');

  PERFORM update_trip_currency(v_id, NULL, NULL);
  SELECT * INTO v_trip FROM trips WHERE id = v_id;
  IF v_trip.foreign_currency IS NOT NULL OR v_trip.exchange_rate IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: FX not turned off';
  END IF;

  BEGIN
    PERFORM update_trip_currency(v_id, 'JPY', NULL);
    RAISE EXCEPTION 'FAIL: half pair accepted by update_trip_currency';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%CURRENCY_RATE_MISMATCH%' THEN RAISE; END IF;
  END;
END $$;

-- 9. update_trip_currency refuses once expenses exist — this HAS_EXPENSES guard
--    is why update_trip_exchange_rate deliberately can't turn FX off (0020).
--    The dining trip gained an expense in section 6.
DO $$
DECLARE v_trip uuid;
BEGIN
  SELECT twd_trip_id INTO v_trip FROM smoke_ids;
  PERFORM update_trip_currency(v_trip, NULL, NULL);
  RAISE EXCEPTION 'FAIL: FX toggled on a trip with expenses';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%HAS_EXPENSES%' THEN RAISE; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ledger types smoke: ALL PASS'; END $$;

ROLLBACK;
