-- supabase/migrations/0017_review_action_logs.sql
-- Log every action taken on the review/notification page — approve, reject,
-- approve-all — so the activity page shows what each member did.
-- expense.approved / expense.rejected mean the actor's OWN split changed,
-- not that the expense reached full approval.

-- activity_logs.action is a closed enum — extend it or the RPCs below
-- violate the constraint on insert.
ALTER TABLE activity_logs DROP CONSTRAINT activity_logs_action_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_action_check
  CHECK (action IN (
    'trip.created', 'trip.rate_updated', 'trip.info_updated', 'member.joined',
    'expense.created', 'expense.updated', 'expense.deleted',
    'expense.approved', 'expense.rejected',
    'settlement.created', 'settlement.deleted', 'settlement.confirmed',
    'settlement.rejected'
  ));

-- ============================================================
-- approve_expense — 0010's version, with ONLY one addition: log the approval
-- (settlement.confirmed for settlements, expense.approved otherwise).
-- (kept in sync with supabase/functions/expense_helpers.sql)
-- ============================================================

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

-- ============================================================
-- approve_all_pending — same return contract as 0010, restructured to collect
-- the changed ids first so every approval can be logged (one row per expense).
-- (kept in sync with supabase/functions/expense_helpers.sql)
-- ============================================================

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

-- ============================================================
-- reject_expense — 0010's version, with ONLY one addition: log the rejection
-- (settlement.rejected for settlements, expense.rejected otherwise).
-- (kept in sync with supabase/functions/expense_helpers.sql)
-- ============================================================

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
