-- Paid registration and seat holds.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- An unpaid order is over: cancel it and release the seats it was holding.
create or replace function public.release_order(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders
  set status = 'cancelled'
  where id = p_order_id and status = 'pending';

  update public.event_registrations
  set status = 'cancelled'
  where order_id = p_order_id and status = 'pending';
$$;

-- Release holds whose payment window has passed. Safe to call any time.
create or replace function public.expire_stale_payments()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_actor text := coalesce(current_setting('app.actor', true), '');
begin
  -- This usually runs inside someone else's request. The cancellation is the
  -- system's doing, not theirs, so payment_history should say so.
  perform set_config('app.actor', 'hold-expiry', true);

  for v_order_id in
    update public.payments
    set status = 'cancelled'
    where status = 'pending' and expires_at <= now()
    returning order_id
  loop
    perform public.release_order(v_order_id);
  end loop;

  perform set_config('app.actor', v_actor, true);
end;
$$;

-- Payment status as the participant should see it: a pending payment whose
-- window has passed is effectively cancelled even before cleanup runs.
create or replace function public.payment_effective_status(p public.payments)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p.status = 'pending' and p.expires_at <= now() then 'cancelled'
    else p.status
  end;
$$;

-- Participant seats still open on a session. Seats are taken by confirmed
-- registrations and by pending ones whose order still has a payment in flight.
create or replace function public.session_seats_available(p_session_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce(s.max_seats, e.max_seats) - e.volunteer_seat_count
      - (
        select count(*)::int
        from public.event_registrations r
        where r.session_id = s.id
          and r.registration_type = 'participant'
          and (
            r.status = 'confirmed'
            or (
              r.status = 'pending'
              and exists (
                select 1 from public.payments p
                where p.order_id = r.order_id
                  and p.status = 'pending'
                  and p.expires_at > now()
              )
            )
          )
      ),
    0
  )
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  where s.id = p_session_id;
$$;

-- The payment to show for an order: its latest attempt.
create or replace function public.order_payment_id(p_order_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.payments p
  where p.order_id = p_order_id
  order by p.created_at desc, p.id
  limit 1;
$$;

create or replace function public.payment_summary(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'order_id', p.order_id,
    'status', public.payment_effective_status(p),
    'amount_cents', p.amount,
    'currency', p.currency,
    'expires_at', p.expires_at,
    'paid_at', p.paid_at
  )
  from public.payments p
  where p.id = p_payment_id;
$$;

-- Same shape as before, plus 'order_id' and a 'payment' object (both null for
-- registrations that weren't charged).
create or replace function public.registration_details(r public.event_registrations)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'registration_type', r.registration_type,
    'manage_token', r.manage_token,
    'waiver_accepted_at', r.waiver_accepted_at,
    'created_at', r.created_at,
    'order_id', r.order_id,
    'payment', case
      when r.order_id is null then null
      else public.payment_summary(public.order_payment_id(r.order_id))
    end,
    'registrant', jsonb_build_object(
      'name', public.profile_display_name(p),
      'email', p.email,
      'phone', p.phone
    ),
    'session', jsonb_build_object(
      'id', s.id,
      'start_at', s.start_at,
      'end_at', s.end_at,
      'part', s.part,
      'status', s.status,
      'instructor_name', case when i.id is null then null else public.profile_display_name(i) end
    ),
    'event', jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'description', e.description,
      'category', e.category,
      'duration', e.duration,
      'status', e.status,
      'price_min', e.price_min,
      'price', e.price,
      'price_max', e.price_max
    )
  )
  from public.profiles p,
    public.event_sessions s
    join public.events e on e.id = s.event_id
    left join public.profiles i on i.id = s.instructor_id
  where p.id = r.profile_id
    and s.id = r.session_id;
$$;

-- What register_for_sessions returns for each registration.
create or replace function public.registration_result(r public.event_registrations)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'session_id', r.session_id,
    'manage_token', r.manage_token,
    'status', r.status,
    'order_id', r.order_id,
    'payment_id', case when r.order_id is null then null else public.order_payment_id(r.order_id) end
  );
$$;

revoke execute on function public.release_order(uuid) from public, anon, authenticated;
revoke execute on function public.expire_stale_payments() from public, anon, authenticated;
grant execute on function public.expire_stale_payments() to service_role;
revoke execute on function public.payment_effective_status(public.payments) from public, anon, authenticated;
revoke execute on function public.session_seats_available(uuid) from public, anon, authenticated;
revoke execute on function public.order_payment_id(uuid) from public, anon, authenticated;
revoke execute on function public.payment_summary(uuid) from public, anon, authenticated;
revoke execute on function public.registration_details(public.event_registrations) from public, anon, authenticated;
revoke execute on function public.registration_result(public.event_registrations) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: register_for_sessions. Now takes the chosen amount (dollars) and an
-- optional request id, and creates the order, its class item and the pending
-- payment when there is something to pay.
-- ---------------------------------------------------------------------------

drop function public.register_for_sessions(uuid[], jsonb, boolean);

create or replace function public.register_for_sessions(
  p_session_ids uuid[],
  p_guest jsonb default null,
  p_waiver_accepted boolean default false,
  p_amount numeric default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_guest_name text;
  v_guest_email text;
  v_guest_phone text;
  v_first_name text;
  v_last_name text;
  v_session_ids uuid[];
  v_session_id uuid;
  v_session record;
  v_event public.events%rowtype;
  v_event_ids uuid[];
  v_amount numeric;
  v_amount_cents int;
  v_order public.orders%rowtype;
  v_status text;
  v_registration public.event_registrations%rowtype;
  v_pending_order_id uuid;
  v_result jsonb := '[]'::jsonb;
begin
  if not coalesce(p_waiver_accepted, false) then
    raise exception 'Please accept the waiver to register.'
      using errcode = 'P0001', hint = 'WAIVER_REQUIRED';
  end if;

  -- de-duplicate and sort so concurrent calls lock sessions in the same order
  select array_agg(distinct id order by id)
  into v_session_ids
  from unnest(coalesce(p_session_ids, '{}'::uuid[])) as ids(id);

  if v_session_ids is null or cardinality(v_session_ids) = 0 then
    raise exception 'Choose at least one session.'
      using errcode = 'P0001', hint = 'SESSION_REQUIRED';
  end if;

  -- One call pays for one class, so every session must belong to the same event.
  select array_agg(distinct s.event_id)
  into v_event_ids
  from public.event_sessions s
  where s.id = any(v_session_ids);

  if v_event_ids is null then
    raise exception 'This session is not open for registration.'
      using errcode = 'P0001', hint = 'SESSION_UNAVAILABLE';
  end if;

  if cardinality(v_event_ids) > 1 then
    raise exception 'Register for one class at a time.'
      using errcode = 'P0001', hint = 'SESSION_EVENT_MISMATCH';
  end if;

  -- Parts are optional, but at most one session of each.
  if (
    select count(distinct s.part) from public.event_sessions s where s.id = any(v_session_ids)
  ) < cardinality(v_session_ids) then
    raise exception 'Choose only one session for each part.'
      using errcode = 'P0001', hint = 'PART_ALREADY_REGISTERED';
  end if;

  perform public.expire_stale_payments();

  -- ---- who is registering -------------------------------------------------
  -- One registration attempt at a time per person per class, taken on who they
  -- say they are, before their profile is looked up or created. Without it, two
  -- requests at the same instant (a double click, or two tabs picking different
  -- dates of the same part) could each create a profile, an order and a hold
  -- before either saw the other.
  if auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'register:' || auth.uid()::text || ':' || v_event_ids[1]::text, 0));

    select * into v_profile from public.profiles where auth_id = auth.uid();
    if not found then
      raise exception 'No profile found for the signed-in user.'
        using errcode = 'P0001', hint = 'PROFILE_NOT_FOUND';
    end if;
  else
    v_guest_name := nullif(trim(coalesce(p_guest->>'name', '')), '');
    v_guest_email := nullif(lower(trim(coalesce(p_guest->>'email', ''))), '');
    v_guest_phone := nullif(trim(coalesce(p_guest->>'phone', '')), '');

    if v_guest_name is null or (v_guest_email is null and v_guest_phone is null) then
      raise exception 'Please provide your name and an email address or phone number.'
        using errcode = 'P0001', hint = 'GUEST_INFO_REQUIRED';
    end if;

    v_first_name := split_part(v_guest_name, ' ', 1);
    v_last_name := nullif(trim(substr(v_guest_name, length(v_first_name) + 1)), '');

    perform pg_advisory_xact_lock(hashtextextended(
      'register:' || coalesce(v_guest_email, v_guest_phone) || ':' || v_event_ids[1]::text, 0));

    if v_guest_email is not null then
      -- prefer a linked account so we can tell the guest to sign in
      select * into v_profile
      from public.profiles
      where lower(email) = v_guest_email
      order by (auth_id is not null) desc, created_at
      limit 1;
    else
      select * into v_profile
      from public.profiles
      where auth_id is null and phone = v_guest_phone
      order by created_at
      limit 1;
    end if;

    if found and v_profile.auth_id is not null then
      raise exception 'An account already exists for this email. Please sign in to register.'
        using errcode = 'P0001', hint = 'ACCOUNT_EXISTS';
    end if;

    if found then
      update public.profiles
      set name = v_guest_name,
          first_name = v_first_name,
          last_name = v_last_name,
          phone = coalesce(v_guest_phone, phone)
      where id = v_profile.id
      returning * into v_profile;
    else
      insert into public.profiles (name, first_name, last_name, email, phone, created_by, updated_by)
      values (
        v_guest_name,
        v_first_name,
        v_last_name,
        v_guest_email,
        v_guest_phone,
        coalesce(v_guest_email, 'guest'),
        coalesce(v_guest_email, 'guest')
      )
      returning * into v_profile;
    end if;
  end if;

  select e.* into v_event
  from public.events e
  where e.id = v_event_ids[1];

  -- ---- a repeat of a request that already made an order ---------------------
  if p_request_id is not null then
    select * into v_order from public.orders where request_id = p_request_id;
    if found then
      if v_order.profile_id <> v_profile.id then
        raise exception 'This request belongs to someone else.'
          using errcode = '42501', hint = 'NOT_ALLOWED';
      end if;

      select coalesce(jsonb_agg(public.registration_result(r) order by r.session_id), '[]'::jsonb)
      into v_result
      from public.event_registrations r
      where r.order_id = v_order.id;

      return v_result;
    end if;
  end if;

  -- ---- an earlier registration for this class ------------------------------
  -- Every part a person wants is chosen in one registration, so the class is
  -- paid for once. Parts can't be added later.
  select r.order_id, r.status into v_pending_order_id, v_status
  from public.event_registrations r
  join public.event_sessions s on s.id = r.session_id
  where r.profile_id = v_profile.id
    and r.status in ('pending', 'confirmed')
    and s.event_id = v_event.id
  order by (r.status = 'pending') desc
  limit 1;

  if v_status = 'confirmed' then
    raise exception 'You''re already registered for this class.'
      using errcode = 'P0001', hint = 'ALREADY_REGISTERED';
  end if;

  -- An unpaid hold: finish that payment or let it lapse.
  if v_status = 'pending' then
    -- only a signed-in user gets the payment id back to resume. for a guest it
    -- would let anyone who knows their email look up their registration
    raise exception 'You already have a payment in progress for this class. Finish it, or try again after it expires in about 30 minutes.'
      using errcode = 'P0001', hint = 'PAYMENT_PENDING',
            detail = case
              when auth.uid() is not null then coalesce(public.order_payment_id(v_pending_order_id)::text, '')
              else ''
            end;
  end if;

  -- ---- how much ------------------------------------------------------------
  v_amount := round(coalesce(p_amount, 0), 2);

  if v_amount < v_event.price_min or v_amount > v_event.price_max then
    raise exception 'Please choose an amount between $% and $%.', v_event.price_min, v_event.price_max
      using errcode = 'P0001', hint = 'AMOUNT_OUT_OF_RANGE';
  end if;

  if v_amount > 0 then
    v_amount_cents := (v_amount * 100)::int;

    insert into public.orders (profile_id, amount, request_id)
    values (v_profile.id, v_amount_cents, p_request_id)
    returning * into v_order;

    insert into public.order_items (order_id, event_id, amount)
    values (v_order.id, v_event.id, v_amount_cents);

    insert into public.payments (order_id, type, amount, expires_at)
    values (v_order.id, 'stripe', v_amount_cents, now() + interval '35 minutes');

    v_status := 'pending';
  else
    v_order := null;
    v_status := 'confirmed';
  end if;

  -- ---- one registration per session ----------------------------------------
  foreach v_session_id in array v_session_ids loop
    select
      s.id,
      s.event_id,
      s.part,
      s.start_at,
      s.status,
      e.status as event_status
    into v_session
    from public.event_sessions s
    join public.events e on e.id = s.event_id
    where s.id = v_session_id
    for update of s;

    if not found
      or v_session.status <> 'published'
      or v_session.event_status <> 'published'
      or v_session.start_at <= now() then
      raise exception 'This session is not open for registration.'
        using errcode = 'P0001', hint = 'SESSION_UNAVAILABLE';
    end if;

    if public.session_seats_available(v_session.id) <= 0 then
      raise exception 'This session is full.'
        using errcode = 'P0001', hint = 'SESSION_FULL';
    end if;

    insert into public.event_registrations (session_id, profile_id, registration_type, status, waiver_accepted_at, order_id)
    values (v_session.id, v_profile.id, 'participant', v_status, now(), v_order.id)
    returning * into v_registration;

    v_result := v_result || jsonb_build_array(public.registration_result(v_registration));
  end loop;

  update public.profiles
  set waiver_accepted = true
  where id = v_profile.id and not waiver_accepted;

  return v_result;
end;
$$;

revoke execute on function public.register_for_sessions(uuid[], jsonb, boolean, numeric, uuid) from public;
grant execute on function public.register_for_sessions(uuid[], jsonb, boolean, numeric, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: cancel_registration. Cancels the person's whole registration for the
-- class, every part of it, since parts can't be added back later. Participants
-- can't cancel a registration that's awaiting payment (its seat is released
-- when the hold lapses or they back out of Checkout, see cancel_payment) or one
-- whose order has been paid (refunds are handled by staff for now). Admins can
-- still cancel.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_registration(
  p_registration_id uuid default null,
  p_manage_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations%rowtype;
  v_is_admin boolean := coalesce(public.is_admin(), false);
  v_profile_id uuid;
  v_start_at timestamptz;
  v_class_registration_ids uuid[];
  v_paid boolean;
begin
  if p_manage_token is not null then
    select * into v_registration
    from public.event_registrations
    where manage_token = p_manage_token
    for update;
  elsif p_registration_id is not null then
    select * into v_registration
    from public.event_registrations
    where id = p_registration_id
    for update;
  else
    raise exception 'A registration id or manage token is required.'
      using errcode = 'P0001', hint = 'REGISTRATION_REQUIRED';
  end if;

  if not found then
    raise exception 'Registration not found.'
      using errcode = 'P0001', hint = 'REGISTRATION_NOT_FOUND';
  end if;

  if p_manage_token is null and not v_is_admin then
    select id into v_profile_id from public.profiles where auth_id = auth.uid();
    if v_profile_id is null or v_profile_id <> v_registration.profile_id then
      raise exception 'You cannot cancel this registration.'
        using errcode = '42501', hint = 'NOT_ALLOWED';
    end if;
  end if;

  if v_registration.status = 'cancelled' then
    return public.registration_details(v_registration);
  end if;

  if not v_is_admin and v_registration.status = 'pending' then
    raise exception 'This registration is waiting for payment. If you don''t complete payment, your spot is released automatically in about 30 minutes.'
      using errcode = 'P0001', hint = 'PAYMENT_PENDING';
  end if;

  select exists (
    select 1 from public.payments p
    where p.order_id = v_registration.order_id and p.status = 'succeeded'
  ) into v_paid;

  if not v_is_admin and v_paid then
    raise exception 'Paid registrations can''t be cancelled online yet. Please contact Quilting for Community.'
      using errcode = 'P0001', hint = 'PAID_REGISTRATION';
  end if;

  -- the person's registrations for this class, this one included
  select array_agg(r.id), min(s.start_at) into v_class_registration_ids, v_start_at
  from public.event_registrations r
  join public.event_sessions s on s.id = r.session_id
  where r.profile_id = v_registration.profile_id
    and r.status in ('confirmed', 'pending')
    and s.event_id = (select event_id from public.event_sessions where id = v_registration.session_id);

  if not v_is_admin and v_start_at < now() + interval '48 hours' then
    raise exception 'Registrations can only be cancelled up to 48 hours before your first session. Please contact Quilting for Community.'
      using errcode = 'P0001', hint = 'CANCELLATION_WINDOW_CLOSED';
  end if;

  update public.event_registrations
  set status = 'cancelled'
  where id = any(v_class_registration_ids);

  select * into v_registration from public.event_registrations where id = v_registration.id;

  return public.registration_details(v_registration);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: payment_status. What the site shows when Stripe sends the person back.
-- Knowing the payment id is the credential, like a manage token: it's only
-- ever returned to the person who registered. Null when unknown.
-- ---------------------------------------------------------------------------

create or replace function public.payment_status(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.payment_summary(p.id) || jsonb_build_object(
    'event', (
      select jsonb_build_object('id', e.id, 'name', e.name)
      from public.order_items i
      join public.events e on e.id = i.event_id
      where i.order_id = p.order_id
      order by i.created_at
      limit 1
    ),
    'registrations', coalesce((
      select jsonb_agg(public.registration_details(r) order by s.part, s.start_at)
      from public.event_registrations r
      join public.event_sessions s on s.id = r.session_id
      where r.order_id = p.order_id
    ), '[]'::jsonb)
  )
  from public.payments p
  where p.id = p_payment_id;
$$;

revoke execute on function public.payment_status(uuid) from public;
grant execute on function public.payment_status(uuid) to anon, authenticated;

commit;
