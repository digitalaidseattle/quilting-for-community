-- Profile lifecycle flag. Admin-managed; flipped to 'inactive' automatically
-- when a profile loses its auth link (FK `on delete set null` fires an UPDATE
-- on profiles when the auth user is deleted).

begin;

alter table public.profiles
  add column status text not null default 'active';

alter table public.profiles
  add constraint profiles_status_check check (status in ('active', 'inactive'));

create index profiles_status_idx on public.profiles(status);

comment on column public.profiles.status is
  'Admin-managed lifecycle flag; set to inactive automatically when the profile loses its auth link.';

-- status is admin-managed, but column grants on profiles are table-wide and
-- profiles_update_own lets a member update their own row, so the guard against
-- a member re-enabling themselves lives in set_profile_updated_at() below.
grant update (status) on public.profiles to authenticated;

-- Replaces the version from 20260822120000_rename_uid_to_auth_id.sql: same
-- created_at/created_by pinning and email revert guard, plus status handling.
create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor text := coalesce(auth.jwt()->>'email', auth.uid()::text);
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;

  if old.auth_id is not null
    and coalesce(current_setting('app.profiles_email_sync', true), '') <> 'true' then
    new.email := old.email;
  end if;

  -- losing the auth link (FK `on delete set null` when the auth user is
  -- deleted) deactivates the profile; otherwise status is admin-only, so
  -- silently revert a member's self-edit the same way email is reverted above.
  if old.auth_id is not null and new.auth_id is null then
    new.status := 'inactive';
  elsif new.status is distinct from old.status
    and auth.uid() is not null
    and not public.is_admin() then
    new.status := old.status;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(actor, new.updated_by, old.updated_by);
  return new;
end;
$$;

commit;
