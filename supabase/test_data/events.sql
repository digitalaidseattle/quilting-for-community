-- Local development sample data. Loaded via db.seed in config.toml on `supabase db reset`.
-- Depends on test_data/users.sql (admin profile used as session instructor).

insert into public.events (
  id, name, description, notes, category, duration,
  max_seats, volunteer_seat_count, price_min, price, price_max,
  template, status
)
values (
  'b0000000-0000-4000-8000-000000000001',
  'Intro to Quilting',
  'Learn the basics of piecing, pressing, and assembling a small quilt top.',
  '',
  'beginner',
  120,
  12,
  2,
  0,
  25,
  50,
  true,
  'published'
) on conflict (id) do nothing;

-- Two-part class: both parts published so the public site can register for each part.
insert into public.event_sessions (
  id, event_id, start_at, end_at, max_seats, status, part, instructor_id
)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    ((date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '10 days 10 hours') at time zone 'America/Los_Angeles'),
    ((date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '10 days 12 hours') at time zone 'America/Los_Angeles'),
    null,
    'published',
    1,
    (select id from public.profiles where auth_id = 'a0000000-0000-4000-8000-000000000001')
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    ((date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '17 days 10 hours') at time zone 'America/Los_Angeles'),
    ((date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '17 days 12 hours') at time zone 'America/Los_Angeles'),
    8,
    'published',
    2,
    (select id from public.profiles where auth_id = 'a0000000-0000-4000-8000-000000000001')
  )
on conflict (id) do nothing;

-- Single-session published class and a draft class (hidden from the public site).
insert into public.events (
  id, name, description, notes, category, duration,
  max_seats, volunteer_seat_count, price_min, price, price_max,
  template, status
)
values
  (
    'b0000000-0000-4000-8000-000000000002',
    'Longarm 101',
    'Get certified to rent studio time on the longarm quilting machine.',
    '',
    'longarm',
    180,
    4,
    1,
    50,
    50,
    50,
    false,
    'published'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'Quilt Lab',
    'Open lab time with an instructor on hand. Not yet scheduled.',
    '',
    'general',
    120,
    10,
    2,
    0,
    10,
    20,
    false,
    'draft'
  )
on conflict (id) do nothing;

insert into public.event_sessions (
  id, event_id, start_at, end_at, max_seats, status, part, instructor_id
)
values
  (
    'c0000000-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000002',
    ((date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '12 days 13 hours') at time zone 'America/Los_Angeles'),
    ((date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '12 days 16 hours') at time zone 'America/Los_Angeles'),
    null,
    'published',
    1,
    (select id from public.profiles where auth_id = 'a0000000-0000-4000-8000-000000000001')
  ),
  (
    'c0000000-0000-4000-8000-000000000004',
    'b0000000-0000-4000-8000-000000000003',
    ((date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '14 days 10 hours') at time zone 'America/Los_Angeles'),
    ((date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '14 days 12 hours') at time zone 'America/Los_Angeles'),
    null,
    'draft',
    1,
    null
  )
on conflict (id) do nothing;
