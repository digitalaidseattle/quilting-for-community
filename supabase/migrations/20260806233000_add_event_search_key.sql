-- Denormalized search blob for generalized event search: name@description@category
alter table public.events
  add column search_key text not null default '';

create or replace function public.events_set_search_key()
returns trigger language plpgsql as $$
begin
  new.search_key :=
    coalesce(new.name, '') || '@' ||
    coalesce(new.description, '') || '@' ||
    coalesce(new.category, '');
  return new;
end;
$$;

create trigger events_set_search_key
  before insert or update on public.events
  for each row execute function public.events_set_search_key();

-- Existing rows: trigger only fires on insert/update, so backfill once.
update public.events
set search_key =
  coalesce(name, '') || '@' ||
  coalesce(description, '') || '@' ||
  coalesce(category, '');
