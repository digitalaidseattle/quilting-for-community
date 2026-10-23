-- Instructors are assigned per session, not per event: different sessions of
-- the same class can be taught by different people. Moves instructor_id from
-- events to event_sessions, keeping current assignments.
alter table public.event_sessions
  add column instructor_id uuid references public.profiles(id) on delete set null;

create index event_sessions_instructor_id_idx on public.event_sessions(instructor_id);

update public.event_sessions s
set instructor_id = e.instructor_id
from public.events e
where e.id = s.event_id;

drop index if exists public.events_instructor_id_idx;

alter table public.events
  drop column instructor_id;

-- Published sessions must have an instructor. Any leftover published rows
-- that still have no instructor (event also had none) go back to draft.
update public.event_sessions
set status = 'draft'
where status = 'published' and instructor_id is null;

alter table public.event_sessions
  add constraint event_sessions_published_requires_instructor
  check (status <> 'published' or instructor_id is not null);
