-- QUIL-80: Create a constants table to store application-wide constants.
-- Only admins allowed to edit

create table public.constants (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  value text not null,
  label text not null,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index constants_type_idx on public.constants(type);
create unique index constants_type_value_idx on public.constants(type, value);

create trigger constants_set_audit_fields
  before insert or update on public.constants
  for each row execute function public.set_audit_fields();

alter table public.constants enable row level security;

create policy "constants_admin_all" on public.constants
  for all using (public.is_admin()) with check (public.is_admin());
