-- Avoid recursive RLS checks by moving membership lookups into SECURITY DEFINER
-- helpers owned by the migration role.

CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members
    WHERE trip_id = p_trip_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_expense_member(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    JOIN public.trip_members tm ON tm.trip_id = e.trip_id
    WHERE e.id = p_expense_id
      AND tm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_trip_member(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_expense_member(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_expense_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "trips_select" ON public.trips;
CREATE POLICY "trips_select" ON public.trips FOR SELECT TO authenticated
  USING (public.is_trip_member(id));

DROP POLICY IF EXISTS "trip_members_select" ON public.trip_members;
CREATE POLICY "trip_members_select" ON public.trip_members FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS "expense_splits_select" ON public.expense_splits;
CREATE POLICY "expense_splits_select" ON public.expense_splits FOR SELECT TO authenticated
  USING (public.is_expense_member(expense_id));
