create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    updated_by = excluded.updated_by;

  return new;
end;
$$;
