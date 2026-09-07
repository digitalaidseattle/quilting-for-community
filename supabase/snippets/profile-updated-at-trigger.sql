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

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();
