begin;

create table if not exists public.snapshots (
  id text primary key,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  scene_id text not null,
  scene_name text not null,
  track_id text,
  track_title text,
  track_artist text,
  spotify_url text,
  position_ms bigint not null default 0
    check (position_ms >= 0),
  note text not null default '',
  mood text,
  visibility text not null default 'private'
    check (
      visibility in (
        'private',
        'public'
      )
    ),
  created_at timestamptz not null
    default timezone('utc', now()),
  updated_at timestamptz not null
    default timezone('utc', now()),
  constraint snapshots_scene_id_not_blank
    check (length(trim(scene_id)) > 0),
  constraint snapshots_scene_name_not_blank
    check (length(trim(scene_name)) > 0)
);

create index if not exists snapshots_owner_updated_index
on public.snapshots (
  user_id,
  updated_at desc
);

create index if not exists snapshots_public_updated_index
on public.snapshots (
  updated_at desc
)
where visibility = 'public';

alter table public.snapshots
enable row level security;

drop policy if exists "Authenticated users can read own or public Snapshots"
on public.snapshots;

create policy "Authenticated users can read own or public Snapshots"
on public.snapshots
for select
to authenticated
using (
  (select auth.uid()) is not null
  and
  (
    (select auth.uid()) = user_id
    or
    visibility = 'public'
  )
);

drop policy if exists "Users can create their own Snapshots"
on public.snapshots;

create policy "Users can create their own Snapshots"
on public.snapshots
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and
  (select auth.uid()) = user_id
);

drop policy if exists "Users can update their own Snapshots"
on public.snapshots;

create policy "Users can update their own Snapshots"
on public.snapshots
for update
to authenticated
using (
  (select auth.uid()) is not null
  and
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and
  (select auth.uid()) = user_id
);

drop policy if exists "Users can delete their own Snapshots"
on public.snapshots;

create policy "Users can delete their own Snapshots"
on public.snapshots
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and
  (select auth.uid()) = user_id
);

revoke all
on public.snapshots
from anon;

grant select, insert, update, delete
on public.snapshots
to authenticated;

commit;
