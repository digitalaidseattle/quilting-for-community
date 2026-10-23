-- Path (not full URL) of the event's photo within the "info" storage bucket.
alter table public.events
  add column photo_path text not null default '';
