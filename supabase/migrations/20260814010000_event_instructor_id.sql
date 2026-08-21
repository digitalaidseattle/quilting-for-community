alter table public.events
  add column if not exists instructor_id uuid references public.profiles(id) on delete set null;

create index if not exists events_instructor_id_idx on public.events(instructor_id);
