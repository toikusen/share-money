-- Payment accounts RPC/RLS smoke test. Run ONLY against a local/dev database.
--
-- How to run (same as settlement_smoke.sql):
--   supabase start && supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/payment_accounts_smoke.sql
-- Expected output: NOTICE "payment accounts smoke: ALL PASS" and ROLLBACK.

BEGIN;

-- alice + bob share a trip; carol is a non-member
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'alice@smoke.test'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@smoke.test'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@smoke.test');

INSERT INTO trips (id, name, created_by, exchange_rate, foreign_currency) VALUES
  ('d0000000-0000-4000-8000-000000000010', 'smoke trip',
   'a0000000-0000-4000-8000-000000000001', 0.22, 'JPY');
INSERT INTO trip_members (trip_id, user_id) VALUES
  ('d0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000002');

-- act as bob: save his receiving account (direct upsert under RLS)
SELECT set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

INSERT INTO payment_accounts (user_id, bank_code, account_number, account_holder)
VALUES ('b0000000-0000-4000-8000-000000000002', '812', '12345678901234', '王小明');

-- 1. bob cannot insert a row for someone else
DO $$
BEGIN
  BEGIN
    INSERT INTO payment_accounts (user_id, bank_code, account_number)
    VALUES ('a0000000-0000-4000-8000-000000000001', '808', '123456789');
    RAISE EXCEPTION 'FAIL: inserted account for another user';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL; -- expected: RLS WITH CHECK rejects it
  END;
END $$;

-- act as alice (trip member): RPC returns bob's account
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 2. member sees co-member's account via RPC
DO $$
DECLARE v_count int; v_number text;
BEGIN
  SELECT count(*), max(t.account_number) INTO v_count, v_number
  FROM get_trip_payment_accounts('d0000000-0000-4000-8000-000000000010') t
  WHERE t.user_id = 'b0000000-0000-4000-8000-000000000002';
  IF v_count <> 1 OR v_number <> '12345678901234' THEN
    RAISE EXCEPTION 'FAIL: member RPC read, count=% number=%', v_count, v_number;
  END IF;
END $$;

-- 3. direct SELECT by a non-owner returns nothing (RLS)
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM payment_accounts
  WHERE user_id = 'b0000000-0000-4000-8000-000000000002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: non-owner direct SELECT saw % rows', v_count;
  END IF;
END $$;

-- act as carol (non-member): RPC must refuse
SELECT set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

-- 4. non-member gets NOT_MEMBER
DO $$
BEGIN
  BEGIN
    PERFORM * FROM get_trip_payment_accounts('d0000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'FAIL: non-member RPC call succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'NOT_MEMBER' THEN
      RAISE EXCEPTION 'FAIL: expected NOT_MEMBER, got %', SQLERRM;
    END IF;
  END;
END $$;

-- 5. format constraints reject bad input (as bob)
SELECT set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    UPDATE payment_accounts SET bank_code = '81a'
    WHERE user_id = 'b0000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'FAIL: non-numeric bank_code accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE payment_accounts SET account_number = '12345'
    WHERE user_id = 'b0000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'FAIL: 5-digit account_number accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'payment accounts smoke: ALL PASS'; END $$;

ROLLBACK;
