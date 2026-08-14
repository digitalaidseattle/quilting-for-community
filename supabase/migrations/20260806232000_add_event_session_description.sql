-- Sessions may describe a specific part of a multi-part class independently of the parent event.
alter table public.event_sessions
  add column description text not null default '';
