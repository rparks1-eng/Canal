drop policy if exists "Authenticated users can read public Snapshot media" on storage.objects;

create policy "Authenticated users can read public Snapshot media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'snapshot-media'
  and exists (
    select 1
    from public.snapshots
    where snapshots.visibility = 'public'
      and snapshots.media_path = storage.objects.name
      and snapshots.user_id::text = (storage.foldername(storage.objects.name))[1]
  )
);
