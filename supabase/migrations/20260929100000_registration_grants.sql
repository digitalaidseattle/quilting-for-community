-- Depending on its version, Supabase grants anon and authenticated full access
-- to every new table and function in public by default. The registrations
-- migration (20260906160000) meant guests to reach registrations only through
-- its RPCs. RLS already hid the rows from anon. This removes the grants too.

revoke all on public.event_registrations from public, anon;
revoke execute on function public.my_registrations() from anon;
