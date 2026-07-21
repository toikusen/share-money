-- Keep the authenticated app's first screen to indexed, minimal queries.

-- The ledger list filters memberships by user_id. The primary key starts with
-- trip_id, so it cannot efficiently serve this lookup as the table grows.
CREATE INDEX IF NOT EXISTS trip_members_user_id_idx
  ON public.trip_members (user_id);

-- Supports the rejection exclusion in get_pending_review_count without
-- scanning every split belonging to an expense.
CREATE INDEX IF NOT EXISTS expense_splits_expense_status_idx
  ON public.expense_splits (expense_id, approval_status);

-- The home-page badge needs only a count. Avoid transferring the full expense,
-- trip, payer, and all sibling split rows used by the review detail screen.
CREATE OR REPLACE FUNCTION public.get_pending_review_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM expense_splits AS mine
  WHERE mine.user_id = auth.uid()
    AND mine.approval_status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM expense_splits AS sibling
      WHERE sibling.expense_id = mine.expense_id
        AND sibling.approval_status = 'rejected'
    );
$$;

REVOKE ALL ON FUNCTION public.get_pending_review_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_review_count() TO authenticated;
