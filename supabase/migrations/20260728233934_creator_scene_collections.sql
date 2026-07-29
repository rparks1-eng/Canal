begin;

create table if not exists public.creator_scene_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  visibility text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_scene_collections_owner_id_id_unique
    unique (owner_id, id),
  constraint creator_scene_collections_title_length
    check (
      char_length(trim(title))
      between 1 and 80
      and title !~ '[[:cntrl:]]'
    ),
  constraint creator_scene_collections_description_length
    check (
      char_length(description) <= 500
      and description !~ '[[:cntrl:]]'
    ),
  constraint creator_scene_collections_visibility_check
    check (
      visibility in (
        'draft',
        'public'
      )
    )
);

create table if not exists public.creator_scene_collection_items (
  collection_id uuid not null,
  owner_id uuid not null,
  scene_id text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  primary key (
    collection_id,
    scene_id
  ),
  constraint creator_scene_collection_items_position_unique
    unique (
      collection_id,
      position
    ),
  constraint creator_scene_collection_items_collection_fkey
    foreign key (
      owner_id,
      collection_id
    )
    references public.creator_scene_collections (
      owner_id,
      id
    )
    on delete cascade,
  constraint creator_scene_collection_items_scene_fkey
    foreign key (
      owner_id,
      scene_id
    )
    references public.scenes (
      user_id,
      id
    )
    on delete cascade,
  constraint creator_scene_collection_items_position_nonnegative
    check (position >= 0)
);

create index if not exists creator_scene_collections_public_updated_index
on public.creator_scene_collections (
  updated_at desc
)
where visibility = 'public';

create index if not exists creator_scene_collections_owner_updated_index
on public.creator_scene_collections (
  owner_id,
  updated_at desc
);

create index if not exists creator_scene_collection_items_owner_scene_index
on public.creator_scene_collection_items (
  owner_id,
  scene_id
);

create or replace function public.protect_creator_scene_collection_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception
      'A creator Scene collection owner is immutable.'
      using errcode = '22023';
  end if;

  new.updated_at :=
    now();

  return new;
end;
$$;

drop trigger if exists creator_scene_collections_protect_owner
on public.creator_scene_collections;

create trigger creator_scene_collections_protect_owner
before update
on public.creator_scene_collections
for each row
execute function public.protect_creator_scene_collection_owner();

create or replace function public.validate_creator_scene_collection_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  collection_visibility text;
  scene_visibility text;
  scene_library_type text;
  scene_deleted_at timestamptz;
begin
  select collection.visibility
  into collection_visibility
  from public.creator_scene_collections as collection
  where collection.id = new.collection_id
    and collection.owner_id = new.owner_id;

  if collection_visibility is null then
    raise exception
      'The creator Scene collection was not found.'
      using errcode = 'P0002';
  end if;

  select
    coalesce(
      scene.payload ->> 'visibility',
      'private'
    ),
    coalesce(
      scene.payload ->> 'libraryType',
      'owned'
    ),
    scene.deleted_at
  into
    scene_visibility,
    scene_library_type,
    scene_deleted_at
  from public.scenes as scene
  where scene.user_id = new.owner_id
    and scene.id = new.scene_id;

  if not found
    or scene_deleted_at is not null
  then
    raise exception
      'Collections can contain only the owner''s undeleted Scenes.'
      using errcode = '22023';
  end if;

  if scene_library_type = 'saved'
  then
    raise exception
      'Collections can contain only owner-authored Scenes.'
      using errcode = '22023';
  end if;

  if collection_visibility = 'public'
    and scene_visibility <> 'public'
  then
    raise exception
      'Public collections can contain only public Scenes.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists creator_scene_collection_items_validate
on public.creator_scene_collection_items;

create trigger creator_scene_collection_items_validate
before insert or update
on public.creator_scene_collection_items
for each row
execute function public.validate_creator_scene_collection_item();

create or replace function public.validate_creator_scene_collection_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform scene.id
  from public.creator_scene_collection_items as item
  join public.scenes as scene
    on scene.user_id = item.owner_id
   and scene.id = item.scene_id
  where item.collection_id = new.id
    and item.owner_id = new.owner_id
  order by scene.id
  for share of scene;

  if new.visibility = 'public'
    and (
      not exists (
        select 1
        from public.creator_scene_collection_items as item
        where item.collection_id = new.id
          and item.owner_id = new.owner_id
      )
      or exists (
        select 1
        from public.creator_scene_collection_items as item
        left join public.scenes as scene
          on scene.user_id = item.owner_id
         and scene.id = item.scene_id
        where item.collection_id = new.id
          and item.owner_id = new.owner_id
          and (
            scene.id is null
            or scene.deleted_at is not null
            or coalesce(
              scene.payload ->> 'visibility',
              'private'
            ) <> 'public'
            or coalesce(
              scene.payload ->> 'libraryType',
              'owned'
            ) = 'saved'
          )
      )
    )
  then
    raise exception
      'Public collections require at least one owner-authored, undeleted public Scene.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists creator_scene_collections_validate_publish
on public.creator_scene_collections;

create trigger creator_scene_collections_validate_publish
before insert or update of visibility
on public.creator_scene_collections
for each row
execute function public.validate_creator_scene_collection_publish();

create or replace function public.protect_public_collection_scene()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  is_in_public_collection boolean;
begin
  select exists (
    select 1
    from public.creator_scene_collection_items as item
    join public.creator_scene_collections as collection
      on collection.id = item.collection_id
     and collection.owner_id = item.owner_id
    where item.owner_id = old.user_id
      and item.scene_id = old.id
      and collection.visibility = 'public'
  )
  into is_in_public_collection;

  if is_in_public_collection
    and tg_op = 'DELETE'
  then
    raise exception
      'Remove the Scene from public collections before making it private or deleting it.'
      using errcode = '22023';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if is_in_public_collection
    and (
      new.deleted_at is not null
      or coalesce(
        new.payload ->> 'visibility',
        'private'
      ) <> 'public'
      or coalesce(
        new.payload ->> 'libraryType',
        'owned'
      ) = 'saved'
    )
  then
    raise exception
      'Remove the Scene from public collections before making it private or deleting it.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists scenes_protect_public_collections
on public.scenes;

create trigger scenes_protect_public_collections
before update of payload, deleted_at or delete
on public.scenes
for each row
execute function public.protect_public_collection_scene();

revoke all
on function public.protect_creator_scene_collection_owner()
from public, anon, authenticated, service_role;

revoke all
on function public.validate_creator_scene_collection_item()
from public, anon, authenticated, service_role;

revoke all
on function public.validate_creator_scene_collection_publish()
from public, anon, authenticated, service_role;

revoke all
on function public.protect_public_collection_scene()
from public, anon, authenticated, service_role;

alter table public.creator_scene_collections
enable row level security;

alter table public.creator_scene_collection_items
enable row level security;

drop policy if exists "Owners and eligible viewers can read creator Scene collections"
on public.creator_scene_collections;

create policy "Owners and eligible viewers can read creator Scene collections"
on public.creator_scene_collections
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (
    visibility = 'public'
    and exists (
      select 1
      from public.profiles as owner_profile
      where owner_profile.id = owner_id
        and owner_profile.is_public = true
    )
    and not private.canal_users_are_blocked(
      (select auth.uid()),
      creator_scene_collections.owner_id
    )
    and not private.canal_users_are_blocked(
      creator_scene_collections.owner_id,
      (select auth.uid())
    )
  )
);

drop policy if exists "Owners and eligible viewers can read creator Scene collection items"
on public.creator_scene_collection_items;

create policy "Owners and eligible viewers can read creator Scene collection items"
on public.creator_scene_collection_items
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1
    from public.creator_scene_collections as collection
    where collection.id = collection_id
      and collection.owner_id = creator_scene_collection_items.owner_id
      and collection.visibility = 'public'
      and exists (
        select 1
        from public.profiles as owner_profile
        where owner_profile.id = collection.owner_id
          and owner_profile.is_public = true
      )
      and not private.canal_users_are_blocked(
        (select auth.uid()),
        collection.owner_id
      )
      and not private.canal_users_are_blocked(
        collection.owner_id,
        (select auth.uid())
      )
  )
);

revoke all
on public.creator_scene_collections
from public, anon, authenticated;

revoke all
on public.creator_scene_collection_items
from public, anon, authenticated;

grant select
on public.creator_scene_collections
to authenticated;

grant select
on public.creator_scene_collection_items
to authenticated;

create or replace function public.save_creator_scene_collection(
  collection_id_value uuid,
  title_value text,
  description_value text,
  visibility_value text,
  scene_ids_value text[]
)
returns public.creator_scene_collections
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  target_collection_id uuid :=
    coalesce(
      collection_id_value,
      gen_random_uuid()
    );
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
  normalized_visibility text :=
    lower(
      trim(
        coalesce(
          visibility_value,
          ''
        )
      )
    );
  normalized_scene_ids text[] :=
    coalesce(
      scene_ids_value,
      array[]::text[]
    );
  existing_owner_id uuid;
  saved_collection public.creator_scene_collections%rowtype;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to save a creator Scene collection.'
      using errcode = '42501';
  end if;

  if length(normalized_title) not between 1 and 80 then
    raise exception
      'A collection title between 1 and 80 characters is required.'
      using errcode = '22023';
  end if;

  if normalized_title ~ '[[:cntrl:]]'
    or normalized_description ~ '[[:cntrl:]]'
  then
    raise exception
      'Collection text cannot contain control characters.'
      using errcode = '22023';
  end if;

  if length(normalized_description) > 500 then
    raise exception
      'A collection description cannot exceed 500 characters.'
      using errcode = '22023';
  end if;

  if normalized_visibility not in (
    'draft',
    'public'
  ) then
    raise exception
      'Collection visibility must be draft or public.'
      using errcode = '22023';
  end if;

  if cardinality(normalized_scene_ids) > 50 then
    raise exception
      'A collection can contain at most 50 Scenes.'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(
      trim(
        requested.scene_id
      )
      order by requested.ordinality
    ),
    array[]::text[]
  )
  into normalized_scene_ids
  from unnest(
    normalized_scene_ids
  ) with ordinality as requested(
    scene_id,
    ordinality
  );

  if normalized_visibility = 'public'
    and cardinality(normalized_scene_ids) = 0
  then
    raise exception
      'A public collection must contain at least one Scene.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(normalized_scene_ids) as requested(scene_id)
    where requested.scene_id is null
      or length(trim(requested.scene_id)) = 0
      or length(requested.scene_id) > 512
      or requested.scene_id ~ '[[:cntrl:]]'
  )
  or (
    select count(*)
    from unnest(normalized_scene_ids) as requested(scene_id)
  ) <> (
    select count(distinct requested.scene_id)
    from unnest(normalized_scene_ids) as requested(scene_id)
  )
  then
    raise exception
      'Collection Scene IDs must be non-empty and unique.'
      using errcode = '22023';
  end if;

  select collection.owner_id
  into existing_owner_id
  from public.creator_scene_collections as collection
  where collection.id = target_collection_id
  for update;

  if found
    and existing_owner_id <> current_user_id
  then
    raise exception
      'A creator Scene collection owner is immutable.'
      using errcode = '42501';
  end if;

  perform scene.id
  from public.scenes as scene
  join unnest(
    normalized_scene_ids
  ) as requested(scene_id)
    on requested.scene_id = scene.id
  where scene.user_id = current_user_id
  order by scene.id
  for share of scene;

  if exists (
    select 1
    from unnest(normalized_scene_ids) as requested(scene_id)
    left join public.scenes as scene
      on scene.user_id = current_user_id
     and scene.id = requested.scene_id
     and scene.deleted_at is null
    where scene.id is null
      or (
        normalized_visibility = 'public'
        and coalesce(
          scene.payload ->> 'visibility',
          'private'
        ) <> 'public'
      )
      or coalesce(
        scene.payload ->> 'libraryType',
        'owned'
      ) = 'saved'
  ) then
    raise exception
      'Collections can contain only the owner''s undeleted Scenes, and public collections require public Scenes.'
      using errcode = '22023';
  end if;

  if existing_owner_id is null then
    insert into public.creator_scene_collections (
      id,
      owner_id,
      title,
      description,
      visibility,
      created_at,
      updated_at
    )
    values (
      target_collection_id,
      current_user_id,
      normalized_title,
      normalized_description,
      'draft',
      now(),
      now()
    );
  else
    update public.creator_scene_collections
    set
      title = normalized_title,
      description = normalized_description,
      visibility = 'draft',
      updated_at = now()
    where id = target_collection_id
      and owner_id = current_user_id;
  end if;

  delete from public.creator_scene_collection_items
  where collection_id = target_collection_id
    and owner_id = current_user_id;

  insert into public.creator_scene_collection_items (
    collection_id,
    owner_id,
    scene_id,
    position,
    created_at
  )
  select
    target_collection_id,
    current_user_id,
    requested.scene_id,
    requested.ordinality::integer - 1,
    now()
  from unnest(
    normalized_scene_ids
  ) with ordinality as requested(
    scene_id,
    ordinality
  );

  update public.creator_scene_collections
  set
    visibility = normalized_visibility,
    updated_at = now()
  where id = target_collection_id
    and owner_id = current_user_id
  returning *
  into saved_collection;

  if not found then
    raise exception
      'The creator Scene collection could not be saved.'
      using errcode = 'P0002';
  end if;

  return saved_collection;
end;
$$;

create or replace function public.delete_creator_scene_collection(
  collection_id_value uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to delete a creator Scene collection.'
      using errcode = '42501';
  end if;

  if collection_id_value is null then
    raise exception
      'A collection ID is required.'
      using errcode = '22023';
  end if;

  delete from public.creator_scene_collections
  where id = collection_id_value
    and owner_id = current_user_id;

  if not found then
    raise exception
      'The creator Scene collection was not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all
on function public.save_creator_scene_collection(
  uuid,
  text,
  text,
  text,
  text[]
)
from public, anon, authenticated, service_role;

revoke all
on function public.delete_creator_scene_collection(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.save_creator_scene_collection(
  uuid,
  text,
  text,
  text,
  text[]
)
to authenticated;

grant execute
on function public.delete_creator_scene_collection(uuid)
to authenticated;

commit;
