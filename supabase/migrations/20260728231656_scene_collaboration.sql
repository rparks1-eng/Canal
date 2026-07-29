begin;

alter table public.scenes
add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scenes_revision_positive'
      and conrelid = 'public.scenes'::regclass
  ) then
    alter table public.scenes
    add constraint scenes_revision_positive
    check (revision > 0);
  end if;
end;
$$;

/*
 * Every write advances the database revision, including legacy owner
 * upserts that do not yet send a revision column. The CAS RPC supplies
 * old + 1 itself; ordinary updates retain the old value and are bumped
 * here. Arbitrary revision jumps are rejected.
 */
create or replace function public.stamp_canal_scene_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payload_revision_text text;
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception
        'A new Scene must start at revision 1.'
        using errcode = '22023';
    end if;
  else
    if new.revision = old.revision
      and exists (
        select 1
        from public.scene_collaborators as collaboration
        where collaboration.scene_owner_id = old.user_id
          and collaboration.scene_id = old.id
      )
    then
      payload_revision_text :=
        new.payload ->> 'revision';

      if payload_revision_text is null
        or payload_revision_text !~ '^[1-9][0-9]*$'
        or payload_revision_text::bigint <> old.revision
      then
        raise exception
          'SCENE_REVISION_CONFLICT'
          using
            errcode = '40001',
            detail = format(
              'expected=%s current=%s',
              coalesce(
                payload_revision_text,
                'missing'
              ),
              old.revision
            );
      end if;
    end if;

    if new.revision = old.revision then
      new.revision :=
        old.revision + 1;
    elsif new.revision <> old.revision + 1 then
      raise exception
        'A Scene revision must advance by exactly one.'
        using errcode = '22023';
    end if;
  end if;

  new.updated_at :=
    now();

  new.payload :=
    coalesce(
      new.payload,
      '{}'::jsonb
    )
    || jsonb_build_object(
      'id',
      new.id,
      'ownerId',
      new.user_id::text,
      'revision',
      new.revision,
      'updatedAt',
      new.updated_at
    );

  return new;
end;
$$;

drop trigger if exists scenes_stamp_revision
on public.scenes;

create trigger scenes_stamp_revision
before insert or update
on public.scenes
for each row
execute function public.stamp_canal_scene_revision();

revoke all
on function public.stamp_canal_scene_revision()
from public, anon, authenticated, service_role;

create table if not exists public.scene_collaborators (
  scene_owner_id uuid not null,
  scene_id text not null,
  collaborator_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (
    scene_owner_id,
    scene_id,
    collaborator_id
  ),
  constraint scene_collaborators_scene_fkey
    foreign key (
      scene_owner_id,
      scene_id
    )
    references public.scenes (
      user_id,
      id
    )
    on delete cascade,
  constraint scene_collaborators_status_check
    check (
      status in (
        'pending',
        'accepted',
        'declined',
        'revoked'
      )
    ),
  constraint scene_collaborators_not_self
    check (scene_owner_id <> collaborator_id),
  constraint scene_collaborators_inviter_is_owner
    check (invited_by = scene_owner_id)
);

create index if not exists scene_collaborators_collaborator_status_index
on public.scene_collaborators (
  collaborator_id,
  status,
  updated_at desc
);

create index if not exists scene_collaborators_scene_status_index
on public.scene_collaborators (
  scene_owner_id,
  scene_id,
  status
);

/*
 * Existing Scenes predate payload revisions. With the membership table
 * now available and still empty, this trigger-backed update stamps a
 * canonical revision into each legacy payload before invitations exist.
 */
update public.scenes
set payload =
  coalesce(
    payload,
    '{}'::jsonb
  )
where payload ->> 'revision' is null;

alter table public.scene_collaborators
enable row level security;

drop policy if exists "Scene owners and invitees can read collaborations"
on public.scene_collaborators;

create policy "Scene owners and invitees can read collaborations"
on public.scene_collaborators
for select
to authenticated
using (
  (select auth.uid()) = scene_owner_id
  or
  (select auth.uid()) = collaborator_id
);

revoke all
on public.scene_collaborators
from public, anon, authenticated;

grant select
on public.scene_collaborators
to authenticated;

create or replace function public.invite_scene_collaborator(
  scene_owner_id_value uuid,
  scene_id_value text,
  collaborator_handle_value text
)
returns public.scene_collaborators
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  normalized_handle text;
  target_user_id uuid;
  collaboration_row public.scene_collaborators%rowtype;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to invite a Scene collaborator.'
      using errcode = '42501';
  end if;

  if scene_owner_id_value is distinct from current_user_id then
    raise exception
      'Only the Scene owner can invite collaborators.'
      using errcode = '42501';
  end if;

  if scene_id_value is null
    or length(trim(scene_id_value)) = 0
  then
    raise exception
      'A Scene ID is required.'
      using errcode = '22023';
  end if;

  normalized_handle :=
    lower(
      regexp_replace(
        trim(
          coalesce(
            collaborator_handle_value,
            ''
          )
        ),
        '^@+',
        ''
      )
    );

  if length(normalized_handle) not between 3 and 24 then
    raise exception
      'Enter a valid Canal handle.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.scenes as scene
    where scene.user_id = current_user_id
      and scene.id = scene_id_value
      and scene.deleted_at is null
      and coalesce(
        scene.payload ->> 'libraryType',
        'created'
      ) <> 'saved'
  ) then
    raise exception
      'The Scene is unavailable or cannot be shared for collaboration.'
      using errcode = 'P0002';
  end if;

  select profile.id
  into target_user_id
  from public.profiles as profile
  where lower(profile.handle) = normalized_handle
  limit 1;

  if target_user_id is null then
    raise exception
      'The collaborator is unavailable.'
      using errcode = 'P0002';
  end if;

  if target_user_id = current_user_id then
    raise exception
      'A Scene owner cannot invite themselves.'
      using errcode = '22023';
  end if;

  if private.canal_users_are_blocked(
    current_user_id,
    target_user_id
  )
  or private.canal_users_are_blocked(
    target_user_id,
    current_user_id
  ) then
    raise exception
      'The collaborator is unavailable.'
      using errcode = '42501';
  end if;

  insert into public.scene_collaborators (
    scene_owner_id,
    scene_id,
    collaborator_id,
    status,
    invited_by,
    created_at,
    updated_at,
    responded_at
  )
  values (
    current_user_id,
    scene_id_value,
    target_user_id,
    'pending',
    current_user_id,
    now(),
    now(),
    null
  )
  on conflict (
    scene_owner_id,
    scene_id,
    collaborator_id
  )
  do update
  set
    status = case
      when scene_collaborators.status = 'accepted'
        then 'accepted'
      else 'pending'
    end,
    invited_by = excluded.invited_by,
    updated_at = excluded.updated_at,
    responded_at = case
      when scene_collaborators.status = 'accepted'
        then scene_collaborators.responded_at
      else null
    end
  returning *
  into collaboration_row;

  return collaboration_row;
end;
$$;

create or replace function public.respond_to_scene_collaboration(
  scene_owner_id_value uuid,
  scene_id_value text,
  response_value text
)
returns public.scene_collaborators
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  normalized_response text :=
    lower(
      trim(
        coalesce(
          response_value,
          ''
        )
      )
    );
  collaboration_row public.scene_collaborators%rowtype;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to respond to a Scene collaboration.'
      using errcode = '42501';
  end if;

  if normalized_response not in (
    'accepted',
    'declined'
  ) then
    raise exception
      'A collaboration response must be accepted or declined.'
      using errcode = '22023';
  end if;

  if normalized_response = 'accepted'
    and (
      private.canal_users_are_blocked(
        scene_owner_id_value,
        current_user_id
      )
      or private.canal_users_are_blocked(
        current_user_id,
        scene_owner_id_value
      )
    )
  then
    raise exception
      'This collaboration is unavailable.'
      using errcode = '42501';
  end if;

  update public.scene_collaborators
  set
    status = normalized_response,
    updated_at = now(),
    responded_at = now()
  where scene_owner_id = scene_owner_id_value
    and scene_id = scene_id_value
    and collaborator_id = current_user_id
    and status = 'pending'
  returning *
  into collaboration_row;

  if not found then
    raise exception
      'The pending Scene collaboration was not found.'
      using errcode = 'P0002';
  end if;

  return collaboration_row;
end;
$$;

create or replace function public.revoke_scene_collaborator(
  scene_owner_id_value uuid,
  scene_id_value text,
  collaborator_id_value uuid
)
returns public.scene_collaborators
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  collaboration_row public.scene_collaborators%rowtype;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to revoke a Scene collaborator.'
      using errcode = '42501';
  end if;

  if scene_owner_id_value is distinct from current_user_id then
    raise exception
      'Only the Scene owner can revoke collaborators.'
      using errcode = '42501';
  end if;

  update public.scene_collaborators
  set
    status = 'revoked',
    updated_at = now(),
    responded_at = now()
  where scene_owner_id = current_user_id
    and scene_id = scene_id_value
    and collaborator_id = collaborator_id_value
  returning *
  into collaboration_row;

  if not found then
    raise exception
      'The Scene collaboration was not found.'
      using errcode = 'P0002';
  end if;

  return collaboration_row;
end;
$$;

create or replace function public.update_collaborative_scene(
  scene_owner_id_value uuid,
  scene_id_value text,
  expected_revision_value bigint,
  scene_payload_value jsonb
)
returns public.scenes
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  current_scene public.scenes%rowtype;
  trusted_payload jsonb;
  allowed_payload jsonb;
  accepted_collaborators jsonb;
  next_revision bigint;
  next_updated_at timestamptz :=
    now();
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to update a collaborative Scene.'
      using errcode = '42501';
  end if;

  if scene_owner_id_value is null
    or scene_id_value is null
    or length(trim(scene_id_value)) = 0
    or expected_revision_value is null
    or expected_revision_value < 1
  then
    raise exception
      'A Scene owner, Scene ID, and positive expected revision are required.'
      using errcode = '22023';
  end if;

  if scene_payload_value is null
    or jsonb_typeof(scene_payload_value) <> 'object'
    or octet_length(scene_payload_value::text) > 262144
  then
    raise exception
      'The Scene payload must be an object no larger than 256 KiB.'
      using errcode = '22023';
  end if;

  if scene_payload_value ? 'id'
    and (
      scene_payload_value ->> 'id'
    ) is distinct from scene_id_value
  then
    raise exception
      'The Scene ID is immutable.'
      using errcode = '22023';
  end if;

  if scene_payload_value ? 'ownerId'
    and (
      scene_payload_value ->> 'ownerId'
    ) is distinct from scene_owner_id_value::text
  then
    raise exception
      'The Scene owner is immutable.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(
    scene_payload_value -> 'name'
  ) <> 'string'
    or length(
      trim(
        scene_payload_value ->> 'name'
      )
    ) not between 1 and 120
  then
    raise exception
      'A Scene name between 1 and 120 characters is required.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(
    scene_payload_value -> 'tracks'
  ) <> 'array'
    or jsonb_array_length(
      scene_payload_value -> 'tracks'
    ) > 200
  then
    raise exception
      'A collaborative Scene can contain at most 200 tracks.'
      using errcode = '22023';
  end if;

  select scene.*
  into current_scene
  from public.scenes as scene
  where scene.user_id = scene_owner_id_value
    and scene.id = scene_id_value
    and scene.deleted_at is null
  for update;

  if not found then
    raise exception
      'The collaborative Scene was not found.'
      using errcode = 'P0002';
  end if;

  if current_user_id <> scene_owner_id_value
    and not exists (
      select 1
      from public.scene_collaborators as collaboration
      where collaboration.scene_owner_id = scene_owner_id_value
        and collaboration.scene_id = scene_id_value
        and collaboration.collaborator_id = current_user_id
        and collaboration.status = 'accepted'
    )
  then
    raise exception
      'You do not have permission to update this collaborative Scene.'
      using errcode = '42501';
  end if;

  if current_user_id <> scene_owner_id_value
    and (
      private.canal_users_are_blocked(
        scene_owner_id_value,
        current_user_id
      )
      or private.canal_users_are_blocked(
        current_user_id,
        scene_owner_id_value
      )
    )
  then
    raise exception
      'This collaboration is unavailable.'
      using errcode = '42501';
  end if;

  if current_scene.revision <> expected_revision_value then
    raise exception
      'SCENE_REVISION_CONFLICT'
      using
        errcode = '40001',
        detail = format(
          'expected=%s current=%s',
          expected_revision_value,
          current_scene.revision
        );
  end if;

  select coalesce(
    jsonb_object_agg(entry.key, entry.value),
    '{}'::jsonb
  )
  into allowed_payload
  from jsonb_each(scene_payload_value) as entry
  where entry.key = any(
    array[
      'name',
      'activity',
      'duration',
      'emotions',
      'genres',
      'energy',
      'familiarity',
      'artists',
      'artistSelections',
      'songRequest',
      'avoid',
      'tracks'
    ]::text[]
  );

  if current_user_id = scene_owner_id_value
    and scene_payload_value ? 'visibility'
  then
    if (
      scene_payload_value ->> 'visibility'
    ) not in (
      'private',
      'public'
    ) then
      raise exception
        'Scene visibility must be private or public.'
        using errcode = '22023';
    end if;

    allowed_payload :=
      allowed_payload
      || jsonb_build_object(
        'visibility',
        scene_payload_value -> 'visibility'
      );
  end if;

  select coalesce(
    jsonb_agg(
      collaboration.collaborator_id::text
      order by collaboration.collaborator_id
    ),
    '[]'::jsonb
  )
  into accepted_collaborators
  from public.scene_collaborators as collaboration
  where collaboration.scene_owner_id = scene_owner_id_value
    and collaboration.scene_id = scene_id_value
    and collaboration.status = 'accepted';

  next_revision :=
    current_scene.revision + 1;

  trusted_payload :=
    current_scene.payload
    || allowed_payload
    || jsonb_build_object(
      'id',
      scene_id_value,
      'ownerId',
      scene_owner_id_value::text,
      'collaborators',
      accepted_collaborators,
      'revision',
      next_revision,
      'updatedAt',
      next_updated_at
    );

  if octet_length(trusted_payload::text) > 262144 then
    raise exception
      'The resulting Scene payload is larger than 256 KiB.'
      using errcode = '22023';
  end if;

  update public.scenes
  set
    payload = trusted_payload,
    revision = next_revision,
    updated_at = next_updated_at
  where user_id = scene_owner_id_value
    and id = scene_id_value
    and revision = expected_revision_value
    and deleted_at is null
  returning *
  into current_scene;

  if not found then
    raise exception
      'SCENE_REVISION_CONFLICT'
      using errcode = '40001';
  end if;

  return current_scene;
end;
$$;

revoke all
on function public.invite_scene_collaborator(uuid, text, text)
from public, anon, authenticated, service_role;

revoke all
on function public.respond_to_scene_collaboration(uuid, text, text)
from public, anon, authenticated, service_role;

revoke all
on function public.revoke_scene_collaborator(uuid, text, uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.update_collaborative_scene(uuid, text, bigint, jsonb)
from public, anon, authenticated, service_role;

grant execute
on function public.invite_scene_collaborator(uuid, text, text)
to authenticated;

grant execute
on function public.respond_to_scene_collaboration(uuid, text, text)
to authenticated;

grant execute
on function public.revoke_scene_collaborator(uuid, text, uuid)
to authenticated;

grant execute
on function public.update_collaborative_scene(uuid, text, bigint, jsonb)
to authenticated;

drop policy if exists "Users can update their own scenes"
on public.scenes;

create policy "Users can update their own scenes"
on public.scenes
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

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
  or (
    deleted_at is null
    and exists (
      select 1
      from public.scene_collaborators as collaboration
      where collaboration.scene_owner_id = scenes.user_id
        and collaboration.scene_id = scenes.id
        and collaboration.collaborator_id = (select auth.uid())
        and collaboration.status = 'accepted'
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

commit;
