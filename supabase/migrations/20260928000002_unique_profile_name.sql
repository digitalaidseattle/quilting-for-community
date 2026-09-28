-- Enforce unique profiles.name. NULLs are still allowed (and may repeat).
-- Fails if duplicate names already exist; resolve them before applying:
--   select name, count(*) from public.profiles
--   where name is not null group by name having count(*) > 1;

alter table public.profiles
  add constraint uq_profiles_name unique (name);
