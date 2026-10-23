-- Participant registrations for event sessions.
--
-- * One registration row per person per session. Multi-part classes: a person
--   may register for one session in each part.
-- * Every registration links to a profile. Guests get a login-less profile
--   (auth_id null) keyed by email (or phone when they have no email).
-- * The public site is a static Next.js export talking to Supabase directly, so
--   every business rule lives here: published-only visibility, capacity, one
--   registration per session/part, the 48-hour cancellation window, and the
--   waiver checkbox. Base tables stay closed to anon; the site only calls RPCs.
-- * Waiver: acceptance is recorded as a timestamp only.

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  registration_type text not null default 'participant'
    check (registration_type in ('participant', 'volunteer')),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled')),
  -- unguessable credential for guest self-service (view / cancel without login)
  manage_token uuid not null default gen_random_uuid(),
  waiver_accepted_at timestamptz,
  created_at timestamptz default now(),
  created_by text,
  updated_at timestamptz default now(),
  updated_by text
);

create index event_registrations_session_id_idx on public.event_registrations(session_id);
create index event_registrations_profile_id_idx on public.event_registrations(profile_id);
create unique index event_registrations_manage_token_idx on public.event_registrations(manage_token);
-- one live registration per person per session (cancelled rows don't block re-registering)
create unique index event_registrations_confirmed_once_idx
  on public.event_registrations(session_id, profile_id)
  where status = 'confirmed';

create trigger event_registrations_set_audit_fields
  before insert or update on public.event_registrations
  for each row execute function public.set_audit_fields();

-- ---------------------------------------------------------------------------
-- Row level security: admins see/manage everything, users see their own rows,
-- anon sees nothing (guests go through registration_by_token). All writes go
-- through the RPCs below.
-- ---------------------------------------------------------------------------

alter table public.event_registrations enable row level security;

grant select, insert, update, delete on public.event_registrations to authenticated, service_role;

create policy event_registrations_admin_all on public.event_registrations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy event_registrations_select_own on public.event_registrations
  for select to authenticated
  using (profile_id in (select id from public.profiles where auth_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Display name for a profile.
create or replace function public.profile_display_name(p public.profiles)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(trim(p.name), ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    p.email
  );
$$;

-- Participant seats still open on a session. Volunteer seats are reserved out of
-- max_seats. A session-level max_seats overrides the event default.
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
          and r.status = 'confirmed'
          and r.registration_type = 'participant'
      ),
    0
  )
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  where s.id = p_session_id;
$$;

-- Full detail for one registration (used by the guest manage page and My Classes).
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

revoke execute on function public.profile_display_name(public.profiles) from public;
revoke execute on function public.session_seats_available(uuid) from public;
revoke execute on function public.registration_details(public.event_registrations) from public;

-- ---------------------------------------------------------------------------
-- RPC: public_events — published events with their upcoming published
-- sessions. The only read path the public site needs. The `template` flag only
-- affects the admin clone picker. Published status makes events visible.
-- ---------------------------------------------------------------------------

create or replace function public.public_events(p_event_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sessions as (
    select
      s.id,
      s.event_id,
      s.start_at,
      s.end_at,
      s.part,
      case when i.id is null then null else public.profile_display_name(i) end as instructor_name,
      public.session_seats_available(s.id) as seats_available
    from public.event_sessions s
    join public.events e on e.id = s.event_id
    left join public.profiles i on i.id = s.instructor_id
    where s.status = 'published'
      and s.end_at > now()
      and e.status = 'published'
      and (p_event_id is null or e.id = p_event_id)
  ),
  grouped as (
    select
      e.id,
      min(s.start_at) as next_start_at,
      jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'description', e.description,
        'category', e.category,
        'duration', e.duration,
        'price_min', e.price_min,
        'price', e.price,
        'price_max', e.price_max,
        'next_start_at', min(s.start_at),
        'sessions', jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'start_at', s.start_at,
            'end_at', s.end_at,
            'part', s.part,
            'instructor_name', s.instructor_name,
            'seats_available', s.seats_available
          )
          order by s.part, s.start_at
        )
      ) as event_json
    from public.events e
    join sessions s on s.event_id = e.id
    group by e.id
  )
  select coalesce(jsonb_agg(event_json order by next_start_at, id), '[]'::jsonb)
  from grouped;
$$;

revoke execute on function public.public_events(uuid) from public;
grant execute on function public.public_events(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: register_for_sessions
--
-- Registers the caller (signed-in profile, or a guest described by p_guest) for
-- each session in p_session_ids. Errors carry a machine-readable code in HINT:
--   WAIVER_REQUIRED, SESSION_REQUIRED, GUEST_INFO_REQUIRED, ACCOUNT_EXISTS,
--   PROFILE_NOT_FOUND, SESSION_UNAVAILABLE, ALREADY_REGISTERED,
--   PART_ALREADY_REGISTERED, SESSION_FULL
-- The whole call is one transaction: if any session fails, nothing is saved.
-- ---------------------------------------------------------------------------

create or replace function public.register_for_sessions(
  p_session_ids uuid[],
  p_guest jsonb default null,
  p_waiver_accepted boolean default false
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
  v_capacity int;
  v_taken int;
  v_registration public.event_registrations%rowtype;
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

  -- ---- who is registering -------------------------------------------------
  if auth.uid() is not null then
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

  -- ---- one registration per session ----------------------------------------
  foreach v_session_id in array v_session_ids loop
    select
      s.id,
      s.event_id,
      s.part,
      s.start_at,
      s.status,
      s.max_seats,
      e.status as event_status,
      e.max_seats as event_max_seats,
      e.volunteer_seat_count
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

    if exists (
      select 1 from public.event_registrations r
      where r.session_id = v_session.id
        and r.profile_id = v_profile.id
        and r.status = 'confirmed'
    ) then
      raise exception 'You are already registered for this session.'
        using errcode = 'P0001', hint = 'ALREADY_REGISTERED';
    end if;

    if exists (
      select 1
      from public.event_registrations r
      join public.event_sessions other on other.id = r.session_id
      where r.profile_id = v_profile.id
        and r.status = 'confirmed'
        and other.event_id = v_session.event_id
        and other.part = v_session.part
        and other.id <> v_session.id
    ) then
      raise exception 'You are already registered for another session of this part.'
        using errcode = 'P0001', hint = 'PART_ALREADY_REGISTERED';
    end if;

    v_capacity := coalesce(v_session.max_seats, v_session.event_max_seats) - v_session.volunteer_seat_count;
    select count(*) into v_taken
    from public.event_registrations r
    where r.session_id = v_session.id
      and r.status = 'confirmed'
      and r.registration_type = 'participant';

    if v_taken >= v_capacity then
      raise exception 'This session is full.'
        using errcode = 'P0001', hint = 'SESSION_FULL';
    end if;

    insert into public.event_registrations (session_id, profile_id, registration_type, status, waiver_accepted_at)
    values (v_session.id, v_profile.id, 'participant', 'confirmed', now())
    returning * into v_registration;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_registration.id,
      'session_id', v_registration.session_id,
      'manage_token', v_registration.manage_token,
      'status', v_registration.status
    ));
  end loop;

  update public.profiles
  set waiver_accepted = true
  where id = v_profile.id and not waiver_accepted;

  return v_result;
end;
$$;

revoke execute on function public.register_for_sessions(uuid[], jsonb, boolean) from public;
grant execute on function public.register_for_sessions(uuid[], jsonb, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: cancel_registration — by id (owner or admin) or by manage token (guest).
-- Staff or participants may cancel before the session.
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

  select start_at into v_start_at from public.event_sessions where id = v_registration.session_id;
  if not v_is_admin and v_start_at < now() + interval '48 hours' then
    raise exception 'Registrations can only be cancelled up to 48 hours before the session. Please contact Quilting for Community.'
      using errcode = 'P0001', hint = 'CANCELLATION_WINDOW_CLOSED';
  end if;

  update public.event_registrations
  set status = 'cancelled'
  where id = v_registration.id
  returning * into v_registration;

  return public.registration_details(v_registration);
end;
$$;

revoke execute on function public.cancel_registration(uuid, uuid) from public;
grant execute on function public.cancel_registration(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: registration_by_token — guest self-service lookup. Null when unknown.
-- ---------------------------------------------------------------------------

create or replace function public.registration_by_token(p_manage_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.registration_details(r)
  from public.event_registrations r
  where r.manage_token = p_manage_token;
$$;

revoke execute on function public.registration_by_token(uuid) from public;
grant execute on function public.registration_by_token(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: my_registrations — the signed-in user's registrations, soonest first.
-- ---------------------------------------------------------------------------

create or replace function public.my_registrations()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.registration_details(r) order by s.start_at, r.created_at), '[]'::jsonb)
  from public.event_registrations r
  join public.event_sessions s on s.id = r.session_id
  join public.profiles p on p.id = r.profile_id
  where auth.uid() is not null
    and p.auth_id = auth.uid();
$$;

revoke execute on function public.my_registrations() from public;
grant execute on function public.my_registrations() to authenticated;

-- ---------------------------------------------------------------------------
-- Link a guest's login-less profile when that email later creates an account,
-- so their registration history follows them instead of leaving a duplicate
-- profile behind. Only on auth.users INSERT.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_login_only_update boolean := false;
begin
  if tg_op = 'UPDATE' then
    is_login_only_update := old.email is not distinct from new.email
      and old.raw_user_meta_data is not distinct from new.raw_user_meta_data
      and old.raw_app_meta_data is not distinct from new.raw_app_meta_data;
  end if;

  -- flag this as a trusted sync write so set_profile_updated_at() lets the
  -- upsert below sync email even for an already-linked profile.
  perform set_config('app.profiles_email_sync', 'true', true);

  if tg_op = 'INSERT' and new.email is not null then
    -- adopt the oldest login-less profile with this email (guest registrations)
    update public.profiles
    set auth_id = new.id,
        updated_by = new.email
    where id = (
      select id
      from public.profiles
      where auth_id is null
        and lower(email) = lower(new.email)
      order by created_at
      limit 1
    );
  end if;

  insert into public.profiles (
    auth_id,  -- note auth_id here gets auth.users.id
    email,
    name,
    first_name,
    last_name,
    roles,
    created_by,
    updated_by
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(trim(concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')), ''),
      new.email
    ),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    public.profile_roles_from_jsonb(new.raw_app_meta_data),
    new.email,
    new.email
  )
  on conflict (auth_id) do update
  set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    roles = excluded.roles,
    updated_at = now(),
    updated_by = excluded.updated_by
  where not is_login_only_update;

  return new;
end;
$$;

commit;
