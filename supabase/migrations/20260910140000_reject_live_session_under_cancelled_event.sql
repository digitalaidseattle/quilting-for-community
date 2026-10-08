-- A cancelled event cannot have live sessions. Blocks insert/update of a
-- session to draft/published (or any non-cancelled status) while its parent
-- event is cancelled. Cancelling a session under a live event is still allowed.

create or replace function public.reject_live_session_under_cancelled_event()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'cancelled'
     and exists (
       select 1
       from public.events e
       where e.id = new.event_id
         and e.status = 'cancelled'
     ) then
    raise exception
      'Cannot set session status to % while its event is cancelled',
      new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger event_sessions_reject_live_under_cancelled_event
  before insert or update of status, event_id on public.event_sessions
  for each row
  execute function public.reject_live_session_under_cancelled_event();
