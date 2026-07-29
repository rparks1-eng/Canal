begin;

/*
 * Trusted profile attributes.
 *
 * These columns are intentionally excluded from the authenticated
 * role's UPDATE grant below. Verification and Canal ownership must be
 * assigned by an administrator or trusted backend, never by the app.
 */
alter table public.profiles
add column if not exists is_verified boolean not null default false;

alter table public.profiles
add column if not exists is_canal boolean not null default false;

alter table public.profiles
add column if not exists verified_at timestamptz;

alter table public.profiles
add column if not exists verification_source text;

update public.profiles
set is_verified = true
where is_canal = true
  and is_verified = false;

update public.profiles
set
  verified_at = coalesce(
    verified_at,
    timezone('utc', now())
  ),
  verification_source = coalesce(
    nullif(
      trim(verification_source),
      ''
    ),
    'migration'
  )
where is_verified = true;

alter table public.profiles
drop constraint if exists profiles_canal_is_verified;

alter table public.profiles
add constraint profiles_canal_is_verified
check (is_canal = false or is_verified = true);

alter table public.profiles
drop constraint if exists profiles_display_name_length;

update public.profiles
set display_name = left(
  coalesce(
    nullif(trim(display_name), ''),
    'Canal Listener'
  ),
  60
)
where display_name is distinct from left(
  coalesce(
    nullif(trim(display_name), ''),
    'Canal Listener'
  ),
  60
);

alter table public.profiles
add constraint profiles_display_name_length
check (
  char_length(trim(display_name))
  between 1 and 60
);

alter table public.profiles
drop constraint if exists profiles_bio_length;

update public.profiles
set bio = left(
  coalesce(bio, ''),
  300
)
where bio is distinct from left(
  coalesce(bio, ''),
  300
);

alter table public.profiles
add constraint profiles_bio_length
check (char_length(bio) <= 300);

alter table public.profiles
drop constraint if exists profiles_favorite_activities_length;

update public.profiles
set favorite_activities = left(
  coalesce(favorite_activities, ''),
  300
)
where favorite_activities is distinct from left(
  coalesce(favorite_activities, ''),
  300
);

alter table public.profiles
add constraint profiles_favorite_activities_length
check (
  char_length(favorite_activities) <= 300
);

alter table public.profiles
drop constraint if exists profiles_verification_audit;

alter table public.profiles
add constraint profiles_verification_audit
check (
  is_verified = false
  or (
    verified_at is not null
    and length(
      trim(verification_source)
    ) between 1 and 80
  )
);

create or replace function public.handle_new_canal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_display_name text;
begin
  safe_display_name := left(
    coalesce(
      nullif(
        trim(
          new.raw_user_meta_data ->> 'display_name'
        ),
        ''
      ),
      nullif(
        trim(
          new.raw_user_meta_data ->> 'full_name'
        ),
        ''
      ),
      nullif(
        trim(
          split_part(
            coalesce(
              new.email,
              ''
            ),
            '@',
            1
          )
        ),
        ''
      ),
      'Canal Listener'
    ),
    60
  );

  insert into public.profiles (
    id,
    display_name,
    handle
  )
  values (
    new.id,
    safe_display_name,
    'canal_' ||
      substr(
        replace(
          new.id::text,
          '-',
          ''
        ),
        1,
        10
      )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all
on function public.handle_new_canal_user()
from public, anon, authenticated, service_role;

revoke insert, update, delete
on public.profiles
from authenticated;

revoke select
on public.profiles
from authenticated;

grant select (
  id,
  display_name,
  handle,
  avatar_url,
  bio,
  favorite_activities,
  is_public,
  is_verified,
  is_canal,
  created_at,
  updated_at
)
on public.profiles
to authenticated;

grant insert (
  id,
  display_name,
  handle,
  avatar_url,
  bio,
  favorite_activities,
  is_public,
  created_at,
  updated_at
)
on public.profiles
to authenticated;

grant update (
  id,
  display_name,
  handle,
  avatar_url,
  bio,
  favorite_activities,
  is_public,
  updated_at
)
on public.profiles
to authenticated;

/*
 * Resolve social relationships to stable profile IDs while retaining
 * target_username for compatibility with existing offline caches.
 */
alter table public.user_relationships
add column if not exists target_user_id uuid
references public.profiles(id)
on delete cascade;

update public.user_relationships as relationship
set target_user_id = target.id
from public.profiles as target
where relationship.target_user_id is null
  and lower(target.handle) =
    lower(relationship.target_username);

delete from public.user_relationships
where target_user_id = user_id;

delete from public.user_relationships
where relationship_type = 'following'
  and target_user_id is null;

with duplicate_relationships as (
  select
    ctid,
    row_number() over (
      partition by
        user_id,
        target_user_id
      order by
        created_at desc,
        target_username
    ) as duplicate_rank
  from public.user_relationships
  where target_user_id is not null
)
delete from public.user_relationships as relationship
using duplicate_relationships as duplicate
where relationship.ctid =
    duplicate.ctid
  and duplicate.duplicate_rank >
    1;

alter table public.user_relationships
drop constraint if exists user_relationships_not_self;

alter table public.user_relationships
add constraint user_relationships_not_self
check (
  target_user_id is null
  or target_user_id <> user_id
);

alter table public.user_relationships
drop constraint if exists user_relationships_follow_target_required;

alter table public.user_relationships
add constraint user_relationships_follow_target_required
check (
  relationship_type <> 'following'
  or target_user_id is not null
);

create unique index if not exists
user_relationships_owner_target_unique_index
on public.user_relationships (
  user_id,
  target_user_id
)
where target_user_id is not null;

create index if not exists
user_relationships_target_type_index
on public.user_relationships (
  target_user_id,
  relationship_type,
  created_at desc
)
where target_user_id is not null;

drop policy if exists "Users can read their own relationships"
on public.user_relationships;

drop policy if exists "Users can read profile follows"
on public.user_relationships;

create policy "Users can read profile follows"
on public.user_relationships
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (
    relationship_type = 'following'
    and target_user_id = (select auth.uid())
  )
  or (
    relationship_type = 'following'
    and exists (
      select 1
      from public.profiles as source_profile
      where source_profile.id = user_id
        and source_profile.is_public = true
    )
    and exists (
      select 1
      from public.profiles as target_profile
      where target_profile.id = target_user_id
        and target_profile.is_public = true
    )
  )
);

drop policy if exists "Users can create their own relationships"
on public.user_relationships;

create policy "Users can create their own relationships"
on public.user_relationships
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    relationship_type = 'blocked'
    or (
      target_user_id is not null
      and exists (
      select 1
      from public.profiles as target_profile
      where target_profile.id = target_user_id
        and target_profile.is_public = true
        and lower(target_profile.handle) =
          lower(target_username)
      )
    )
  )
);

drop policy if exists "Users can update their own relationships"
on public.user_relationships;

create policy "Users can update their own relationships"
on public.user_relationships
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
  and (
    relationship_type = 'blocked'
    or (
      target_user_id is not null
      and exists (
      select 1
      from public.profiles as target_profile
      where target_profile.id = target_user_id
        and target_profile.is_public = true
        and lower(target_profile.handle) =
          lower(target_username)
      )
    )
  )
);

create or replace function private.canal_users_are_blocked(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_relationships as relationship
    join public.profiles as target_profile
      on target_profile.id = second_user_id
    where relationship.user_id = first_user_id
      and relationship.relationship_type = 'blocked'
      and (
        relationship.target_user_id = second_user_id
        or (
          relationship.target_user_id is null
          and lower(
            relationship.target_username
          ) = lower(
            target_profile.handle
          )
        )
      )
  );
$$;

revoke all
on function private.canal_users_are_blocked(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute
on function private.canal_users_are_blocked(uuid, uuid)
to authenticated;

drop policy if exists "Authenticated users can read public profiles"
on public.profiles;

create policy "Authenticated users can read public profiles"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (
    is_public = true
    and not private.canal_users_are_blocked(
      (select auth.uid()),
      id
    )
    and not private.canal_users_are_blocked(
      id,
      (select auth.uid())
    )
  )
);

create or replace function private.can_access_live_stage(
  target_stage_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.live_stages as stage
      where stage.id = target_stage_id
        and not private.canal_users_are_blocked(
          (select auth.uid()),
          stage.host_id
        )
        and not private.canal_users_are_blocked(
          stage.host_id,
          (select auth.uid())
        )
        and (
          stage.visibility = 'public'
          or stage.host_id =
            (select auth.uid())
          or exists (
            select 1
            from public.live_stage_members as member
            where member.stage_id = stage.id
              and member.user_id =
                (select auth.uid())
          )
        )
    );
$$;

revoke all
on function private.can_access_live_stage(uuid)
from public, anon, authenticated, service_role;

grant execute
on function private.can_access_live_stage(uuid)
to authenticated;

drop policy if exists "Listeners can join public live Stages"
on public.live_stage_members;

create policy "Listeners can join public live Stages"
on public.live_stage_members
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and role = 'listener'
  and exists (
    select 1
    from public.live_stages as stage
    where stage.id =
        live_stage_members.stage_id
      and stage.status = 'live'
      and stage.visibility = 'public'
      and private.can_access_live_stage(
        stage.id
      )
  )
);

drop policy if exists "Members can send live Stage messages"
on public.live_stage_messages;

create policy "Members can send live Stage messages"
on public.live_stage_messages
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and private.can_access_live_stage(
    live_stage_messages.stage_id
  )
  and exists (
    select 1
    from public.live_stage_members as member
    join public.live_stages as stage
      on stage.id = member.stage_id
    where member.stage_id =
        live_stage_messages.stage_id
      and member.user_id =
        (select auth.uid())
      and stage.status = 'live'
  )
);

drop function if exists public.join_live_stage_by_code(text);

create or replace function public.join_live_stage_by_code(
  stage_code_value text,
  expected_stage_id uuid default null
)
returns setof public.live_stages
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  matched_stage_id uuid;
  matched_host_id uuid;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to join a Stage.'
      using errcode = '42501';
  end if;

  if not private.consume_live_stage_join_attempt(
    current_user_id
  ) then
    return;
  end if;

  if coalesce(stage_code_value, '') !~ '^[0-9]{6}$' then
    return;
  end if;

  select
    stage.id,
    stage.host_id
  into
    matched_stage_id,
    matched_host_id
  from public.live_stages as stage
  where stage.stage_code = stage_code_value
    and stage.status = 'live'
  for share;

  if matched_stage_id is null
    or (
      expected_stage_id is not null
      and expected_stage_id <>
        matched_stage_id
    )
    or private.canal_users_are_blocked(
      current_user_id,
      matched_host_id
    )
    or private.canal_users_are_blocked(
      matched_host_id,
      current_user_id
    ) then
    return;
  end if;

  insert into public.live_stage_members (
    stage_id,
    user_id,
    role
  )
  values (
    matched_stage_id,
    current_user_id,
    'listener'
  )
  on conflict (stage_id, user_id)
  do nothing;

  return query
  select stage.*
  from public.live_stages as stage
  where stage.id = matched_stage_id;
end;
$$;

revoke all
on function public.join_live_stage_by_code(text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.join_live_stage_by_code(text, uuid)
to authenticated;

/*
 * A private profile hides its public artifacts, and a block hides the
 * blocked creator even when an old direct Scene or Snapshot link exists.
 */
drop policy if exists "Authenticated users can read own or public scenes"
on public.scenes;

create policy "Authenticated users can read own or public scenes"
on public.scenes
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (
    deleted_at is null
    and coalesce(
      payload ->> 'visibility',
      'private'
    ) = 'public'
    and exists (
      select 1
      from public.profiles as owner_profile
      where owner_profile.id = user_id
        and owner_profile.is_public = true
    )
    and not private.canal_users_are_blocked(
      (select auth.uid()),
      scenes.user_id
    )
    and not private.canal_users_are_blocked(
      scenes.user_id,
      (select auth.uid())
    )
  )
);

drop policy if exists "Authenticated users can read own or public Snapshots"
on public.snapshots;

create policy "Authenticated users can read own or public Snapshots"
on public.snapshots
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    (select auth.uid()) = user_id
    or (
      visibility = 'public'
      and exists (
        select 1
        from public.profiles as owner_profile
        where owner_profile.id = user_id
          and owner_profile.is_public = true
      )
      and not private.canal_users_are_blocked(
        (select auth.uid()),
        snapshots.user_id
      )
      and not private.canal_users_are_blocked(
        snapshots.user_id,
        (select auth.uid())
      )
    )
  )
);

/*
 * Successful Spotify exports are profile-owned history. This gives the
 * user a durable way to revisit playlists created from their own or a
 * saved public Scene without exposing Spotify account data to others.
 */
create table if not exists public.scene_playlist_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  source_owner_id uuid
    references public.profiles(id)
    on delete set null,
  source_scene_id text not null,
  scene_name text not null,
  spotify_playlist_id text not null,
  spotify_playlist_url text,
  track_count integer not null,
  created_at timestamptz not null
    default timezone('utc', now()),
  constraint scene_playlist_exports_scene_id_not_blank
    check (length(trim(source_scene_id)) > 0),
  constraint scene_playlist_exports_scene_name_length
    check (char_length(trim(scene_name)) between 1 and 120),
  constraint scene_playlist_exports_spotify_id_not_blank
    check (length(trim(spotify_playlist_id)) > 0),
  constraint scene_playlist_exports_track_count_positive
    check (track_count > 0),
  constraint scene_playlist_exports_spotify_url
    check (
      spotify_playlist_url is null
      or spotify_playlist_url ~
        '^https://open[.]spotify[.]com/playlist/'
    ),
  unique (user_id, spotify_playlist_id)
);

create index if not exists
scene_playlist_exports_user_created_index
on public.scene_playlist_exports (
  user_id,
  created_at desc
);

alter table public.scene_playlist_exports
enable row level security;

drop policy if exists "Users can read their playlist exports"
on public.scene_playlist_exports;

create policy "Users can read their playlist exports"
on public.scene_playlist_exports
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists "Users can record their playlist exports"
on public.scene_playlist_exports;

create policy "Users can record their playlist exports"
on public.scene_playlist_exports
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

drop policy if exists "Users can update their playlist exports"
on public.scene_playlist_exports;

create policy "Users can update their playlist exports"
on public.scene_playlist_exports
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

drop policy if exists "Users can delete their playlist exports"
on public.scene_playlist_exports;

create policy "Users can delete their playlist exports"
on public.scene_playlist_exports
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

revoke all
on public.scene_playlist_exports
from anon;

grant select, insert, update, delete
on public.scene_playlist_exports
to authenticated;

/*
 * Saving and removing another creator's Scene must update the source
 * relationship and the user's private library copy in one transaction.
 */
create or replace function public.save_public_scene_to_library(
  source_owner_id_value uuid,
  source_scene_id_value text,
  saved_copy_id_value text,
  saved_copy_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  source_payload jsonb;
  existing_copy_payload jsonb;
  existing_copy_found boolean :=
    false;
  trusted_saved_copy_payload jsonb;
  saved_at timestamptz :=
    timezone('utc', now());
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to save a Scene.'
      using errcode = '42501';
  end if;

  if current_user_id = source_owner_id_value then
    raise exception
      'A creator cannot save their own Scene as a copy.'
      using errcode = '22023';
  end if;

  select source.payload
  into source_payload
  from public.scenes as source
  where source.user_id = source_owner_id_value
    and source.id = source_scene_id_value
    and source.deleted_at is null
    and coalesce(
      source.payload ->> 'visibility',
      'private'
    ) = 'public';

  if source_payload is null then
    raise exception
      'The source Scene is unavailable or private.'
      using errcode = 'P0002';
  end if;

  select copy.payload
  into existing_copy_payload
  from public.scenes as copy
  where copy.user_id = current_user_id
    and copy.id = saved_copy_id_value;

  existing_copy_found :=
    found;

  if existing_copy_found
    and (
      coalesce(
        existing_copy_payload ->> 'libraryType',
        ''
      ) <> 'saved'
      or (
        existing_copy_payload ->> 'sourceOwnerId'
      ) is distinct from source_owner_id_value::text
      or (
        existing_copy_payload ->> 'sourceSceneId'
      ) is distinct from source_scene_id_value
    )
  then
    raise exception
      'The saved Scene copy ID belongs to a different source Scene.'
      using errcode = '23505';
  end if;

  trusted_saved_copy_payload :=
    saved_copy_payload
    || jsonb_build_object(
      'id',
      saved_copy_id_value,
      'ownerId',
      current_user_id::text,
      'libraryType',
      'saved',
      'visibility',
      'private',
      'sourceOwnerId',
      source_owner_id_value::text,
      'sourceSceneId',
      source_scene_id_value
    );

  insert into public.saved_scenes (
    user_id,
    source_user_id,
    source_scene_id,
    payload,
    created_at
  )
  values (
    current_user_id,
    source_owner_id_value,
    source_scene_id_value,
    source_payload,
    saved_at
  )
  on conflict (
    user_id,
    source_user_id,
    source_scene_id
  )
  do update
  set
    payload = excluded.payload,
    created_at = excluded.created_at;

  insert into public.scenes (
    user_id,
    id,
    payload,
    created_at,
    updated_at,
    deleted_at
  )
  values (
    current_user_id,
    saved_copy_id_value,
    trusted_saved_copy_payload,
    saved_at,
    saved_at,
    null
  )
  on conflict (user_id, id)
  do update
  set
    payload = excluded.payload,
    updated_at = excluded.updated_at,
    deleted_at = null;
end;
$$;

revoke all
on function public.save_public_scene_to_library(
  uuid,
  text,
  text,
  jsonb
)
from public, anon;

grant execute
on function public.save_public_scene_to_library(
  uuid,
  text,
  text,
  jsonb
)
to authenticated;

create or replace function public.remove_saved_scene_from_library(
  source_owner_id_value uuid,
  source_scene_id_value text,
  saved_copy_id_value text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  existing_copy_payload jsonb;
  existing_copy_found boolean :=
    false;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to remove a saved Scene.'
      using errcode = '42501';
  end if;

  select copy.payload
  into existing_copy_payload
  from public.scenes as copy
  where copy.user_id = current_user_id
    and copy.id = saved_copy_id_value;

  existing_copy_found :=
    found;

  if existing_copy_found
    and (
      coalesce(
        existing_copy_payload ->> 'libraryType',
        ''
      ) <> 'saved'
      or (
        existing_copy_payload ->> 'sourceOwnerId'
      ) is distinct from source_owner_id_value::text
      or (
        existing_copy_payload ->> 'sourceSceneId'
      ) is distinct from source_scene_id_value
    )
  then
    raise exception
      'The saved Scene copy does not match the requested source Scene.'
      using errcode = '22023';
  end if;

  delete from public.saved_scenes
  where user_id = current_user_id
    and source_user_id = source_owner_id_value
    and source_scene_id = source_scene_id_value;

  delete from public.scenes
  where user_id = current_user_id
    and id = saved_copy_id_value
    and coalesce(
      payload ->> 'libraryType',
      ''
    ) = 'saved'
    and (
      payload ->> 'sourceOwnerId'
    ) = source_owner_id_value::text
    and (
      payload ->> 'sourceSceneId'
    ) = source_scene_id_value;
end;
$$;

revoke all
on function public.remove_saved_scene_from_library(
  uuid,
  text,
  text
)
from public, anon;

grant execute
on function public.remove_saved_scene_from_library(
  uuid,
  text,
  text
)
to authenticated;

/*
 * Live Stage provenance is derived from trusted profile flags by the
 * existing host-stamping trigger. App clients cannot claim that a room
 * is verified or Canal-generated.
 */
alter table public.live_stages
add column if not exists stage_kind text not null default 'community';

alter table public.live_stages
add column if not exists host_is_verified boolean not null default false;

alter table public.live_stages
add column if not exists host_is_canal boolean not null default false;

alter table public.live_stages
add column if not exists is_canal_generated boolean not null default false;

alter table public.live_stages
add column if not exists canal_generated_at timestamptz;

update public.live_stages
set canal_generated_at =
  timezone('utc', now())
where is_canal_generated = true
  and canal_generated_at is null;

update public.live_stages
set canal_generated_at =
  null
where is_canal_generated = false
  and canal_generated_at is not null;

alter table public.live_stages
drop constraint if exists live_stages_stage_kind_check;

alter table public.live_stages
add constraint live_stages_stage_kind_check
check (
  stage_kind in (
    'community',
    'verified',
    'canal'
  )
);

alter table public.live_stages
drop constraint if exists live_stages_canal_generation_audit;

alter table public.live_stages
add constraint live_stages_canal_generation_audit
check (
  is_canal_generated = false
  or canal_generated_at is not null
);

create index if not exists
live_stages_kind_status_updated_index
on public.live_stages (
  stage_kind,
  status,
  updated_at desc
)
where visibility = 'public';

create or replace function private.stamp_live_stage_host_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and (select auth.uid()) <> new.host_id then
    raise exception
      'A Stage host must match the signed-in user.'
      using errcode = '42501';
  end if;

  if new.is_canal_generated then
    if tg_op = 'INSERT' then
      new.canal_generated_at :=
        coalesce(
          new.canal_generated_at,
          timezone('utc', now())
        );
    else
      new.canal_generated_at :=
        coalesce(
          new.canal_generated_at,
          old.canal_generated_at,
          timezone('utc', now())
        );
    end if;
  else
    new.canal_generated_at :=
      null;
  end if;

  select
    coalesce(
      nullif(trim(profile.display_name), ''),
      'Canal Listener'
    ),
    profile.handle,
    profile.is_verified,
    profile.is_canal,
    case
      when new.is_canal_generated then 'canal'
      when profile.is_verified then 'verified'
      else 'community'
    end
  into
    new.host_display_name,
    new.host_handle,
    new.host_is_verified,
    new.host_is_canal,
    new.stage_kind
  from public.profiles as profile
  where profile.id = new.host_id;

  if new.host_handle is null then
    raise exception
      'The Stage host profile does not exist.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all
on function private.stamp_live_stage_host_profile()
from public, anon, authenticated, service_role;

drop trigger if exists live_stages_stamp_host_profile
on public.live_stages;

create trigger live_stages_stamp_host_profile
before insert or update of
  host_id,
  is_canal_generated,
  canal_generated_at
on public.live_stages
for each row
execute function private.stamp_live_stage_host_profile();

update public.live_stages as stage
set
  host_display_name = coalesce(
    nullif(trim(profile.display_name), ''),
    'Canal Listener'
  ),
  host_handle = profile.handle,
  host_is_verified = profile.is_verified,
  host_is_canal = profile.is_canal,
  stage_kind = case
    when stage.is_canal_generated then 'canal'
    when profile.is_verified then 'verified'
    else 'community'
  end
from public.profiles as profile
where profile.id = stage.host_id;

create or replace function private.sync_live_stage_host_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.live_stages
  set
    host_display_name = coalesce(
      nullif(trim(new.display_name), ''),
      'Canal Listener'
    ),
    host_handle = new.handle,
    host_is_verified = new.is_verified,
    host_is_canal = new.is_canal,
    stage_kind = case
      when live_stages.is_canal_generated then 'canal'
      when new.is_verified then 'verified'
      else 'community'
    end
  where host_id = new.id;

  return new;
end;
$$;

revoke all
on function private.sync_live_stage_host_profile()
from public, anon, authenticated, service_role;

drop trigger if exists profiles_sync_live_stage_host
on public.profiles;

create trigger profiles_sync_live_stage_host
after update of
  display_name,
  handle,
  is_verified,
  is_canal
on public.profiles
for each row
when (
  old.display_name is distinct from new.display_name
  or old.handle is distinct from new.handle
  or old.is_verified is distinct from new.is_verified
  or old.is_canal is distinct from new.is_canal
)
execute function private.sync_live_stage_host_profile();

commit;
