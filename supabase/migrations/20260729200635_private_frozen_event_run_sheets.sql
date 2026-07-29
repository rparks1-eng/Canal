begin;

/*
 * Private Frozen Event Run Sheets replace the original collection-backed
 * cursor with an owner-only lifecycle and an immutable Scene snapshot.
 *
 * Historical progressed/completed rows cannot be truthfully reconstructed
 * because the original model did not store Scene revisions. Refuse the
 * migration instead of silently labelling mutable current data as historical.
 * Planned rows at position zero remain editable and will snapshot at Start.
 */
do $$
begin
  if exists (
    select 1
    from public.creator_event_run_sheets as run_sheet
    where run_sheet.status <> 'planned'
      or run_sheet.active_position <> 0
      or not isfinite(run_sheet.starts_at)
      or char_length(trim(run_sheet.title)) not between 1 and 80
      or char_length(trim(run_sheet.venue_label)) not between 1 and 120
      or not exists (
        select 1
        from pg_catalog.pg_timezone_names as zone
        where zone.name = trim(run_sheet.time_zone)
      )
  ) then
    raise exception
      'EVENT_RUN_SHEET_LEGACY_PREFLIGHT_REQUIRED'
      using
        errcode = '55000',
        detail = 'Progressed, completed, or malformed legacy Event Run Sheets require an operator-reviewed archival decision before this migration can run.';
  end if;
end;
$$;

drop trigger if exists creator_event_run_sheets_validate_collection_change
on public.creator_scene_collection_items;

drop function if exists
public.validate_creator_event_run_sheets_after_collection_change();

drop trigger if exists creator_event_run_sheets_validate
on public.creator_event_run_sheets;

drop function if exists
public.validate_creator_event_run_sheet();

drop function if exists public.save_creator_event_run_sheet(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text
);

drop function if exists
public.advance_creator_event_run_sheet(uuid, integer);

drop function if exists
public.delete_creator_event_run_sheet(uuid);

alter table public.creator_event_run_sheets
drop constraint if exists creator_event_run_sheets_collection_fkey;

alter table public.creator_event_run_sheets
drop constraint if exists creator_event_run_sheets_owner_id_fkey;

alter table public.creator_event_run_sheets
drop constraint if exists creator_event_run_sheets_status_check;

alter table public.creator_event_run_sheets
drop constraint if exists creator_event_run_sheets_position_nonnegative;

alter table public.creator_event_run_sheets
add column if not exists version bigint not null default 1,
add column if not exists started_at timestamptz,
add column if not exists completed_at timestamptz,
add column if not exists source_collection_title text;

alter table public.creator_event_run_sheets
add constraint creator_event_run_sheets_owner_auth_fkey
foreign key (owner_id)
references auth.users(id)
on delete cascade;

alter table public.creator_event_run_sheets
add constraint creator_event_run_sheets_version_positive
check (version > 0);

alter table public.creator_event_run_sheets
add constraint creator_event_run_sheets_position_bounded
check (active_position between 0 and 49);

alter table public.creator_event_run_sheets
add constraint creator_event_run_sheets_status_check
check (
  status in (
    'planned',
    'running',
    'completed'
  )
);

alter table public.creator_event_run_sheets
add constraint creator_event_run_sheets_source_title_length
check (
  source_collection_title is null
  or (
    char_length(trim(source_collection_title))
      between 1 and 80
    and source_collection_title !~ '[[:cntrl:]]'
  )
);

alter table public.creator_event_run_sheets
add constraint creator_event_run_sheets_lifecycle_state
check (
  (
    status = 'planned'
    and active_position = 0
    and started_at is null
    and completed_at is null
    and source_collection_title is null
  )
  or (
    status = 'running'
    and started_at is not null
    and completed_at is null
    and source_collection_title is not null
  )
  or (
    status = 'completed'
    and started_at is not null
    and completed_at is not null
    and completed_at >= started_at
    and source_collection_title is not null
  )
);

create table if not exists public.creator_event_run_sheet_items (
  run_sheet_id uuid not null,
  owner_id uuid not null,
  scene_id text not null,
  scene_revision bigint not null,
  position integer not null,
  scene_title text not null,
  activity_label text not null,
  duration_label text not null,
  track_count integer not null,
  created_at timestamptz not null default now(),
  primary key (
    run_sheet_id,
    scene_id
  ),
  constraint creator_event_run_sheet_items_position_unique
    unique (
      run_sheet_id,
      position
    ),
  constraint creator_event_run_sheet_items_run_sheet_fkey
    foreign key (
      owner_id,
      run_sheet_id
    )
    references public.creator_event_run_sheets (
      owner_id,
      id
    )
    on delete cascade,
  constraint creator_event_run_sheet_items_scene_id_length
    check (
      char_length(scene_id) between 1 and 512
      and scene_id = trim(scene_id)
      and scene_id !~ '[[:cntrl:]]'
    ),
  constraint creator_event_run_sheet_items_revision_positive
    check (scene_revision > 0),
  constraint creator_event_run_sheet_items_position_bounded
    check (position between 0 and 49),
  constraint creator_event_run_sheet_items_title_length
    check (
      char_length(trim(scene_title)) between 1 and 120
      and scene_title !~ '[[:cntrl:]]'
    ),
  constraint creator_event_run_sheet_items_activity_length
    check (
      char_length(trim(activity_label)) between 1 and 120
      and activity_label !~ '[[:cntrl:]]'
    ),
  constraint creator_event_run_sheet_items_duration_length
    check (
      char_length(trim(duration_label)) between 1 and 80
      and duration_label !~ '[[:cntrl:]]'
    ),
  constraint creator_event_run_sheet_items_track_count_bounded
    check (track_count between 0 and 500)
);

create unique index if not exists
creator_event_run_sheets_one_running_collection_index
on public.creator_event_run_sheets (
  owner_id,
  collection_id
)
where status = 'running';

create index if not exists
creator_event_run_sheets_owner_status_starts_index
on public.creator_event_run_sheets (
  owner_id,
  status,
  starts_at,
  id
);

create index if not exists
creator_event_run_sheet_items_owner_run_sheet_index
on public.creator_event_run_sheet_items (
  owner_id,
  run_sheet_id,
  position
);

create or replace function private.protect_creator_event_run_sheet()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
    or new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
  then
    raise exception
      'Event Run Sheet ownership and identity are immutable.'
      using errcode = '22023';
  end if;

  if new.version <> old.version + 1 then
    raise exception
      'An Event Run Sheet version must advance by exactly one.'
      using errcode = '40001';
  end if;

  if new.status is distinct from old.status
    and not (
      (old.status = 'planned' and new.status = 'running')
      or (old.status = 'running' and new.status = 'completed')
    )
  then
    raise exception
      'The Event Run Sheet lifecycle transition is invalid.'
      using errcode = '22023';
  end if;

  if old.status <> 'planned'
    and (
      new.collection_id is distinct from old.collection_id
      or new.title is distinct from old.title
      or new.venue_label is distinct from old.venue_label
      or new.starts_at is distinct from old.starts_at
      or new.time_zone is distinct from old.time_zone
      or new.source_collection_title is distinct from old.source_collection_title
      or new.started_at is distinct from old.started_at
    )
  then
    raise exception
      'A started Event Run Sheet snapshot and metadata are immutable.'
      using errcode = '22023';
  end if;

  if old.status = 'completed' then
    raise exception
      'A completed Event Run Sheet is immutable.'
      using errcode = '22023';
  end if;

  new.updated_at := now();

  return new;
end;
$$;

revoke all
on function private.protect_creator_event_run_sheet()
from public, anon, authenticated, service_role;

drop trigger if exists creator_event_run_sheets_protect
on public.creator_event_run_sheets;

create trigger creator_event_run_sheets_protect
before update
on public.creator_event_run_sheets
for each row
execute function private.protect_creator_event_run_sheet();

create or replace function private.protect_creator_event_run_sheet_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_run_sheet_id uuid :=
    case
      when tg_op = 'DELETE' then old.run_sheet_id
      else new.run_sheet_id
    end;
  target_status text;
begin
  if pg_trigger_depth() > 1 then
    return case
      when tg_op = 'DELETE' then old
      else new
    end;
  end if;

  if tg_op = 'UPDATE' then
    raise exception
      'Frozen Event Run Sheet items are immutable.'
      using errcode = '22023';
  end if;

  select run_sheet.status
  into target_status
  from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = target_run_sheet_id
  for key share;

  if not found then
    raise exception
      'The Event Run Sheet was not found.'
      using errcode = 'P0002';
  end if;

  if target_status <> 'planned' then
    raise exception
      'Started Event Run Sheet items are immutable.'
      using errcode = '22023';
  end if;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;

revoke all
on function private.protect_creator_event_run_sheet_item()
from public, anon, authenticated, service_role;

drop trigger if exists creator_event_run_sheet_items_protect
on public.creator_event_run_sheet_items;

create trigger creator_event_run_sheet_items_protect
before insert or update or delete
on public.creator_event_run_sheet_items
for each row
execute function private.protect_creator_event_run_sheet_item();

alter table public.creator_event_run_sheets
enable row level security;

alter table public.creator_event_run_sheet_items
enable row level security;

drop policy if exists "Owners can read Event Run Sheets"
on public.creator_event_run_sheets;

create policy "Owners can read Event Run Sheets"
on public.creator_event_run_sheets
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = owner_id
);

drop policy if exists "Owners can read frozen Event Run Sheet items"
on public.creator_event_run_sheet_items;

create policy "Owners can read frozen Event Run Sheet items"
on public.creator_event_run_sheet_items
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = owner_id
);

revoke all
on public.creator_event_run_sheets
from public, anon, authenticated, service_role;

revoke all
on public.creator_event_run_sheet_items
from public, anon, authenticated, service_role;

grant select
on public.creator_event_run_sheets
to authenticated;

grant select
on public.creator_event_run_sheet_items
to authenticated;

create or replace function public.save_creator_event_run_sheet(
  run_sheet_id_value uuid,
  collection_id_value uuid,
  title_value text,
  venue_label_value text,
  starts_at_value timestamptz,
  time_zone_value text,
  expected_version_value bigint,
  expected_actor_id_value uuid
)
returns public.creator_event_run_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  normalized_title text :=
    trim(coalesce(title_value, ''));
  normalized_venue_label text :=
    trim(coalesce(venue_label_value, ''));
  normalized_time_zone text :=
    trim(coalesce(time_zone_value, ''));
  target_run_sheet_id uuid :=
    coalesce(run_sheet_id_value, gen_random_uuid());
  target_run_sheet public.creator_event_run_sheets%rowtype;
  saved_run_sheet public.creator_event_run_sheets%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if collection_id_value is null
    or char_length(normalized_title) not between 1 and 80
    or normalized_title ~ '[[:cntrl:]]'
    or char_length(normalized_venue_label) not between 1 and 120
    or normalized_venue_label ~ '[[:cntrl:]]'
    or char_length(normalized_time_zone) not between 1 and 64
    or normalized_time_zone ~ '[[:cntrl:]]'
    or starts_at_value is null
    or not isfinite(starts_at_value)
  then
    raise exception
      'Event Run Sheet fields are invalid.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = normalized_time_zone
  ) then
    raise exception
      'Choose a valid IANA time zone.'
      using errcode = '22023';
  end if;

  if run_sheet_id_value is null then
    if expected_version_value is not null then
      raise exception
        'A new Event Run Sheet cannot have an expected version.'
        using errcode = '22023';
    end if;

    perform collection.id
    from public.creator_scene_collections as collection
    where collection.id = collection_id_value
      and collection.owner_id = current_user_id
    for key share;

    if not found then
      raise exception
        'Event Run Sheets can use only the owner''s Scene collections.'
        using errcode = '42501';
    end if;

    insert into public.creator_event_run_sheets (
      id,
      owner_id,
      collection_id,
      title,
      venue_label,
      starts_at,
      time_zone,
      active_position,
      status,
      version
    )
    values (
      target_run_sheet_id,
      current_user_id,
      collection_id_value,
      normalized_title,
      normalized_venue_label,
      starts_at_value,
      normalized_time_zone,
      0,
      'planned',
      1
    )
    returning *
    into saved_run_sheet;

    return saved_run_sheet;
  end if;

  select run_sheet.*
  into target_run_sheet
  from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = target_run_sheet_id
  for update;

  if not found
    or target_run_sheet.owner_id <> current_user_id
  then
    raise exception
      'This Event Run Sheet is unavailable.'
      using errcode = 'P0002';
  end if;

  if target_run_sheet.status <> 'planned' then
    raise exception
      'Only a planned Event Run Sheet can be edited.'
      using errcode = '22023';
  end if;

  if expected_version_value is null
    or target_run_sheet.version <> expected_version_value
  then
    raise exception
      'The Event Run Sheet changed on another device. Reload before saving.'
      using errcode = '40001';
  end if;

  /*
   * Existing saves and Start both lock the Run Sheet before its collection.
   * This consistent order prevents a save/start deadlock while retaining the
   * collection row long enough to reject deletion during the update.
   */
  perform collection.id
  from public.creator_scene_collections as collection
  where collection.id = collection_id_value
    and collection.owner_id = current_user_id
  for key share;

  if not found then
    raise exception
      'Event Run Sheets can use only the owner''s Scene collections.'
      using errcode = '42501';
  end if;

  update public.creator_event_run_sheets as run_sheet
  set
    collection_id = collection_id_value,
    title = normalized_title,
    venue_label = normalized_venue_label,
    starts_at = starts_at_value,
    time_zone = normalized_time_zone,
    version = target_run_sheet.version + 1
  where run_sheet.id = target_run_sheet.id
    and run_sheet.owner_id = current_user_id
    and run_sheet.status = 'planned'
    and run_sheet.version = expected_version_value
  returning run_sheet.*
  into saved_run_sheet;

  if not found then
    raise exception
      'The Event Run Sheet changed on another device. Reload before saving.'
      using errcode = '40001';
  end if;

  return saved_run_sheet;
end;
$$;

create or replace function public.start_creator_event_run_sheet(
  run_sheet_id_value uuid,
  expected_version_value bigint,
  expected_actor_id_value uuid
)
returns public.creator_event_run_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_run_sheet public.creator_event_run_sheets%rowtype;
  target_collection_title text;
  source_count integer;
  source_min_position integer;
  source_max_position integer;
  source_distinct_scenes integer;
  snapshot_count integer;
  started_run_sheet public.creator_event_run_sheets%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if run_sheet_id_value is null
    or expected_version_value is null
    or expected_version_value < 1
  then
    raise exception
      'A valid Event Run Sheet and expected version are required.'
      using errcode = '22023';
  end if;

  select run_sheet.*
  into target_run_sheet
  from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = run_sheet_id_value
  for update;

  if not found
    or target_run_sheet.owner_id <> current_user_id
  then
    raise exception
      'This Event Run Sheet is unavailable.'
      using errcode = 'P0002';
  end if;

  if target_run_sheet.status <> 'planned' then
    raise exception
      'Only a planned Event Run Sheet can be started.'
      using errcode = '22023';
  end if;

  if target_run_sheet.version <> expected_version_value then
    raise exception
      'The Event Run Sheet changed on another device. Reload before starting.'
      using errcode = '40001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      current_user_id::text
        || ':'
        || target_run_sheet.collection_id::text,
      0
    )
  );

  select collection.title
  into target_collection_title
  from public.creator_scene_collections as collection
  where collection.id = target_run_sheet.collection_id
    and collection.owner_id = current_user_id
  for update;

  if not found then
    raise exception
      'The source Scene collection is unavailable.'
      using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    min(collection_item.position),
    max(collection_item.position),
    count(distinct collection_item.scene_id)::integer
  into
    source_count,
    source_min_position,
    source_max_position,
    source_distinct_scenes
  from public.creator_scene_collection_items as collection_item
  where collection_item.owner_id = current_user_id
    and collection_item.collection_id = target_run_sheet.collection_id;

  if source_count not between 1 and 50
    or source_min_position <> 0
    or source_max_position <> source_count - 1
    or source_distinct_scenes <> source_count
  then
    raise exception
      'The Scene collection must contain 1 to 50 uniquely ordered Scenes.'
      using errcode = '22023';
  end if;

  perform scene.id
  from public.creator_scene_collection_items as collection_item
  join public.scenes as scene
    on scene.user_id = collection_item.owner_id
   and scene.id = collection_item.scene_id
  where collection_item.owner_id = current_user_id
    and collection_item.collection_id = target_run_sheet.collection_id
  order by
    collection_item.position,
    scene.id
  for share of collection_item, scene;

  if (
    select count(*)::integer
    from public.creator_scene_collection_items as collection_item
    join public.scenes as scene
      on scene.user_id = collection_item.owner_id
     and scene.id = collection_item.scene_id
    where collection_item.owner_id = current_user_id
      and collection_item.collection_id = target_run_sheet.collection_id
      and scene.deleted_at is null
      and scene.revision > 0
      and coalesce(
        scene.payload ->> 'libraryType',
        'created'
      ) <> 'saved'
  ) <> source_count
  then
    raise exception
      'Every frozen item must be an available owner-authored Scene.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.creator_event_run_sheet_items as frozen_item
    where frozen_item.run_sheet_id = target_run_sheet.id
  ) then
    raise exception
      'The Event Run Sheet already has frozen items.'
      using errcode = '40001';
  end if;

  insert into public.creator_event_run_sheet_items (
    run_sheet_id,
    owner_id,
    scene_id,
    scene_revision,
    position,
    scene_title,
    activity_label,
    duration_label,
    track_count
  )
  select
    target_run_sheet.id,
    target_run_sheet.owner_id,
    collection_item.scene_id,
    scene.revision,
    collection_item.position,
    left(
      coalesce(
        nullif(
          trim(
            regexp_replace(
              coalesce(scene.payload ->> 'name', ''),
              '[[:cntrl:]]',
              ' ',
              'g'
            )
          ),
          ''
        ),
        'Untitled Scene'
      ),
      120
    ),
    left(
      coalesce(
        nullif(
          trim(
            regexp_replace(
              coalesce(scene.payload ->> 'activity', ''),
              '[[:cntrl:]]',
              ' ',
              'g'
            )
          ),
          ''
        ),
        'Any activity'
      ),
      120
    ),
    left(
      coalesce(
        nullif(
          trim(
            regexp_replace(
              coalesce(scene.payload ->> 'duration', ''),
              '[[:cntrl:]]',
              ' ',
              'g'
            )
          ),
          ''
        ),
        'Duration not set'
      ),
      80
    ),
    least(
      case
        when jsonb_typeof(scene.payload -> 'tracks') = 'array'
        then jsonb_array_length(scene.payload -> 'tracks')
        else 0
      end,
      500
    )
  from public.creator_scene_collection_items as collection_item
  join public.scenes as scene
    on scene.user_id = collection_item.owner_id
   and scene.id = collection_item.scene_id
  where collection_item.owner_id = current_user_id
    and collection_item.collection_id = target_run_sheet.collection_id
  order by collection_item.position;

  get diagnostics snapshot_count = row_count;

  if snapshot_count <> source_count then
    raise exception
      'Canal could not freeze the complete Scene collection.'
      using errcode = '40001';
  end if;

  update public.creator_event_run_sheets as run_sheet
  set
    status = 'running',
    active_position = 0,
    source_collection_title = left(
      trim(target_collection_title),
      80
    ),
    started_at = now(),
    completed_at = null,
    version = target_run_sheet.version + 1
  where run_sheet.id = target_run_sheet.id
    and run_sheet.owner_id = current_user_id
    and run_sheet.status = 'planned'
    and run_sheet.version = expected_version_value
  returning run_sheet.*
  into started_run_sheet;

  if not found then
    raise exception
      'The Event Run Sheet changed while its Scenes were frozen.'
      using errcode = '40001';
  end if;

  return started_run_sheet;
exception
  when unique_violation then
    raise exception
      'Another Event Run Sheet is already running for this Scene collection.'
      using errcode = '40001';
end;
$$;

create or replace function public.advance_creator_event_run_sheet(
  run_sheet_id_value uuid,
  expected_position_value integer,
  expected_version_value bigint,
  expected_actor_id_value uuid
)
returns public.creator_event_run_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_run_sheet public.creator_event_run_sheets%rowtype;
  final_position integer;
  advanced_run_sheet public.creator_event_run_sheets%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if run_sheet_id_value is null
    or expected_position_value is null
    or expected_position_value < 0
    or expected_version_value is null
    or expected_version_value < 1
  then
    raise exception
      'A valid Event Run Sheet, position, and version are required.'
      using errcode = '22023';
  end if;

  select run_sheet.*
  into target_run_sheet
  from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = run_sheet_id_value
  for update;

  if not found
    or target_run_sheet.owner_id <> current_user_id
  then
    raise exception
      'This Event Run Sheet is unavailable.'
      using errcode = 'P0002';
  end if;

  if target_run_sheet.status <> 'running' then
    raise exception
      'Only a running Event Run Sheet can advance.'
      using errcode = '22023';
  end if;

  if target_run_sheet.active_position <> expected_position_value
    or target_run_sheet.version <> expected_version_value
  then
    raise exception
      'The Event Run Sheet changed on another device. Reload before advancing.'
      using errcode = '40001';
  end if;

  select max(frozen_item.position)
  into final_position
  from public.creator_event_run_sheet_items as frozen_item
  where frozen_item.run_sheet_id = target_run_sheet.id
    and frozen_item.owner_id = current_user_id;

  if final_position is null
    or target_run_sheet.active_position >= final_position
  then
    raise exception
      'The final Scene is current. Complete the Event Run Sheet instead.'
      using errcode = '22023';
  end if;

  update public.creator_event_run_sheets as run_sheet
  set
    active_position = target_run_sheet.active_position + 1,
    version = target_run_sheet.version + 1
  where run_sheet.id = target_run_sheet.id
    and run_sheet.owner_id = current_user_id
    and run_sheet.status = 'running'
    and run_sheet.active_position = expected_position_value
    and run_sheet.version = expected_version_value
  returning run_sheet.*
  into advanced_run_sheet;

  if not found then
    raise exception
      'The Event Run Sheet changed on another device. Reload before advancing.'
      using errcode = '40001';
  end if;

  return advanced_run_sheet;
end;
$$;

create or replace function public.complete_creator_event_run_sheet(
  run_sheet_id_value uuid,
  expected_position_value integer,
  expected_version_value bigint,
  expected_actor_id_value uuid
)
returns public.creator_event_run_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_run_sheet public.creator_event_run_sheets%rowtype;
  final_position integer;
  completed_run_sheet public.creator_event_run_sheets%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if run_sheet_id_value is null
    or expected_position_value is null
    or expected_position_value < 0
    or expected_version_value is null
    or expected_version_value < 1
  then
    raise exception
      'A valid Event Run Sheet, position, and version are required.'
      using errcode = '22023';
  end if;

  select run_sheet.*
  into target_run_sheet
  from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = run_sheet_id_value
  for update;

  if not found
    or target_run_sheet.owner_id <> current_user_id
  then
    raise exception
      'This Event Run Sheet is unavailable.'
      using errcode = 'P0002';
  end if;

  if target_run_sheet.status <> 'running' then
    raise exception
      'Only a running Event Run Sheet can be completed.'
      using errcode = '22023';
  end if;

  if target_run_sheet.active_position <> expected_position_value
    or target_run_sheet.version <> expected_version_value
  then
    raise exception
      'The Event Run Sheet changed on another device. Reload before completing.'
      using errcode = '40001';
  end if;

  select max(frozen_item.position)
  into final_position
  from public.creator_event_run_sheet_items as frozen_item
  where frozen_item.run_sheet_id = target_run_sheet.id
    and frozen_item.owner_id = current_user_id;

  if final_position is null
    or target_run_sheet.active_position <> final_position
  then
    raise exception
      'Advance to the final frozen Scene before completing the Event Run Sheet.'
      using errcode = '22023';
  end if;

  update public.creator_event_run_sheets as run_sheet
  set
    status = 'completed',
    completed_at = now(),
    version = target_run_sheet.version + 1
  where run_sheet.id = target_run_sheet.id
    and run_sheet.owner_id = current_user_id
    and run_sheet.status = 'running'
    and run_sheet.active_position = expected_position_value
    and run_sheet.version = expected_version_value
  returning run_sheet.*
  into completed_run_sheet;

  if not found then
    raise exception
      'The Event Run Sheet changed on another device. Reload before completing.'
      using errcode = '40001';
  end if;

  return completed_run_sheet;
end;
$$;

create or replace function public.delete_creator_event_run_sheet(
  run_sheet_id_value uuid,
  expected_version_value bigint,
  expected_actor_id_value uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_run_sheet public.creator_event_run_sheets%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if run_sheet_id_value is null
    or expected_version_value is null
    or expected_version_value < 1
  then
    raise exception
      'A valid Event Run Sheet and expected version are required.'
      using errcode = '22023';
  end if;

  select run_sheet.*
  into target_run_sheet
  from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = run_sheet_id_value
  for update;

  if not found
    or target_run_sheet.owner_id <> current_user_id
  then
    raise exception
      'This Event Run Sheet is unavailable.'
      using errcode = 'P0002';
  end if;

  if target_run_sheet.status <> 'planned' then
    raise exception
      'Started and completed Event Run Sheets are retained and cannot be deleted.'
      using errcode = '22023';
  end if;

  if target_run_sheet.version <> expected_version_value then
    raise exception
      'The Event Run Sheet changed on another device. Reload before deleting.'
      using errcode = '40001';
  end if;

  delete from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = target_run_sheet.id
    and run_sheet.owner_id = current_user_id
    and run_sheet.status = 'planned'
    and run_sheet.version = expected_version_value;

  if not found then
    raise exception
      'The Event Run Sheet changed on another device. Reload before deleting.'
      using errcode = '40001';
  end if;

  return true;
end;
$$;

revoke all
on function public.save_creator_event_run_sheet(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text,
  bigint,
  uuid
)
from public, anon, authenticated, service_role;

revoke all
on function public.start_creator_event_run_sheet(
  uuid,
  bigint,
  uuid
)
from public, anon, authenticated, service_role;

revoke all
on function public.advance_creator_event_run_sheet(
  uuid,
  integer,
  bigint,
  uuid
)
from public, anon, authenticated, service_role;

revoke all
on function public.complete_creator_event_run_sheet(
  uuid,
  integer,
  bigint,
  uuid
)
from public, anon, authenticated, service_role;

revoke all
on function public.delete_creator_event_run_sheet(
  uuid,
  bigint,
  uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.save_creator_event_run_sheet(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text,
  bigint,
  uuid
)
to authenticated;

grant execute
on function public.start_creator_event_run_sheet(
  uuid,
  bigint,
  uuid
)
to authenticated;

grant execute
on function public.advance_creator_event_run_sheet(
  uuid,
  integer,
  bigint,
  uuid
)
to authenticated;

grant execute
on function public.complete_creator_event_run_sheet(
  uuid,
  integer,
  bigint,
  uuid
)
to authenticated;

grant execute
on function public.delete_creator_event_run_sheet(
  uuid,
  bigint,
  uuid
)
to authenticated;

commit;
