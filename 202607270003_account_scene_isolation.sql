begin;

do $$
begin
  if to_regclass(
    'public.scenes'
  ) is null then
    raise exception
      'public.scenes does not exist';
  end if;
end
$$;

/*
 * The old mobile cache could upload one Scene ID
 * into more than one account. Scene IDs are unique
 * app-generated identifiers, so repeated IDs across
 * different owners are contamination. Keep the row
 * inserted by the earliest database transaction.
 */
with ranked_scene_owners as (
  select
    ctid,
    row_number() over (
      partition by id
      order by
        (xmin::text)::bigint asc,
        created_at asc,
        user_id asc
    ) as ownership_rank
  from public.scenes
  where deleted_at is null
)
delete from public.scenes as scenes
using ranked_scene_owners as ranked
where scenes.ctid = ranked.ctid
  and ranked.ownership_rank > 1;

/*
 * Remove saved-scene records whose source no
 * longer exists after duplicate cleanup.
 */
delete from public.saved_scenes as saved
where not exists (
  select 1
  from public.scenes as source
  where source.user_id =
          saved.source_user_id
    and source.id =
          saved.source_scene_id
    and source.deleted_at is null
);

/*
 * Stamp every future Scene payload with the real
 * authenticated database owner. The client cannot
 * accidentally claim another account's Scene.
 */
create or replace function public.stamp_canal_scene_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.payload =
    jsonb_set(
      coalesce(
        new.payload,
        '{}'::jsonb
      ),
      '{ownerId}',
      to_jsonb(
        new.user_id::text
      ),
      true
    );

  return new;
end;
$$;

drop trigger if exists scenes_stamp_owner
on public.scenes;

create trigger scenes_stamp_owner
before insert or update
on public.scenes
for each row
execute function public.stamp_canal_scene_owner();

update public.scenes
set payload =
  jsonb_set(
    coalesce(
      payload,
      '{}'::jsonb
    ),
    '{ownerId}',
    to_jsonb(
      user_id::text
    ),
    true
  )
where
  payload ->> 'ownerId'
    is distinct from
  user_id::text;

create index if not exists scenes_payload_owner_index
on public.scenes (
  (payload ->> 'ownerId')
);

commit;
