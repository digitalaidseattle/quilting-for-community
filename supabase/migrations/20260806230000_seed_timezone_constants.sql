-- Seed common US timezone options used by admin event scheduling.
insert into public.constants (type, value, label)
values
  ('timezone', 'America/Los_Angeles', 'Pacific (Los Angeles)'),
  ('timezone', 'America/Denver', 'Mountain (Denver)'),
  ('timezone', 'America/Phoenix', 'Arizona (Phoenix)'),
  ('timezone', 'America/Chicago', 'Central (Chicago)'),
  ('timezone', 'America/New_York', 'Eastern (New York)'),
  ('timezone', 'UTC', 'UTC')
on conflict (type, value) do nothing;
