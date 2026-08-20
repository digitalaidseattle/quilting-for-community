-- rename id -> uid
alter table public.profiles rename column id to uid;

alter table public.profiles 
    -- drop current PK
    drop constraint profiles_pkey,
    -- make uid unique and nullable
    add constraint uq_profiles_uid unique(uid),
    alter column uid drop not null,
    -- drop FK id = auth.users(id)
    drop constraint profiles_id_fkey,
    -- add FK uid = auth.users(id)
    add foreign key (uid) references auth.users(id) on delete set null,
    -- new id column for PK
    add column id uuid default gen_random_uuid() primary key;

-- create index on email
create index if not exists idx_profiles_email on public.profiles(email);

-- table level permissions
grant select, insert, update, delete on public.profiles to service_role, authenticated;

-- RLS

-- leveraging is_admin function from 20260619160629_initial_schema.sql
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

create policy "profiles_non_admin_read" on public.profiles
  for select 
  to authenticated
  using (true);

create policy "profiles_non_admin_self_update" on public.profiles
  for update
  to authenticated
  using ( uid = auth.uid() ) with check ( uid = auth.uid() );

-- update handle_new_user function to use uid instead of id
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
    uid,
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
  on conflict (uid) do update
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