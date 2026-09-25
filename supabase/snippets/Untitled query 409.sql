

  update auth.users
  set raw_app_meta_data = jsonb_set(
    public.profile_app_metadata_object(raw_app_meta_data),
    '{roles}',
    '["admin"]'::jsonb,
    true
  )
  where id = 'd3201321-5fe7-46ee-b297-2f49c42e9132'