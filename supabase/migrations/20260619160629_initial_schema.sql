-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Multi-session events have many event_sessions. Any event may be marked template for admin clone pickers.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  notes text not null default '',
  category text not null default 'general',
  duration int not null default 60,
  max_seats int not null default 10,
  volunteer_seat_count int not null default 2,
  price_min numeric(10,2) not null default 0,
  price numeric(10,2) not null default 0,
  price_max numeric(10,2) not null default 0,
  template boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index events_template_idx on public.events(template);
create index events_category_idx on public.events(category);

-- Scheduled parts of an event (e.g. week 1, week 2 of a multi-week class).
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index event_sessions_event_id_idx on public.event_sessions(event_id);
create index event_sessions_start_at_idx on public.event_sessions(start_at);
create index event_sessions_status_idx on public.event_sessions(status);

-- ---------------------------------------------------------------------------
-- Auth helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from auth.users
    where id = auth.uid()
      and coalesce(raw_user_meta_data->'roles', '[]'::jsonb) ? 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_sessions enable row level security;

create policy "events_admin_all" on public.events
  for all using (public.is_admin());

create policy "event_sessions_admin_all" on public.event_sessions
  for all using (public.is_admin());
