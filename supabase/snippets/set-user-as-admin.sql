 update auth.users
 set raw_user_meta_data = jsonb_set(
  coalesce(raw_user_meta_data, '{}'),
  '{roles}',
  '["admin"]',
  true
)
where id = '2cfdb388-6c5a-4c4b-b8a5-836552a7c061';