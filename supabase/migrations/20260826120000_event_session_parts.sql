alter table public.event_sessions
  drop column description;

-- Multi-part classes: sessions within one event are grouped into required
-- "parts". A registration will require one session selection from each part.
-- Part numbers are assigned by the application, contiguous starting at 1.
alter table public.event_sessions
  add column part int not null default 1;
