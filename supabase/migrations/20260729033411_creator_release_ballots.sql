begin;

/*
 * Release Ballots deliberately snapshot collection content instead of
 * referencing its mutable rows. A collection or Scene may later be edited or
 * deleted without rewriting an already opened ballot.
 */
create table if not exists public.creator_releases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null,
  title text not null,
  description text not null default '',
  status text not null default 'draft',
  opened_at timestamptz,
  closed_at timestamptz,
  winner_scene_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_releases_owner_id_id_unique
    unique (owner_id, id),
  constraint creator_releases_title_length
    check (
      char_length(trim(title))
      between 1 and 80
      and title !~ '[[:cntrl:]]'
    ),
  constraint creator_releases_description_length
    check (
      char_length(description) <= 500
      and description !~ '[[:cntrl:]]'
    ),
  constraint creator_releases_status_check
    check (
      status in (
        'draft',
        'open',
        'closed'
      )
    ),
  constraint creator_releases_timestamp_state_check
    check (
      (
        status = 'draft'
        and opened_at is null
        and closed_at is null
        and winner_scene_id is null
      )
      or (
        status = 'open'
        and opened_at is not null
        and closed_at is null
        and winner_scene_id is null
      )
      or (
        status = 'closed'
        and opened_at is not null
        and closed_at is not null
        and closed_at >= opened_at
      )
    )
);

create table if not exists public.creator_release_items (
  release_id uuid not null,
  owner_id uuid not null,
  scene_id text not null,
  scene_revision bigint not null,
  position integer not null,
  scene_title text not null,
  final_vote_count bigint,
  created_at timestamptz not null default now(),
  primary key (
    release_id,
    scene_id
  ),
  constraint creator_release_items_position_unique
    unique (
      release_id,
      position
    ),
  constraint creator_release_items_release_fkey
    foreign key (
      owner_id,
      release_id
    )
    references public.creator_releases (
      owner_id,
      id
    )
    on delete cascade,
  constraint creator_release_items_scene_id_length
    check (
      char_length(trim(scene_id))
      between 1 and 512
      and scene_id = trim(scene_id)
      and scene_id !~ '[[:cntrl:]]'
    ),
  constraint creator_release_items_revision_positive
    check (scene_revision > 0),
  constraint creator_release_items_position_bounded
    check (position between 0 and 49),
  constraint creator_release_items_title_length
    check (
      char_length(trim(scene_title))
      between 1 and 120
      and scene_title !~ '[[:cntrl:]]'
    ),
  constraint creator_release_items_final_vote_count_nonnegative
    check (
      final_vote_count is null
      or final_vote_count >= 0
    )
);

create table if not exists public.creator_release_contributors (
  release_id uuid not null,
  owner_id uuid not null,
  contributor_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  public_display_name text,
  public_handle text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    release_id,
    contributor_id
  ),
  constraint creator_release_contributors_release_fkey
    foreign key (
      owner_id,
      release_id
    )
    references public.creator_releases (
      owner_id,
      id
    )
    on delete cascade,
  constraint creator_release_contributors_not_owner
    check (owner_id <> contributor_id),
  constraint creator_release_contributors_status_check
    check (
      status in (
        'pending',
        'accepted',
        'declined'
      )
    ),
  constraint creator_release_contributors_response_state
    check (
      (
        status = 'pending'
        and responded_at is null
        and public_display_name is null
        and public_handle is null
      )
      or (
        status = 'declined'
        and responded_at is not null
        and public_display_name is null
        and public_handle is null
      )
      or (
        status = 'accepted'
        and responded_at is not null
        and public_display_name is not null
        and public_handle is not null
        and char_length(trim(public_display_name))
          between 1 and 60
        and public_display_name !~ '[[:cntrl:]]'
        and char_length(public_handle)
          between 3 and 24
        and public_handle ~ '^[a-z0-9_]+$'
      )
    )
);

create table if not exists public.creator_release_votes (
  release_id uuid not null,
  voter_id uuid not null references auth.users(id) on delete cascade,
  scene_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    release_id,
    voter_id
  ),
  constraint creator_release_votes_item_fkey
    foreign key (
      release_id,
      scene_id
    )
    references public.creator_release_items (
      release_id,
      scene_id
    )
    on delete cascade
);

create index if not exists creator_releases_owner_status_updated_index
on public.creator_releases (
  owner_id,
  status,
  updated_at desc
);

create index if not exists creator_releases_public_status_updated_index
on public.creator_releases (
  status,
  updated_at desc
)
where status in (
  'open',
  'closed'
);

create index if not exists creator_releases_collection_index
on public.creator_releases (
  collection_id,
  created_at desc
);

create index if not exists creator_release_items_owner_release_index
on public.creator_release_items (
  owner_id,
  release_id
);

create index if not exists creator_release_contributors_user_status_index
on public.creator_release_contributors (
  contributor_id,
  status,
  release_id
);

create index if not exists creator_release_contributors_owner_release_index
on public.creator_release_contributors (
  owner_id,
  release_id
);

create index if not exists creator_release_votes_release_scene_index
on public.creator_release_votes (
  release_id,
  scene_id
);

create index if not exists creator_release_votes_voter_release_index
on public.creator_release_votes (
  voter_id,
  release_id
);

create or replace function private.protect_creator_release()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
    or new.collection_id is distinct from old.collection_id
  then
    raise exception
      'Release ownership and collection provenance are immutable.'
      using errcode = '22023';
  end if;

  if new.status is distinct from old.status
    and not (
      (old.status = 'draft' and new.status = 'open')
      or (old.status = 'open' and new.status = 'closed')
    )
  then
    raise exception
      'A Release Ballot state transition is invalid.'
      using errcode = '22023';
  end if;

  if old.status <> 'draft'
    and (
      new.title is distinct from old.title
      or new.description is distinct from old.description
    )
  then
    raise exception
      'An opened Release Ballot is immutable.'
      using errcode = '22023';
  end if;

  if new.winner_scene_id is not null
    and not exists (
      select 1
      from public.creator_release_items as item
      where item.release_id = new.id
        and item.scene_id = new.winner_scene_id
    )
  then
    raise exception
      'A Release Ballot winner must be one of its frozen Scenes.'
      using errcode = '22023';
  end if;

  new.updated_at := now();

  return new;
end;
$$;

revoke all
on function private.protect_creator_release()
from public, anon, authenticated, service_role;

drop trigger if exists creator_releases_protect
on public.creator_releases;

create trigger creator_releases_protect
before update
on public.creator_releases
for each row
execute function private.protect_creator_release();

create or replace function private.protect_creator_release_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_release_id uuid :=
    case
      when tg_op = 'DELETE' then old.release_id
      else new.release_id
    end;
  release_status text;
begin
  if pg_trigger_depth() > 1 then
    return case
      when tg_op = 'DELETE' then old
      else new
    end;
  end if;

  if tg_op = 'UPDATE'
    and (
      new.release_id is distinct from old.release_id
      or new.owner_id is distinct from old.owner_id
      or new.scene_id is distinct from old.scene_id
    )
  then
    raise exception
      'A frozen Release Ballot Scene identity is immutable.'
      using errcode = '22023';
  end if;

  select release.status
  into release_status
  from public.creator_releases as release
  where release.id = target_release_id
  for key share;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if tg_op = 'UPDATE'
    and release_status = 'open'
    and (select auth.uid()) = old.owner_id
    and new.scene_revision is not distinct from old.scene_revision
    and new.position is not distinct from old.position
    and new.scene_title is not distinct from old.scene_title
    and new.created_at is not distinct from old.created_at
    and old.final_vote_count is null
    and new.final_vote_count is not null
  then
    return new;
  end if;

  if release_status <> 'draft' then
    raise exception
      'Opened Release Ballot Scenes are immutable.'
      using errcode = '22023';
  end if;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;

revoke all
on function private.protect_creator_release_item()
from public, anon, authenticated, service_role;

drop trigger if exists creator_release_items_protect
on public.creator_release_items;

create trigger creator_release_items_protect
before insert or update or delete
on public.creator_release_items
for each row
execute function private.protect_creator_release_item();

create or replace function private.protect_creator_release_contributor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_release_id uuid :=
    case
      when tg_op = 'DELETE' then old.release_id
      else new.release_id
    end;
  release_status text;
begin
  if pg_trigger_depth() > 1 then
    return case
      when tg_op = 'DELETE' then old
      else new
    end;
  end if;

  if tg_op = 'UPDATE'
    and (
      new.release_id is distinct from old.release_id
      or new.owner_id is distinct from old.owner_id
      or new.contributor_id is distinct from old.contributor_id
    )
  then
    raise exception
      'A Release Ballot contributor identity is immutable.'
      using errcode = '22023';
  end if;

  select release.status
  into release_status
  from public.creator_releases as release
  where release.id = target_release_id
  for key share;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if (
    tg_op = 'INSERT'
    and release_status <> 'draft'
  )
  or (
    tg_op = 'UPDATE'
    and release_status <> 'open'
  )
  or tg_op = 'DELETE'
  then
    raise exception
      'Release Ballot contributor credit is closed.'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;

revoke all
on function private.protect_creator_release_contributor()
from public, anon, authenticated, service_role;

drop trigger if exists creator_release_contributors_protect
on public.creator_release_contributors;

create trigger creator_release_contributors_protect
before insert or update or delete
on public.creator_release_contributors
for each row
execute function private.protect_creator_release_contributor();

create or replace function private.protect_creator_release_vote()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_release_id uuid :=
    case
      when tg_op = 'DELETE' then old.release_id
      else new.release_id
    end;
  target_voter_id uuid :=
    case
      when tg_op = 'DELETE' then old.voter_id
      else new.voter_id
    end;
  release_status text;
  release_owner_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return case
      when tg_op = 'DELETE' then old
      else new
    end;
  end if;

  if tg_op = 'UPDATE'
    and (
      new.release_id is distinct from old.release_id
      or new.voter_id is distinct from old.voter_id
    )
  then
    raise exception
      'A Release Ballot voter identity is immutable.'
      using errcode = '22023';
  end if;

  select
    release.status,
    release.owner_id
  into
    release_status,
    release_owner_id
  from public.creator_releases as release
  where release.id = target_release_id
  for key share;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if tg_op = 'DELETE'
    or release_status <> 'open'
  then
    raise exception
      'Release Ballot voting is closed.'
      using errcode = '22023';
  end if;

  if (select auth.uid()) is null
    or (select auth.uid()) <> target_voter_id
    or target_voter_id = release_owner_id
  then
    raise exception
      'This account cannot vote in the Release Ballot.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all
on function private.protect_creator_release_vote()
from public, anon, authenticated, service_role;

drop trigger if exists creator_release_votes_protect
on public.creator_release_votes;

create trigger creator_release_votes_protect
before insert or update or delete
on public.creator_release_votes
for each row
execute function private.protect_creator_release_vote();

alter table public.creator_releases
enable row level security;

alter table public.creator_release_items
enable row level security;

alter table public.creator_release_contributors
enable row level security;

alter table public.creator_release_votes
enable row level security;

drop policy if exists "Owners and eligible listeners can read creator releases"
on public.creator_releases;

create policy "Owners and eligible listeners can read creator releases"
on public.creator_releases
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (
    status in (
      'open',
      'closed'
    )
    and exists (
      select 1
      from public.profiles as owner_profile
      where owner_profile.id = creator_releases.owner_id
        and owner_profile.is_public = true
    )
    and not private.canal_users_are_blocked(
      (select auth.uid()),
      creator_releases.owner_id
    )
    and not private.canal_users_are_blocked(
      creator_releases.owner_id,
      (select auth.uid())
    )
  )
);

drop policy if exists "Owners and eligible listeners can read creator release items"
on public.creator_release_items;

create policy "Owners and eligible listeners can read creator release items"
on public.creator_release_items
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1
    from public.creator_releases as release
    join public.profiles as owner_profile
      on owner_profile.id = release.owner_id
     and owner_profile.is_public = true
    where release.id = creator_release_items.release_id
      and release.owner_id = creator_release_items.owner_id
      and release.status in (
        'open',
        'closed'
      )
      and not private.canal_users_are_blocked(
        (select auth.uid()),
        release.owner_id
      )
      and not private.canal_users_are_blocked(
        release.owner_id,
        (select auth.uid())
      )
  )
);

drop policy if exists "Private consent and accepted public creator release credits"
on public.creator_release_contributors;

create policy "Private consent and accepted public creator release credits"
on public.creator_release_contributors
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (
    (select auth.uid()) = contributor_id
    and exists (
      select 1
      from public.creator_releases as release
      join public.profiles as owner_profile
        on owner_profile.id = release.owner_id
       and owner_profile.is_public = true
      where release.id = creator_release_contributors.release_id
        and release.owner_id = creator_release_contributors.owner_id
        and release.status in (
          'open',
          'closed'
        )
        and not private.canal_users_are_blocked(
          (select auth.uid()),
          release.owner_id
        )
        and not private.canal_users_are_blocked(
          release.owner_id,
          (select auth.uid())
        )
    )
  )
  or (
    status = 'accepted'
    and public_display_name is not null
    and public_handle is not null
    and exists (
      select 1
      from public.creator_releases as release
      join public.profiles as owner_profile
        on owner_profile.id = release.owner_id
       and owner_profile.is_public = true
      where release.id = creator_release_contributors.release_id
        and release.owner_id = creator_release_contributors.owner_id
        and release.status in (
          'open',
          'closed'
        )
        and not private.canal_users_are_blocked(
          (select auth.uid()),
          release.owner_id
        )
        and not private.canal_users_are_blocked(
          release.owner_id,
          (select auth.uid())
        )
        and not private.canal_users_are_blocked(
          (select auth.uid()),
          creator_release_contributors.contributor_id
        )
        and not private.canal_users_are_blocked(
          creator_release_contributors.contributor_id,
          (select auth.uid())
        )
    )
  )
);

revoke all
on public.creator_releases
from public, anon, authenticated, service_role;

revoke all
on public.creator_release_items
from public, anon, authenticated, service_role;

revoke all
on public.creator_release_contributors
from public, anon, authenticated, service_role;

revoke all
on public.creator_release_votes
from public, anon, authenticated, service_role;

grant select
on public.creator_releases
to authenticated;

grant select
on public.creator_release_items
to authenticated;

grant select
on public.creator_release_contributors
to authenticated;

create or replace function public.create_creator_release(
  collection_id_value uuid,
  title_value text,
  description_value text,
  expected_actor_id_value uuid
)
returns public.creator_releases
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  normalized_title text :=
    trim(
      coalesce(
        title_value,
        ''
      )
    );
  normalized_description text :=
    trim(
      coalesce(
        description_value,
        ''
      )
    );
  collection_visibility text;
  saved_release public.creator_releases%rowtype;
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
    or char_length(normalized_description) > 500
    or normalized_title ~ '[[:cntrl:]]'
    or normalized_description ~ '[[:cntrl:]]'
  then
    raise exception
      'Release Ballot fields are invalid.'
      using errcode = '22023';
  end if;

  select collection.visibility
  into collection_visibility
  from public.creator_scene_collections as collection
  where collection.id = collection_id_value
    and collection.owner_id = current_user_id
  for share;

  if not found
    or collection_visibility <> 'public'
  then
    raise exception
      'The public Scene collection is unavailable.'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.creator_scene_collection_items as collection_item
    where collection_item.collection_id = collection_id_value
      and collection_item.owner_id = current_user_id
  ) then
    raise exception
      'A public Scene collection must contain at least one Scene.'
      using errcode = '22023';
  end if;

  insert into public.creator_releases (
    owner_id,
    collection_id,
    title,
    description
  )
  values (
    current_user_id,
    collection_id_value,
    normalized_title,
    normalized_description
  )
  returning *
  into saved_release;

  return saved_release;
end;
$$;

create or replace function public.open_creator_release(
  release_id_value uuid,
  expected_actor_id_value uuid
)
returns public.creator_releases
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_release public.creator_releases%rowtype;
  collection_visibility text;
  source_count integer;
  source_min_position integer;
  source_max_position integer;
  snapshot_count integer;
  opened_release public.creator_releases%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if release_id_value is null then
    raise exception
      'A Release Ballot ID is required.'
      using errcode = '22023';
  end if;

  select release.*
  into target_release
  from public.creator_releases as release
  where release.id = release_id_value
  for update;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if target_release.owner_id <> current_user_id then
    raise exception
      'Only the Release Ballot owner can open voting.'
      using errcode = '42501';
  end if;

  if target_release.status <> 'draft' then
    raise exception
      'Only a draft Release Ballot can be opened.'
      using errcode = '22023';
  end if;

  select collection.visibility
  into collection_visibility
  from public.creator_scene_collections as collection
  where collection.id = target_release.collection_id
    and collection.owner_id = current_user_id
  for update;

  if not found
    or collection_visibility <> 'public'
  then
    raise exception
      'The public Scene collection is unavailable.'
      using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    min(collection_item.position),
    max(collection_item.position)
  into
    source_count,
    source_min_position,
    source_max_position
  from public.creator_scene_collection_items as collection_item
  where collection_item.collection_id = target_release.collection_id
    and collection_item.owner_id = current_user_id;

  if source_count not between 1 and 50
    or source_min_position <> 0
    or source_max_position <> source_count - 1
  then
    raise exception
      'The public Scene collection order is invalid.'
      using errcode = '22023';
  end if;

  perform scene.id
  from public.creator_scene_collection_items as collection_item
  join public.scenes as scene
    on scene.user_id = collection_item.owner_id
   and scene.id = collection_item.scene_id
  where collection_item.collection_id = target_release.collection_id
    and collection_item.owner_id = current_user_id
  order by collection_item.position
  for share of collection_item, scene;

  if (
    select count(*)
    from public.creator_scene_collection_items as collection_item
    join public.scenes as scene
      on scene.user_id = collection_item.owner_id
     and scene.id = collection_item.scene_id
    where collection_item.collection_id = target_release.collection_id
      and collection_item.owner_id = current_user_id
      and scene.deleted_at is null
      and scene.revision > 0
      and coalesce(
        scene.payload ->> 'visibility',
        'private'
      ) = 'public'
      and coalesce(
        scene.payload ->> 'libraryType',
        'owned'
      ) <> 'saved'
  ) <> source_count
  then
    raise exception
      'Every frozen Release Ballot Scene must remain public and owner-authored.'
      using errcode = '22023';
  end if;

  insert into public.creator_release_items (
    release_id,
    owner_id,
    scene_id,
    scene_revision,
    position,
    scene_title
  )
  select
    target_release.id,
    target_release.owner_id,
    collection_item.scene_id,
    scene.revision,
    collection_item.position,
    left(
      coalesce(
        nullif(
          trim(
            regexp_replace(
              coalesce(
                scene.payload ->> 'name',
                ''
              ),
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
    )
  from public.creator_scene_collection_items as collection_item
  join public.scenes as scene
    on scene.user_id = collection_item.owner_id
   and scene.id = collection_item.scene_id
  where collection_item.collection_id = target_release.collection_id
    and collection_item.owner_id = current_user_id
  order by collection_item.position;

  get diagnostics snapshot_count = row_count;

  if snapshot_count <> source_count then
    raise exception
      'Canal could not freeze the complete Scene collection.'
      using errcode = '40001';
  end if;

  insert into public.creator_release_contributors (
    release_id,
    owner_id,
    contributor_id
  )
  select distinct
    target_release.id,
    target_release.owner_id,
    collaborator.collaborator_id
  from public.scene_collaborators as collaborator
  join public.creator_release_items as frozen_item
    on frozen_item.release_id = target_release.id
   and frozen_item.owner_id = collaborator.scene_owner_id
   and frozen_item.scene_id = collaborator.scene_id
  where collaborator.scene_owner_id = current_user_id
    and collaborator.status = 'accepted'
    and collaborator.collaborator_id <> current_user_id
    and not private.canal_users_are_blocked(
      current_user_id,
      collaborator.collaborator_id
    )
    and not private.canal_users_are_blocked(
      collaborator.collaborator_id,
      current_user_id
    )
  on conflict (
    release_id,
    contributor_id
  ) do nothing;

  update public.creator_releases as release
  set
    status = 'open',
    opened_at = now(),
    closed_at = null,
    winner_scene_id = null
  where release.id = target_release.id
    and release.owner_id = current_user_id
    and release.status = 'draft'
  returning release.*
  into opened_release;

  if not found then
    raise exception
      'The Release Ballot changed while voting opened.'
      using errcode = '40001';
  end if;

  return opened_release;
end;
$$;

create or replace function public.respond_creator_release_credit(
  release_id_value uuid,
  response_value text,
  expected_actor_id_value uuid
)
returns public.creator_release_contributors
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
  target_release public.creator_releases%rowtype;
  target_contributor public.creator_release_contributors%rowtype;
  snapshot_display_name text;
  snapshot_handle text;
  saved_contributor public.creator_release_contributors%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if release_id_value is null
    or normalized_response not in (
      'accepted',
      'declined'
    )
  then
    raise exception
      'Contributor credit response is invalid.'
      using errcode = '22023';
  end if;

  select release.*
  into target_release
  from public.creator_releases as release
  where release.id = release_id_value
  for update;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if target_release.status <> 'open' then
    raise exception
      'Release Ballot contributor credit is closed.'
      using errcode = '22023';
  end if;

  if target_release.owner_id = current_user_id then
    raise exception
      'The Release Ballot owner cannot claim contributor credit.'
      using errcode = '42501';
  end if;

  if private.canal_users_are_blocked(
    current_user_id,
    target_release.owner_id
  )
  or private.canal_users_are_blocked(
    target_release.owner_id,
    current_user_id
  )
  then
    raise exception
      'Contributor credit is unavailable because a Canal account is blocked.'
      using errcode = '42501';
  end if;

  select contributor.*
  into target_contributor
  from public.creator_release_contributors as contributor
  where contributor.release_id = target_release.id
    and contributor.owner_id = target_release.owner_id
    and contributor.contributor_id = current_user_id
  for update;

  if not found then
    raise exception
      'Contributor credit is unavailable.'
      using errcode = 'P0002';
  end if;

  if normalized_response = 'accepted' then
    select
      left(
        coalesce(
          nullif(
            trim(
              regexp_replace(
                profile.display_name,
                '[[:cntrl:]]',
                ' ',
                'g'
              )
            ),
            ''
          ),
          'Canal contributor'
        ),
        60
      ),
      lower(
        trim(
          profile.handle
        )
      )
    into
      snapshot_display_name,
      snapshot_handle
    from public.profiles as profile
    where profile.id = current_user_id
    for share;

    if not found
      or snapshot_handle !~ '^[a-z0-9_]{3,24}$'
    then
      raise exception
        'The contributor profile is unavailable.'
        using errcode = 'P0002';
    end if;
  else
    snapshot_display_name := null;
    snapshot_handle := null;
  end if;

  update public.creator_release_contributors as contributor
  set
    status = normalized_response,
    public_display_name = snapshot_display_name,
    public_handle = snapshot_handle,
    responded_at = now()
  where contributor.release_id = target_release.id
    and contributor.contributor_id = current_user_id
  returning contributor.*
  into saved_contributor;

  if not found then
    raise exception
      'Contributor credit changed while the response was saved.'
      using errcode = '40001';
  end if;

  return saved_contributor;
end;
$$;

create or replace function public.cast_creator_release_vote(
  release_id_value uuid,
  scene_id_value text,
  expected_actor_id_value uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  normalized_scene_id text :=
    trim(
      coalesce(
        scene_id_value,
        ''
      )
    );
  target_release public.creator_releases%rowtype;
  saved_scene_id text;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if release_id_value is null
    or char_length(normalized_scene_id)
      not between 1 and 512
    or normalized_scene_id ~ '[[:cntrl:]]'
  then
    raise exception
      'Release Ballot vote fields are invalid.'
      using errcode = '22023';
  end if;

  /*
   * close_creator_release takes this same lock before aggregating votes. A
   * concurrent vote therefore commits before closure or observes closed.
   */
  select release.*
  into target_release
  from public.creator_releases as release
  where release.id = release_id_value
  for update;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if target_release.status <> 'open' then
    raise exception
      'Release Ballot voting is closed.'
      using errcode = '22023';
  end if;

  if target_release.owner_id = current_user_id then
    raise exception
      'A Release Ballot owner cannot vote.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as owner_profile
    where owner_profile.id = target_release.owner_id
      and owner_profile.is_public = true
  )
  then
    raise exception
      'The Release Ballot is unavailable.'
      using errcode = '42501';
  end if;

  if private.canal_users_are_blocked(
    current_user_id,
    target_release.owner_id
  )
  or private.canal_users_are_blocked(
    target_release.owner_id,
    current_user_id
  )
  then
    raise exception
      'Voting is unavailable because a Canal account is blocked.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.creator_release_items as item
    where item.release_id = target_release.id
      and item.scene_id = normalized_scene_id
  )
  then
    raise exception
      'The selected Scene is not in this Release Ballot.'
      using errcode = '22023';
  end if;

  insert into public.creator_release_votes (
    release_id,
    voter_id,
    scene_id
  )
  values (
    target_release.id,
    current_user_id,
    normalized_scene_id
  )
  on conflict (
    release_id,
    voter_id
  )
  do update
  set
    scene_id = excluded.scene_id,
    updated_at = now()
  returning creator_release_votes.scene_id
  into saved_scene_id;

  return saved_scene_id;
end;
$$;

create or replace function public.close_creator_release(
  release_id_value uuid,
  expected_actor_id_value uuid
)
returns public.creator_releases
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_release public.creator_releases%rowtype;
  winning_scene_id text;
  closed_release public.creator_releases%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if release_id_value is null then
    raise exception
      'A Release Ballot ID is required.'
      using errcode = '22023';
  end if;

  select release.*
  into target_release
  from public.creator_releases as release
  where release.id = release_id_value
  for update;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if target_release.owner_id <> current_user_id then
    raise exception
      'Only the Release Ballot owner can close voting.'
      using errcode = '42501';
  end if;

  if target_release.status <> 'open' then
    raise exception
      'Only an open Release Ballot can be closed.'
      using errcode = '22023';
  end if;

  /*
   * A vote validly committed while access existed remains anonymous ballot
   * history. A later block prevents access and future vote changes but does
   * not let either account rewrite already committed aggregate history.
   */
  update public.creator_release_items as item
  set final_vote_count = (
    select count(*)::bigint
    from public.creator_release_votes as vote
    where vote.release_id = item.release_id
      and vote.scene_id = item.scene_id
  )
  where item.release_id = target_release.id
    and item.final_vote_count is null;

  select item.scene_id
  into winning_scene_id
  from public.creator_release_items as item
  where item.release_id = target_release.id
    and item.final_vote_count > 0
  order by
    item.final_vote_count desc,
    item.position asc,
    item.scene_id asc
  limit 1;

  update public.creator_releases as release
  set
    status = 'closed',
    closed_at = now(),
    winner_scene_id = winning_scene_id
  where release.id = target_release.id
    and release.owner_id = current_user_id
    and release.status = 'open'
  returning release.*
  into closed_release;

  if not found then
    raise exception
      'The Release Ballot changed while voting closed.'
      using errcode = '40001';
  end if;

  return closed_release;
end;
$$;

create or replace function public.read_my_creator_release_vote(
  release_id_value uuid,
  expected_actor_id_value uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_release public.creator_releases%rowtype;
  selected_scene_id text;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if release_id_value is null then
    raise exception
      'A Release Ballot ID is required.'
      using errcode = '22023';
  end if;

  select release.*
  into target_release
  from public.creator_releases as release
  where release.id = release_id_value;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if target_release.status <> 'open'
    or target_release.owner_id = current_user_id
    or not exists (
      select 1
      from public.profiles as owner_profile
      where owner_profile.id = target_release.owner_id
        and owner_profile.is_public = true
    )
  then
    raise exception
      'The Release Ballot vote is unavailable.'
      using errcode = '42501';
  end if;

  if private.canal_users_are_blocked(
    current_user_id,
    target_release.owner_id
  )
  or private.canal_users_are_blocked(
    target_release.owner_id,
    current_user_id
  )
  then
    raise exception
      'The Release Ballot vote is unavailable because a Canal account is blocked.'
      using errcode = '42501';
  end if;

  select vote.scene_id
  into selected_scene_id
  from public.creator_release_votes as vote
  where vote.release_id = target_release.id
    and vote.voter_id = current_user_id;

  return selected_scene_id;
end;
$$;

create or replace function public.read_creator_release_results(
  release_id_value uuid,
  expected_actor_id_value uuid
)
returns table (
  scene_id text,
  scene_revision bigint,
  "position" integer,
  scene_title text,
  vote_count bigint,
  is_winner boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_release public.creator_releases%rowtype;
begin
  if current_user_id is null
    or expected_actor_id_value is null
    or current_user_id <> expected_actor_id_value
  then
    raise exception
      'The signed-in Canal account changed.'
      using errcode = '42501';
  end if;

  if release_id_value is null then
    raise exception
      'A Release Ballot ID is required.'
      using errcode = '22023';
  end if;

  select release.*
  into target_release
  from public.creator_releases as release
  where release.id = release_id_value;

  if not found then
    raise exception
      'The Release Ballot was not found.'
      using errcode = 'P0002';
  end if;

  if target_release.status <> 'closed' then
    raise exception
      'Release Ballot results remain sealed until voting closes.'
      using errcode = '42501';
  end if;

  if target_release.owner_id <> current_user_id then
    if not exists (
      select 1
      from public.profiles as owner_profile
      where owner_profile.id = target_release.owner_id
        and owner_profile.is_public = true
    )
    then
      raise exception
        'The Release Ballot results are unavailable.'
        using errcode = '42501';
    end if;

    if private.canal_users_are_blocked(
      current_user_id,
      target_release.owner_id
    )
    or private.canal_users_are_blocked(
      target_release.owner_id,
      current_user_id
    )
    then
      raise exception
        'The Release Ballot results are unavailable because a Canal account is blocked.'
        using errcode = '42501';
    end if;
  end if;

  return query
  select
    item.scene_id,
    item.scene_revision,
    item.position,
    item.scene_title,
    coalesce(
      item.final_vote_count,
      0
    )::bigint,
    target_release.winner_scene_id is not null
      and item.scene_id = target_release.winner_scene_id
  from public.creator_release_items as item
  where item.release_id = target_release.id
  order by item.position;
end;
$$;

revoke all
on function public.create_creator_release(uuid, text, text, uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.open_creator_release(uuid, uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.respond_creator_release_credit(uuid, text, uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.cast_creator_release_vote(uuid, text, uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.close_creator_release(uuid, uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.read_my_creator_release_vote(uuid, uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.read_creator_release_results(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.create_creator_release(uuid, text, text, uuid)
to authenticated;

grant execute
on function public.open_creator_release(uuid, uuid)
to authenticated;

grant execute
on function public.respond_creator_release_credit(uuid, text, uuid)
to authenticated;

grant execute
on function public.cast_creator_release_vote(uuid, text, uuid)
to authenticated;

grant execute
on function public.close_creator_release(uuid, uuid)
to authenticated;

grant execute
on function public.read_my_creator_release_vote(uuid, uuid)
to authenticated;

grant execute
on function public.read_creator_release_results(uuid, uuid)
to authenticated;

commit;
