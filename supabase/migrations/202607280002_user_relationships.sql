begin;

create table if not exists public.user_relationships (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_username text not null,
  relationship_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (
    user_id,
    target_username
  ),
  constraint user_relationships_username_check
    check (
      target_username = lower(target_username)
      and target_username !~ '^@'
      and length(target_username) between 1 and 80
    ),
  constraint user_relationships_type_check
    check (
      relationship_type in (
        'following',
        'blocked'
      )
    )
);

create index if not exists user_relationships_owner_type_index
on public.user_relationships (
  user_id,
  relationship_type
);

alter table public.user_relationships
enable row level security;

drop policy if exists "Users can read their own relationships"
on public.user_relationships;

create policy "Users can read their own relationships"
on public.user_relationships
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own relationships"
on public.user_relationships;

create policy "Users can create their own relationships"
on public.user_relationships
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own relationships"
on public.user_relationships;

create policy "Users can update their own relationships"
on public.user_relationships
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own relationships"
on public.user_relationships;

create policy "Users can delete their own relationships"
on public.user_relationships
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on public.user_relationships
to authenticated;

commit;
