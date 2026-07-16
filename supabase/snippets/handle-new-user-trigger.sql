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
      and old.raw_user_meta_data is not distinct from new.raw_user_meta_data
      and old.raw_app_meta_data is not distinct from new.raw_app_meta_data;
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
    public.profile_roles_from_jsonb(new.raw_app_meta_data),
    new.email,
    new.email
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    roles = excluded.roles,
    updated_at = now(),
    updated_by = excluded.updated_by
  where not is_login_only_update;

  return new;
end;
$$;
