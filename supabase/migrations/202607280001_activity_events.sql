begin;

create table if not exists public.activity_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  type text not null,
  title text not null,
  description text not null default '',
  username text,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  is_read boolean not null default false,
  primary key (user_id, id),
  constraint activity_events_type_check
    check (
      type in (
        'follow',
        'unfollow',
        'block',
        'unblock',
        'share',
        'collaboration',
        'snapshot',
        'scene',
        'system'
      )
    )
);

create index if not exists activity_events_user_created_index
on public.activity_events (
  user_id,
  created_at desc
);

alter table public.activity_events
enable row level security;

drop policy if exists "Users can read their own activity"
on public.activity_events;

create policy "Users can read their own activity"
on public.activity_events
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own activity"
on public.activity_events;

create policy "Users can create their own activity"
on public.activity_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own activity"
on public.activity_events;

create policy "Users can update their own activity"
on public.activity_events
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own activity"
on public.activity_events;

create policy "Users can delete their own activity"
on public.activity_events
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on public.activity_events
to authenticated;

commit;
