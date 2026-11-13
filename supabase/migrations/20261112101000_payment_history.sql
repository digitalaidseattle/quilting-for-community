-- Payment history: an append-only audit trail of every payment, for any
-- provider (Stripe, PayPal, Clover) and for cash.
--
-- payments.status says where a payment is now. This table says how it got
-- there. Rows are written only by the trigger below, in the same transaction
-- as the change they describe, so application code can neither forget to
-- write one nor write a misleading one. Rows are never updated. Nobody using
-- the app (admins included) can delete them. Only the service role and the
-- database owner can, which is what local test cleanup uses.
--
-- Code acting for the system says who it is, and which provider event caused
-- the change, for the rest of its transaction:
--   set_config('app.actor', 'stripe-webhook', true)
--   set_config('app.provider_event_id', '<the provider''s event id>', true)

begin;

create table public.payment_history (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  -- What happened: 'initiated' when the payment is created, 'checkout_started'
  -- each time it gets a provider checkout, or the status it moved to
  -- ('succeeded', 'failed', 'cancelled', 'refunded'). A payment recorded
  -- already complete (cash, Clover) starts with its status instead of 'initiated'.
  event text not null,
  from_status text,
  to_status text,
  -- the payment's type at the time: cash, stripe, paypal or clover
  type text not null,
  -- the provider's id for this step (payment, then checkout), or staff's reference
  provider_id text,
  -- cents
  amount int not null,
  -- Who or what made the change: a signed-in person's email, the name a system
  -- function gave itself in app.actor (e.g. 'stripe-webhook', 'hold-expiry'),
  -- or the database role for anything else.
  actor text not null,
  -- the provider's webhook event that caused the change, when one did
  provider_event_id text,
  -- when the change happened. clock_timestamp(), not now(), so changes made in one
  -- transaction still sort in order. Rows are never updated, and `actor` says who made
  -- the change, so there are no updated_at / created_by / updated_by columns.
  created_at timestamptz not null default clock_timestamp()
);

create index payment_history_payment_id_idx on public.payment_history(payment_id, created_at);
create index payment_history_provider_event_id_idx on public.payment_history(provider_event_id);

alter table public.payment_history enable row level security;

-- Read-only for people using the app. No insert, update or delete policy
-- exists for them, so RLS refuses those even for admins.
revoke all on public.payment_history from public, anon, authenticated;
grant select on public.payment_history to authenticated;
grant select, insert, delete on public.payment_history to service_role;

-- Visible to whoever can see the payment (see the orders schema migration).
create policy payment_history_select on public.payment_history
  for select to authenticated
  using (payment_id in (select id from public.payments));

-- History is never edited, by anyone.
create or replace function public.reject_payment_history_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payment_history rows cannot be changed'
    using errcode = '42501';
end;
$$;

create trigger payment_history_no_update
  before update on public.payment_history
  for each row execute function public.reject_payment_history_update();

-- Who is making the current change.
create or replace function public.payment_actor()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('app.actor', true), ''),
    auth.jwt() ->> 'email',
    auth.uid()::text,
    auth.role(),
    current_user::text
  );
$$;

create or replace function public.record_payment_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := case when new.status = 'pending' then 'initiated' else new.status end;
  elsif old.status is distinct from new.status then
    v_event := new.status;
  elsif old.provider_checkout_id is distinct from new.provider_checkout_id then
    v_event := 'checkout_started';
  else
    return new;  -- nothing worth a history row (e.g. the seat hold was extended)
  end if;

  insert into public.payment_history
    (payment_id, event, from_status, to_status, type, provider_id, amount, actor, provider_event_id)
  values (
    new.id,
    v_event,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    new.type,
    coalesce(new.provider_payment_id, new.provider_checkout_id, new.reference),
    new.amount,
    public.payment_actor(),
    nullif(current_setting('app.provider_event_id', true), '')
  );

  return new;
end;
$$;

create trigger payments_record_history
  after insert or update on public.payments
  for each row execute function public.record_payment_history();

revoke execute on function public.payment_actor() from public, anon, authenticated;
revoke execute on function public.record_payment_history() from public, anon, authenticated;
revoke execute on function public.reject_payment_history_update() from public, anon, authenticated;

commit;
