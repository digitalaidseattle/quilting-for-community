
alter table public.profiles enable row level security;

create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());