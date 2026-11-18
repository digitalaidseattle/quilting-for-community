-- Event photos: limit uploads to 10 MB and to JPEG, PNG, GIF and WebP.
-- Storage checks the content type the uploader sends, not the file's bytes.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
where id = 'info';

-- Stop anyone from listing the bucket's files. The bucket stays public, so a
-- photo still opens from its public URL without this policy. Admins keep
-- select, which Storage needs for deleting and overwriting files.
drop policy if exists "info_public_read" on storage.objects;

create policy "info_admin_select"
on storage.objects for select
using (bucket_id = 'info' and public.is_admin());
