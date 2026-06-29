create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  roles text[] not null default '{}'::text[],
  waiver_accepted boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.profiles enable row level security;
