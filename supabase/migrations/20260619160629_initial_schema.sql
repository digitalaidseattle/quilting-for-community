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
  created_by text,
  updated_at timestamptz default now(),
  updated_by text
);

create index events_template_idx on public.events(template);
create index events_category_idx on public.events(category);

-- Scheduled parts of an event (e.g. week 1, week 2 of a multi-week class).
-- max_seats null inherits from the parent event; set explicitly to override.
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  max_seats int,
  status text not null default 'draft',
  created_at timestamptz default now(),
  created_by text,
  updated_at timestamptz default now(),
  updated_by text
);

create index event_sessions_event_id_idx on public.event_sessions(event_id);
create index event_sessions_start_at_idx on public.event_sessions(start_at);
create index event_sessions_status_idx on public.event_sessions(status);

-- ---------------------------------------------------------------------------
-- Audit columns
-- ---------------------------------------------------------------------------

-- Set created_*/updated_* server-side so clients can't forget them
create or replace function public.set_audit_fields()
returns trigger language plpgsql as $$
declare
  actor text := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := actor;
  end if;
  new.updated_at := now();
  new.updated_by := actor;
  return new;
end;
$$;

create trigger events_set_audit_fields
  before insert or update on public.events
  for each row execute function public.set_audit_fields();

create trigger event_sessions_set_audit_fields
  before insert or update on public.event_sessions
  for each row execute function public.set_audit_fields();

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
