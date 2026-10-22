-- Public bucket used by SupabaseStorageService (default bucket name "info").
-- Public read lets photo URLs be embedded directly in public pages later;
-- writes are restricted to admins, same as the events tables.
insert into storage.buckets (id, name, public)
values ('info', 'info', true)
on conflict (id) do nothing;

create policy "info_public_read"
on storage.objects for select
using (bucket_id = 'info');

create policy "info_admin_insert"
on storage.objects for insert
with check (bucket_id = 'info' and public.is_admin());

create policy "info_admin_update"
on storage.objects for update
using (bucket_id = 'info' and public.is_admin())
with check (bucket_id = 'info' and public.is_admin());

create policy "info_admin_delete"
on storage.objects for delete
using (bucket_id = 'info' and public.is_admin());
