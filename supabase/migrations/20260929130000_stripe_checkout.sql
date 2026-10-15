-- Stripe Checkout for the pending payments made by register_for_sessions.
--
-- * Stripe itself is only called from edge functions (the static site never
--   sees the secret key): create-checkout turns a pending payment into a
--   Checkout session, and stripe-webhook reports how it ended.
-- * Everything a webhook changes goes through process_stripe_event, which
--   records each Stripe event id once so repeat deliveries are ignored.
-- * The functions here are service-role only.

begin;

-- Stripe can deliver the same webhook event more than once. Each event id is
-- recorded here once. A 'processed' event is never applied again. A 'failed'
-- one is retried when Stripe redelivers it.
create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- evt_..., from Stripe
  event_id text not null unique,
  event_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'failed')),
  error text,
  created_at timestamptz default now(),
  created_by text,
  updated_at timestamptz default now(),
  updated_by text
);

create trigger stripe_webhook_events_set_audit_fields
  before insert or update on public.stripe_webhook_events
  for each row execute function public.set_audit_fields();

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select on public.stripe_webhook_events to authenticated;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;

create policy stripe_webhook_events_admin_read on public.stripe_webhook_events
  for select to authenticated using (public.is_admin());

-- An order has been paid: mark it and confirm its registrations.
create or replace function public.mark_order_paid(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders
  set status = 'paid', payment_date = now()
  where id = p_order_id and status in ('pending', 'cancelled');

  -- A registration cancelled when its hold lapsed comes back too: the money
  -- has been taken, so the person must end up registered. Unless they have
  -- since registered for that session again, where a second active row would
  -- break the one-per-person rule. Then the payment is still recorded and
  -- staff sort out the extra order.
  update public.event_registrations r
  set status = 'confirmed'
  where r.order_id = p_order_id
    and (
      r.status = 'pending'
      or (
        r.status = 'cancelled'
        and not exists (
          select 1 from public.event_registrations other
          where other.session_id = r.session_id
            and other.profile_id = r.profile_id
            and other.status in ('pending', 'confirmed')
        )
      )
    );
$$;

revoke execute on function public.mark_order_paid(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Service-role only: called by the edge functions.
-- ---------------------------------------------------------------------------

-- Called by create-checkout before it asks Stripe for a new Checkout session.
-- Makes sure the seat hold is long enough for one (Stripe needs at least 30
-- minutes) and returns the exact expiry to give Stripe. Two simultaneous calls
-- get the same expiry, so they send Stripe identical requests under one
-- idempotency key and end up with one session.
create or replace function public.begin_checkout(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  perform public.expire_stale_payments();

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    return null;
  end if;

  if v_payment.status = 'pending'
     and v_payment.expires_at - interval '5 minutes' < now() + interval '30 minutes 30 seconds' then
    update public.payments
    set expires_at = now() + interval '36 minutes'
    where id = p_payment_id
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'id', v_payment.id,
    'order_id', v_payment.order_id,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'currency', v_payment.currency,
    'stripe_checkout_session_id', v_payment.stripe_checkout_session_id,
    -- Checkout closes 5 minutes before the hold does, so a payment made at the
    -- last second still finds its registration pending.
    'checkout_expires_at', extract(epoch from v_payment.expires_at - interval '5 minutes')::bigint,
    'description', (
      select string_agg(e.name, ', ' order by i.created_at)
      from public.order_items i
      join public.events e on e.id = i.event_id
      where i.order_id = v_payment.order_id
    ),
    'email', (
      select p.email
      from public.orders o
      join public.profiles p on p.id = o.profile_id
      where o.id = v_payment.order_id
    ),
    'customer_id', (
      select prev.provider_customer_id
      from public.orders o
      join public.orders theirs on theirs.profile_id = o.profile_id
      join public.payments prev on prev.order_id = theirs.id
      where o.id = v_payment.order_id
        and prev.provider_customer_id is not null
      order by prev.created_at desc
      limit 1
    )
  );
end;
$$;

-- Mark paid and confirm the order's registrations. Idempotent.
create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_customer_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    -- A Checkout this system didn't start, e.g. another environment using the
    -- same Stripe account. Raising would have Stripe redeliver it for days.
    return null;
  end if;

  -- 'cancelled' and 'failed' included: the money has been taken, so it is
  -- recorded even if the hold had already lapsed.
  if v_payment.status in ('pending', 'cancelled', 'failed') then
    update public.payments
    set status = 'succeeded',
        paid_at = now(),
        stripe_checkout_session_id = coalesce(p_checkout_session_id, stripe_checkout_session_id),
        stripe_payment_id = coalesce(p_payment_intent_id, stripe_payment_id),
        provider_customer_id = coalesce(p_customer_id, provider_customer_id)
    where id = p_payment_id;

    perform public.mark_order_paid(v_payment.order_id);
  end if;

  return public.payment_summary(p_payment_id);
end;
$$;

-- Checkout expired, was abandoned, or failed: release the seats. No-op unless
-- the payment is still pending. When a Checkout session id is given, only act
-- if it's still the payment's current session, so an old session expiring
-- after a retry can't release the hold.
create or replace function public.cancel_payment(
  p_payment_id uuid,
  p_checkout_session_id text default null,
  p_status text default 'cancelled'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if p_status not in ('cancelled', 'failed') then
    raise exception 'cancel_payment status must be cancelled or failed, not %', p_status;
  end if;

  update public.payments
  set status = p_status
  where id = p_payment_id
    and status = 'pending'
    and (p_checkout_session_id is null or stripe_checkout_session_id = p_checkout_session_id)
  returning order_id into v_order_id;

  if found then
    perform public.release_order(v_order_id);
  end if;

  return public.payment_summary(p_payment_id);
end;
$$;

-- The one entry point for webhooks. Records the Stripe event id, applies the
-- event, and marks it processed, all in one transaction. Returns:
--   'processed'  applied now
--   'duplicate'  already applied on an earlier delivery, nothing done
--   'failed'     applying it raised an error, which is saved on the row. The
--                caller should answer Stripe with an error so it redelivers.
-- p_data carries the few fields each event type needs:
--   checkout.session.*  { payment_id, checkout_session_id, payment_intent_id, customer_id, paid }
create or replace function public.process_stripe_event(
  p_event_id text,
  p_event_type text,
  p_data jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_payment_id uuid;
begin
  insert into public.stripe_webhook_events (event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;

  select status into v_status
  from public.stripe_webhook_events
  where event_id = p_event_id
  for update;

  if v_status = 'processed' then
    return 'duplicate';
  end if;

  -- for payment_history: what made the changes below, and which event
  perform set_config('app.actor', 'stripe-webhook', true);
  perform set_config('app.stripe_event_id', p_event_id, true);

  begin
    v_payment_id := nullif(p_data->>'payment_id', '')::uuid;

    case
      when p_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
        -- a completed session can still be unpaid when the method settles later
        if v_payment_id is not null and coalesce((p_data->>'paid')::boolean, false) then
          perform public.confirm_payment(
            v_payment_id,
            p_data->>'checkout_session_id',
            p_data->>'payment_intent_id',
            p_data->>'customer_id'
          );
        end if;
      when p_event_type = 'checkout.session.expired' then
        if v_payment_id is not null then
          perform public.cancel_payment(v_payment_id, p_data->>'checkout_session_id', 'cancelled');
        end if;
      when p_event_type = 'checkout.session.async_payment_failed' then
        if v_payment_id is not null then
          perform public.cancel_payment(v_payment_id, p_data->>'checkout_session_id', 'failed');
        end if;
      else
        null;  -- not an event this system acts on
    end case;
  exception when others then
    update public.stripe_webhook_events
    set status = 'failed', error = sqlerrm
    where event_id = p_event_id;
    return 'failed';
  end;

  update public.stripe_webhook_events
  set status = 'processed', error = null
  where event_id = p_event_id;

  return 'processed';
end;
$$;

revoke execute on function public.begin_checkout(uuid) from public, anon, authenticated;
revoke execute on function public.confirm_payment(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.cancel_payment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.process_stripe_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.begin_checkout(uuid) to service_role;
grant execute on function public.confirm_payment(uuid, text, text, text) to service_role;
grant execute on function public.cancel_payment(uuid, text, text) to service_role;
grant execute on function public.process_stripe_event(text, text, jsonb) to service_role;

commit;
