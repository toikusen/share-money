-- supabase/migrations/0018_lock_confirmed_settlements.sql
-- A settlement the receiver has confirmed is a two-party agreed record:
-- deleting it would silently rewrite the trip's money history. Block it.
-- Pending / rejected settlements stay deletable — that is the documented
-- correction path (settlements are not editable; delete and re-record).

-- ============================================================
-- delete_expense — 0015's version, with ONLY one addition: raise
-- SETTLEMENT_CONFIRMED when the settlement's split is already approved.
-- (kept in sync with supabase/functions/expense_helpers.sql)
-- ============================================================

CREATE OR REPLACE FUNCTION delete_expense(p_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
  v_to_user uuid;
BEGIN
  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
  -- Already gone (double-click, stale tab): deleting is idempotent.
  IF v_expense.id IS NULL THEN RETURN; END IF;
  -- Only the expense creator may delete (mirrors expenses_delete RLS policy)
  IF v_expense.created_by <> auth.uid() THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;

  IF v_expense.kind = 'settlement' THEN
    -- A confirmed settlement is immutable history: no delete after the
    -- receiver approved it.
    IF EXISTS (
      SELECT 1 FROM expense_splits
      WHERE expense_id = p_expense_id AND approval_status = 'approved'
    ) THEN RAISE EXCEPTION 'SETTLEMENT_CONFIRMED'; END IF;

    -- A settlement has exactly one split: the receiver. Fetch before delete
    -- so the log can say who the money was going to.
    SELECT user_id INTO v_to_user FROM expense_splits WHERE expense_id = p_expense_id LIMIT 1;
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_expense.trip_id, auth.uid(), 'settlement.deleted',
            jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount,
                               'currency', v_expense.currency, 'to_user', v_to_user));
  ELSE
    INSERT INTO activity_logs (trip_id, actor_id, action, details)
    VALUES (v_expense.trip_id, auth.uid(), 'expense.deleted',
            jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount, 'currency', v_expense.currency));
  END IF;

  DELETE FROM expenses WHERE id = p_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION delete_expense(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION delete_expense(uuid) TO authenticated;

-- The app deletes via the RPC above, but the 0001 RLS policy also allows the
-- creator to DELETE directly through PostgREST. Close that path too.
DROP POLICY "expenses_delete" ON expenses;
CREATE POLICY "expenses_delete" ON expenses FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    AND NOT (
      kind = 'settlement'
      AND EXISTS (
        SELECT 1 FROM expense_splits
        WHERE expense_splits.expense_id = expenses.id
          AND expense_splits.approval_status = 'approved'
      )
    )
  );
