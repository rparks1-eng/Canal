-- Match the public Snapshot source-gallery read path:
-- visibility = public, scene_id = ?, ordered newest-first.
-- The partial predicate keeps private Snapshot rows out of this index.
create index if not exists snapshots_public_scene_updated_index
on public.snapshots (
  scene_id,
  updated_at desc,
  id
)
where visibility = 'public';
