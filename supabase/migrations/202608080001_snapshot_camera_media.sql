begin;

alter table public.snapshots
  add column if not exists media_path text,
  add column if not exists media_type text,
  add column if not exists media_mime_type text;

alter table public.snapshots
  drop constraint if exists snapshots_media_complete;

alter table public.snapshots
  add constraint snapshots_media_complete check (
    (media_path is null and media_type is null and media_mime_type is null)
    or (
      media_path is not null
      and media_type in ('photo', 'video')
      and media_mime_type in ('image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime')
      and media_path = user_id::text || '/' || id || '/capture.' ||
        case when media_type = 'photo' then 'jpg' else 'mp4' end
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'snapshot-media',
  'snapshot-media',
  false,
  104857600,
  array['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Snapshot owners can read media" on storage.objects;
create policy "Snapshot owners can read media" on storage.objects
for select to authenticated
using (bucket_id = 'snapshot-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Snapshot owners can create media" on storage.objects;
create policy "Snapshot owners can create media" on storage.objects
for insert to authenticated
with check (bucket_id = 'snapshot-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Snapshot owners can update media" on storage.objects;
create policy "Snapshot owners can update media" on storage.objects
for update to authenticated
using (bucket_id = 'snapshot-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'snapshot-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Snapshot owners can delete media" on storage.objects;
create policy "Snapshot owners can delete media" on storage.objects
for delete to authenticated
using (bucket_id = 'snapshot-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
