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

-- Two-part class: part 1 published (needs instructor), part 2 still draft.
insert into public.event_sessions (
  id, event_id, start_at, end_at, max_seats, status, part, instructor_id
)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    (date_trunc('week', now()) + interval '10 days' + interval '10 hours'),
    (date_trunc('week', now()) + interval '10 days' + interval '12 hours'),
    null,
    'published',
    1,
    'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    (date_trunc('week', now()) + interval '17 days' + interval '10 hours'),
    (date_trunc('week', now()) + interval '17 days' + interval '12 hours'),
    8,
    'draft',
    2,
    null
  )
on conflict (id) do nothing;
