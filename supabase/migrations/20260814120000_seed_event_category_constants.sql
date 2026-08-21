-- Seed event category options used by admin event create/edit.
insert into public.constants (type, value, label)
values
  ('event-category', 'longarm', 'Longarm'),
  ('event-category', 'quilt-lab', 'Quilt Lab'),
  ('event-category', 'open-studio', 'Open Studio'),
  ('event-category', 'quilting', 'Quilting'),
  ('event-category', 'beginner', 'Beginner'),
  ('event-category', 'advanced-beginner', 'Advanced Beginner'),
  ('event-category', 'intermediate-beginner', 'Intermediate Beginner')
on conflict (type, value) do nothing;
