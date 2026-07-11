-- Settlement RPC smoke test. Run ONLY against a local/dev database, never prod
-- (wrapped in BEGIN..ROLLBACK, but don't tempt fate).
--
-- How to run (repo has no supabase local config yet):
--   supabase init          # once; creates supabase/config.toml
--   supabase start
--   supabase db reset      # applies all migrations
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/settlement_smoke.sql
-- Expected output: NOTICE "settlement smoke: ALL PASS" and ROLLBACK.

BEGIN;

-- Fixed UUIDs so DO-blocks (no psql var interpolation) can reference them.
-- alice = a0..01 (payer), bob = b0..02 (receiver), carol = c0..03 (non-member)
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'alice@smoke.test'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@smoke.test'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@smoke.test');
-- handle_new_user trigger creates matching profiles rows.

INSERT INTO trips (id, name, created_by, exchange_rate, foreign_currency) VALUES
  ('d0000000-0000-4000-8000-000000000010', 'smoke trip',
   'a0000000-0000-4000-8000-000000000001', 0.22, 'JPY');
INSERT INTO trip_members (trip_id, user_id) VALUES
  ('d0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000002');

CREATE TEMP TABLE smoke_ids (settlement_id uuid);

-- act as alice
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. happy path: kind, single pending split, activity log
DO $$
DECLARE v_id uuid; v_kind text; v_status text; v_count int;
BEGIN
  v_id := create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 500, 'TWD', now());
  INSERT INTO smoke_ids VALUES (v_id);

  SELECT kind INTO v_kind FROM expenses WHERE id = v_id;
  IF v_kind <> 'settlement' THEN RAISE EXCEPTION 'FAIL: kind = %', v_kind; END IF;

  SELECT count(*) INTO v_count FROM expense_splits WHERE expense_id = v_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: % splits, want 1', v_count; END IF;

  SELECT approval_status INTO v_status FROM expense_splits WHERE expense_id = v_id;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'FAIL: split status = %', v_status; END IF;

  SELECT count(*) INTO v_count FROM activity_logs
  WHERE action = 'settlement.created'
    AND details->>'to_user' = 'b0000000-0000-4000-8000-000000000002';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: settlement.created log missing'; END IF;
END $$;

-- 2. cannot settle with yourself
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'a0000000-0000-4000-8000-000000000001', 100, 'TWD', now());
  -- Sentinel must NOT contain the expected code, or a broken guard would
  -- pass vacuously (sentinel caught below and matched by the LIKE).
  RAISE EXCEPTION 'FAIL: no error raised (settle-self case)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%SETTLE_SELF%' THEN RAISE; END IF;
END $$;

-- 3. NaN amount rejected (numeric accepts NaN and NaN > 0 is true in PG!)
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 'NaN'::numeric, 'TWD', now());
  RAISE EXCEPTION 'FAIL: no error raised (NaN amount case)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%INVALID_AMOUNT%' THEN RAISE; END IF;
END $$;

-- 4. non-positive amount rejected
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 0, 'TWD', now());
  RAISE EXCEPTION 'FAIL: no error raised (zero amount case)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%INVALID_AMOUNT%' THEN RAISE; END IF;
END $$;

-- 5. currency must be trip foreign currency or TWD
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 100, 'USD', now());
  RAISE EXCEPTION 'FAIL: no error raised (wrong currency case)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%INVALID_CURRENCY%' THEN RAISE; END IF;
END $$;

-- 6. zero-decimal currency must be integer
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 100.5, 'JPY', now());
  RAISE EXCEPTION 'FAIL: no error raised (non-integer JPY case)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%SPLIT_NOT_INTEGER%' THEN RAISE; END IF;
END $$;

-- 7. settlements are not editable via update_expense_with_splits
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT settlement_id INTO v_id FROM smoke_ids;
  PERFORM update_expense_with_splits(v_id, 'hacked', 999, 'TWD',
    'a0000000-0000-4000-8000-000000000001', now(),
    '[{"user_id":"b0000000-0000-4000-8000-000000000002","amount":999}]'::jsonb);
  RAISE EXCEPTION 'FAIL: no error raised (edit settlement case)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%SETTLEMENT_NOT_EDITABLE%' THEN RAISE; END IF;
END $$;

-- 8. non-member cannot create (act as carol)
SELECT set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$ BEGIN
  PERFORM create_settlement('d0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000002', 100, 'TWD', now());
  RAISE EXCEPTION 'FAIL: no error raised (non-member case)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%NOT_MEMBER%' THEN RAISE; END IF;
END $$;

-- 9. receiver approves via existing approve_expense
SELECT set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $$
DECLARE v_id uuid; v_status text;
BEGIN
  SELECT settlement_id INTO v_id FROM smoke_ids;
  PERFORM approve_expense(v_id);
  SELECT approval_status INTO v_status FROM expense_splits WHERE expense_id = v_id;
  IF v_status <> 'approved' THEN RAISE EXCEPTION 'FAIL: approve status = %', v_status; END IF;
END $$;

-- 10. creator deletes: settlement.deleted log with to_user
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE v_id uuid; v_count int;
BEGIN
  SELECT settlement_id INTO v_id FROM smoke_ids;
  PERFORM delete_expense(v_id);
  SELECT count(*) INTO v_count FROM activity_logs
  WHERE action = 'settlement.deleted'
    AND details->>'to_user' = 'b0000000-0000-4000-8000-000000000002'
    AND (details->>'amount')::numeric = 500;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: settlement.deleted log wrong'; END IF;
  IF EXISTS (SELECT 1 FROM expenses WHERE id = v_id) THEN
    RAISE EXCEPTION 'FAIL: expense row still exists';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'settlement smoke: ALL PASS'; END $$;

ROLLBACK;
