-- Sessions double as the ordered parts of a multi-part class; name is
-- pre-filled from the event name at creation and freely editable.
alter table public.event_sessions add column name text not null default '';
