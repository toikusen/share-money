-- supabase/migrations/0010_push_notifications.sql
-- Web Push: store per-device subscriptions; change approval RPCs to report
-- what actually changed so notifications fire exactly once.

-- ============================================================
-- push_subscriptions
-- ============================================================
CREATE TABLE push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Owner self-management. Normal subscription writes go through service role
-- (so a re-used endpoint can be reassigned across accounts); these policies
-- exist for owner reads and the off-switch.
CREATE POLICY "push_subscriptions_select" ON push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_subscriptions_insert" ON push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subscriptions_update" ON push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subscriptions_delete" ON push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- Approval RPCs: change return types (must DROP first)
-- ============================================================
DROP FUNCTION IF EXISTS approve_expense(uuid);
DROP FUNCTION IF EXISTS approve_all_pending();
DROP FUNCTION IF EXISTS reject_expense(uuid);

-- approve_expense: returns the expense_id IFF this call made it fully approved.
CREATE OR REPLACE FUNCTION approve_expense(p_expense_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed int;
  v_all_approved boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM expense_splits WHERE expense_id = p_expense_id AND approval_status = 'rejected') THEN
    RAISE EXCEPTION 'EXPENSE_REJECTED';
  END IF;

  UPDATE expense_splits SET approval_status = 'approved'
  WHERE expense_id = p_expense_id AND user_id = auth.uid() AND approval_status <> 'approved';
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed = 0 THEN RETURN NULL; END IF;

  SELECT bool_and(approval_status = 'approved') INTO v_all_approved
  FROM expense_splits WHERE expense_id = p_expense_id;

  IF v_all_approved THEN RETURN p_expense_id; END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION approve_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION approve_expense(uuid) TO authenticated;

-- approve_all_pending: returns expense_ids that became fully approved this call.
CREATE OR REPLACE FUNCTION approve_all_pending()
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
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
  SELECT c.expense_id FROM (SELECT DISTINCT expense_id FROM changed) c
  WHERE (SELECT bool_and(approval_status = 'approved')
         FROM expense_splits WHERE expense_id = c.expense_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION approve_all_pending() FROM public, anon;
GRANT  EXECUTE ON FUNCTION approve_all_pending() TO authenticated;

-- reject_expense: returns true only when this call flipped it to rejected.
CREATE OR REPLACE FUNCTION reject_expense(p_expense_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_changed int;
BEGIN
  UPDATE expense_splits SET approval_status = 'rejected'
  WHERE expense_id = p_expense_id AND user_id = auth.uid() AND approval_status <> 'rejected';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed > 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION reject_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION reject_expense(uuid) TO authenticated;
