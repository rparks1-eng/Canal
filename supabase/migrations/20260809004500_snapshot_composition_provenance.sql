begin;

alter table public.snapshots
  add column if not exists scene_activity text,
  add column if not exists track_image_url text;

alter table public.snapshots
  drop constraint if exists snapshots_scene_activity_safe,
  drop constraint if exists snapshots_track_image_url_safe;

alter table public.snapshots
  add constraint snapshots_scene_activity_safe check (
    scene_activity is null
    or (
      char_length(btrim(scene_activity)) between 1 and 120
      and octet_length(scene_activity) <= 480
      and scene_activity = btrim(scene_activity)
      and scene_activity !~ '[[:cntrl:]]'
    )
  ),
  add constraint snapshots_track_image_url_safe check (
    track_image_url is null
    or (
      char_length(track_image_url) <= 1024
      and octet_length(track_image_url) <= 2048
      and track_image_url ~ '^https://(i[.]scdn[.]co|image-cdn-(ak|fa)[.]spotifycdn[.]com)/image/[A-Za-z0-9]{16,128}$'
    )
  );

update public.snapshots as snapshot
set
  scene_activity = coalesce(
    snapshot.scene_activity,
    nullif(btrim(stage.activity), '')
  ),
  track_image_url = coalesce(
    snapshot.track_image_url,
    (
      select track.value ->> 'imageUrl'
      from jsonb_array_elements(stage.tracks) as track(value)
      where track.value ->> 'id' = snapshot.track_id
        and track.value ->> 'imageUrl' ~ '^https://(i[.]scdn[.]co|image-cdn-(ak|fa)[.]spotifycdn[.]com)/image/[A-Za-z0-9]{16,128}$'
      limit 1
    )
  )
from public.live_stages as stage
where snapshot.scene_id = 'stage-' || stage.id::text;

update public.snapshots as snapshot
set
  scene_activity = coalesce(
    snapshot.scene_activity,
    nullif(btrim(scene.payload ->> 'activity'), '')
  ),
  track_image_url = coalesce(
    snapshot.track_image_url,
    (
      select track.value ->> 'imageUrl'
      from jsonb_array_elements(
        coalesce(scene.payload -> 'tracks', '[]'::jsonb)
      ) as track(value)
      where track.value ->> 'id' = snapshot.track_id
        and track.value ->> 'imageUrl' ~ '^https://(i[.]scdn[.]co|image-cdn-(ak|fa)[.]spotifycdn[.]com)/image/[A-Za-z0-9]{16,128}$'
      limit 1
    )
  )
from public.scenes as scene
where snapshot.scene_id = scene.id
  and snapshot.user_id = scene.user_id;

commit;
