-- Event-level lifecycle (published/draft/cancelled), independent of session status.
alter table public.events
  add column status text not null default 'draft';

create index events_status_idx on public.events(status);
