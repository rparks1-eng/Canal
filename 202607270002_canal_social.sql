begin;

alter table public.profiles
add column if not exists is_public boolean not null default true;

alter table public.profiles
add column if not exists bio text not null default '';

alter table public.profiles
add column if not exists favorite_activities text not null default '';

alter table public.profiles
add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.saved_scenes (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  source_scene_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (
    user_id,
    source_user_id,
    source_scene_id
  )
);

create index if not exists saved_scenes_user_created_index
on public.saved_scenes (
  user_id,
  created_at desc
);

create index if not exists saved_scenes_source_index
on public.saved_scenes (
  source_user_id,
  source_scene_id
);

create index if not exists scenes_visibility_updated_index
on public.scenes (
  (coalesce(payload ->> 'visibility', 'private')),
  updated_at desc
);

alter table public.profiles
enable row level security;

alter table public.scenes
enable row level security;

alter table public.saved_scenes
enable row level security;

drop policy if exists "Users can read their own profile"
on public.profiles;

drop policy if exists "Authenticated users can read public profiles"
on public.profiles;

create policy "Authenticated users can read public profiles"
on public.profiles
for select
to authenticated
using (
  is_public = true
  or
  (select auth.uid()) = id
);

drop policy if exists "Users can insert their own profile"
on public.profiles;

create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (
  (select auth.uid()) = id
);

drop policy if exists "Users can update their own profile"
on public.profiles;

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);

drop policy if exists "Users can delete their own profile"
on public.profiles;

create policy "Users can delete their own profile"
on public.profiles
for delete
to authenticated
using (
  (select auth.uid()) = id
);

drop policy if exists "Users can read their own scenes"
on public.scenes;

drop policy if exists "Authenticated users can read own or public scenes"
on public.scenes;

create policy "Authenticated users can read own or public scenes"
on public.scenes
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or
  coalesce(
    payload ->> 'visibility',
    'private'
  ) = 'public'
);

drop policy if exists "Users can create their own scenes"
on public.scenes;

create policy "Users can create their own scenes"
on public.scenes
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

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

drop policy if exists "Users can delete their own scenes"
on public.scenes;

create policy "Users can delete their own scenes"
on public.scenes
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists "Users can read their saved scenes"
on public.saved_scenes;

create policy "Users can read their saved scenes"
on public.saved_scenes
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists "Users can save public scenes"
on public.saved_scenes;

create policy "Users can save public scenes"
on public.saved_scenes
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and
  exists (
    select 1
    from public.scenes
    where scenes.user_id = source_user_id
      and scenes.id = source_scene_id
      and scenes.deleted_at is null
      and coalesce(
        scenes.payload ->> 'visibility',
        'private'
      ) = 'public'
  )
);

drop policy if exists "Users can update their saved scenes"
on public.saved_scenes;

create policy "Users can update their saved scenes"
on public.saved_scenes
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
  and
  exists (
    select 1
    from public.scenes
    where scenes.user_id = source_user_id
      and scenes.id = source_scene_id
      and scenes.deleted_at is null
      and coalesce(
        scenes.payload ->> 'visibility',
        'private'
      ) = 'public'
  )
);

drop policy if exists "Users can remove their saved scenes"
on public.saved_scenes;

create policy "Users can remove their saved scenes"
on public.saved_scenes
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

grant select, insert, update, delete
on public.profiles
to authenticated;

grant select, insert, update, delete
on public.scenes
to authenticated;

grant select, insert, update, delete
on public.saved_scenes
to authenticated;

commit;
