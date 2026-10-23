-- When an event is cancelled, all its sessions are cancelled too.
-- The reverse is not true: cancelling a session does not cancel the parent event.

create or replace function public.cancel_event_sessions_on_event_cancel()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled'
     and (tg_op = 'INSERT' or old.status is distinct from 'cancelled') then
    update public.event_sessions
    set status = 'cancelled'
    where event_id = new.id
      and status <> 'cancelled';
  end if;

  return new;
end;
$$;

create trigger events_cancel_sessions_on_event_cancel
  after insert or update of status on public.events
  for each row
  execute function public.cancel_event_sessions_on_event_cancel();
