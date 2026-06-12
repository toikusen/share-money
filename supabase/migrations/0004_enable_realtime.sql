-- Enable Realtime change events so trip members see each other's updates live.
-- INSERT/UPDATE payloads are filtered by the existing SELECT RLS policies;
-- DELETE events only carry the primary key (default replica identity).

ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_members;
