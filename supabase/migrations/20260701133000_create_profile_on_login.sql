-- QUIL-60: Backfill a missing profile row when an existing auth user successfully signs in.
-- Supabase updates auth.users.last_sign_in_at after successful login, so include that
-- column in the auth-user update trigger. Login-only updates should insert missing
-- profiles but should not modify existing profile rows or profile audit timestamps.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_login_only_update boolean := false;
begin
  if tg_op = 'UPDATE' then
    is_login_only_update := old.email is not distinct from new.email
      and old.raw_user_meta_data is not distinct from new.raw_user_meta_data;
  end if;

  insert into public.profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    roles,
    created_by,
    updated_by
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(trim(concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')), ''),
      new.email
    ),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    array(
      select jsonb_array_elements_text(
        case
          when jsonb_typeof(coalesce(new.raw_user_meta_data, '{}'::jsonb)->'roles') = 'array'
            then coalesce(new.raw_user_meta_data, '{}'::jsonb)->'roles'
          else '[]'::jsonb
        end
      )
    ),
    new.email,
    new.email
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    roles = case
      when coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'roles'
        and jsonb_typeof(new.raw_user_meta_data->'roles') = 'array'
        then excluded.roles
      else public.profiles.roles
    end,
    updated_at = now(),
    updated_by = excluded.updated_by
  where not is_login_only_update;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_updated
after update of email, raw_user_meta_data, last_sign_in_at on auth.users
for each row
when (
  old.email is distinct from new.email
  or old.raw_user_meta_data is distinct from new.raw_user_meta_data
  or old.last_sign_in_at is distinct from new.last_sign_in_at
)
execute function public.handle_new_user();

commit;
