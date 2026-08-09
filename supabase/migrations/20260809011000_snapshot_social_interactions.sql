begin;

alter table public.activity_events
  add column if not exists snapshot_id text,
  add column if not exists comment_id uuid;

create index if not exists activity_events_snapshot_index
on public.activity_events (user_id, snapshot_id, created_at desc)
where snapshot_id is not null;

create table if not exists public.snapshot_likes (
  snapshot_id text not null
    references public.snapshots(id)
    on delete cascade,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  created_at timestamptz not null
    default timezone('utc', now()),
  primary key (snapshot_id, user_id)
);

create table if not exists public.snapshot_comments (
  id uuid primary key default gen_random_uuid(),
  snapshot_id text not null
    references public.snapshots(id)
    on delete cascade,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  parent_comment_id uuid,
  body text not null,
  created_at timestamptz not null
    default timezone('utc', now()),
  updated_at timestamptz not null
    default timezone('utc', now()),
  constraint snapshot_comments_body_safe check (
    char_length(btrim(body)) between 1 and 500
    and octet_length(body) <= 2000
    and body = btrim(body)
  ),
  constraint snapshot_comments_not_own_parent check (
    parent_comment_id is null
    or parent_comment_id <> id
  ),
  unique (id, snapshot_id),
  foreign key (parent_comment_id, snapshot_id)
    references public.snapshot_comments(id, snapshot_id)
    on delete cascade
);

create table if not exists public.snapshot_comment_likes (
  comment_id uuid not null,
  snapshot_id text not null,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  created_at timestamptz not null
    default timezone('utc', now()),
  primary key (comment_id, user_id),
  foreign key (comment_id, snapshot_id)
    references public.snapshot_comments(id, snapshot_id)
    on delete cascade
);

create index if not exists snapshot_likes_created_index
on public.snapshot_likes (snapshot_id, created_at desc);

create index if not exists snapshot_comments_snapshot_created_index
on public.snapshot_comments (snapshot_id, created_at asc);

create index if not exists snapshot_comments_parent_created_index
on public.snapshot_comments (parent_comment_id, created_at asc)
where parent_comment_id is not null;

create index if not exists snapshot_comment_likes_snapshot_index
on public.snapshot_comment_likes (snapshot_id, comment_id);

alter table public.snapshot_likes enable row level security;
alter table public.snapshot_comments enable row level security;
alter table public.snapshot_comment_likes enable row level security;

drop policy if exists "Members can read accessible Snapshot likes"
on public.snapshot_likes;
create policy "Members can read accessible Snapshot likes"
on public.snapshot_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.snapshots as snapshot
    where snapshot.id = snapshot_id
      and (
        snapshot.user_id = (select auth.uid())
        or (
          snapshot.visibility = 'public'
          and not private.canal_users_are_blocked(snapshot.user_id, (select auth.uid()))
          and not private.canal_users_are_blocked((select auth.uid()), snapshot.user_id)
        )
      )
  )
);

drop policy if exists "Users can like accessible Snapshots"
on public.snapshot_likes;
create policy "Users can like accessible Snapshots"
on public.snapshot_likes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.snapshots as snapshot
    where snapshot.id = snapshot_id
      and (
        snapshot.user_id = (select auth.uid())
        or (
          snapshot.visibility = 'public'
          and not private.canal_users_are_blocked(snapshot.user_id, (select auth.uid()))
          and not private.canal_users_are_blocked((select auth.uid()), snapshot.user_id)
        )
      )
  )
);

drop policy if exists "Users can remove their Snapshot likes"
on public.snapshot_likes;
create policy "Users can remove their Snapshot likes"
on public.snapshot_likes
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Members can read accessible Snapshot comments"
on public.snapshot_comments;
create policy "Members can read accessible Snapshot comments"
on public.snapshot_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.snapshots as snapshot
    where snapshot.id = snapshot_id
      and (
        snapshot.user_id = (select auth.uid())
        or (
          snapshot.visibility = 'public'
          and not private.canal_users_are_blocked(snapshot.user_id, (select auth.uid()))
          and not private.canal_users_are_blocked((select auth.uid()), snapshot.user_id)
        )
      )
  )
);

drop policy if exists "Users can comment on accessible Snapshots"
on public.snapshot_comments;
create policy "Users can comment on accessible Snapshots"
on public.snapshot_comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.snapshots as snapshot
    where snapshot.id = snapshot_id
      and (
        snapshot.user_id = (select auth.uid())
        or (
          snapshot.visibility = 'public'
          and not private.canal_users_are_blocked(snapshot.user_id, (select auth.uid()))
          and not private.canal_users_are_blocked((select auth.uid()), snapshot.user_id)
        )
      )
  )
  and (
    parent_comment_id is null
    or exists (
      select 1
      from public.snapshot_comments as parent
      where parent.id = parent_comment_id
        and parent.snapshot_id = snapshot_id
    )
  )
);

drop policy if exists "Members can read accessible Snapshot comment likes"
on public.snapshot_comment_likes;
create policy "Members can read accessible Snapshot comment likes"
on public.snapshot_comment_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.snapshot_comments as comment
    where comment.id = comment_id
      and comment.snapshot_id = snapshot_id
  )
);

drop policy if exists "Users can like accessible Snapshot comments"
on public.snapshot_comment_likes;
create policy "Users can like accessible Snapshot comments"
on public.snapshot_comment_likes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.snapshot_comments as comment
    where comment.id = comment_id
      and comment.snapshot_id = snapshot_id
  )
);

drop policy if exists "Users can remove their Snapshot comment likes"
on public.snapshot_comment_likes;
create policy "Users can remove their Snapshot comment likes"
on public.snapshot_comment_likes
for delete
to authenticated
using (user_id = (select auth.uid()));

grant select, insert, delete on public.snapshot_likes to authenticated;
grant select, insert on public.snapshot_comments to authenticated;
grant select, insert, delete on public.snapshot_comment_likes to authenticated;

create or replace function private.notify_snapshot_social_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_handle text;
  actor_name text;
  recipient_id uuid;
  target_snapshot_id text;
  target_comment_id uuid;
  target_scene_name text;
  parent_author_id uuid;
begin
  actor_id := new.user_id;
  target_snapshot_id := new.snapshot_id;
  target_comment_id := case
    when tg_table_name = 'snapshot_likes' then null
    when tg_table_name = 'snapshot_comments'
      then (to_jsonb(new) ->> 'id')::uuid
    else (to_jsonb(new) ->> 'comment_id')::uuid
  end;

  select
    profile.handle,
    coalesce(nullif(btrim(profile.display_name), ''), profile.handle)
  into actor_handle, actor_name
  from public.profiles as profile
  where profile.id = actor_id;

  select snapshot.user_id, snapshot.scene_name
  into recipient_id, target_scene_name
  from public.snapshots as snapshot
  where snapshot.id = target_snapshot_id;

  if actor_handle is null or recipient_id is null then
    return new;
  end if;

  if tg_table_name = 'snapshot_likes' then
    if recipient_id <> actor_id then
      insert into public.activity_events (
        user_id, id, type, title, description, username,
        display_name, snapshot_id, created_at, is_read
      ) values (
        recipient_id,
        'snapshot-like:' || target_snapshot_id || ':' || actor_id::text,
        'snapshot',
        actor_name || ' liked your Snapshot',
        target_scene_name,
        actor_handle,
        actor_name,
        target_snapshot_id,
        timezone('utc', now()),
        false
      )
      on conflict (user_id, id) do update set
        created_at = excluded.created_at,
        is_read = false;
    end if;
  elsif tg_table_name = 'snapshot_comments' then
    if recipient_id <> actor_id then
      insert into public.activity_events (
        user_id, id, type, title, description, username,
        display_name, snapshot_id, comment_id, created_at, is_read
      ) values (
        recipient_id,
        'snapshot-comment:' || new.id::text,
        'snapshot',
        actor_name || ' commented on your Snapshot',
        left(new.body, 140),
        actor_handle,
        actor_name,
        target_snapshot_id,
        new.id,
        timezone('utc', now()),
        false
      )
      on conflict (user_id, id) do nothing;
    end if;

    if new.parent_comment_id is not null then
      select comment.user_id
      into parent_author_id
      from public.snapshot_comments as comment
      where comment.id = new.parent_comment_id;

      if parent_author_id is not null
        and parent_author_id <> actor_id
        and parent_author_id <> recipient_id then
        insert into public.activity_events (
          user_id, id, type, title, description, username,
          display_name, snapshot_id, comment_id, created_at, is_read
        ) values (
          parent_author_id,
          'snapshot-reply:' || new.id::text,
          'snapshot',
          actor_name || ' replied to your comment',
          left(new.body, 140),
          actor_handle,
          actor_name,
          target_snapshot_id,
          new.id,
          timezone('utc', now()),
          false
        )
        on conflict (user_id, id) do nothing;
      end if;
    end if;
  else
    select comment.user_id
    into recipient_id
    from public.snapshot_comments as comment
    where comment.id = new.comment_id
      and comment.snapshot_id = new.snapshot_id;

    if recipient_id is not null and recipient_id <> actor_id then
      insert into public.activity_events (
        user_id, id, type, title, description, username,
        display_name, snapshot_id, comment_id, created_at, is_read
      ) values (
        recipient_id,
        'snapshot-comment-like:' || new.comment_id::text || ':' || actor_id::text,
        'snapshot',
        actor_name || ' liked your comment',
        target_scene_name,
        actor_handle,
        actor_name,
        target_snapshot_id,
        new.comment_id,
        timezone('utc', now()),
        false
      )
      on conflict (user_id, id) do update set
        created_at = excluded.created_at,
        is_read = false;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_snapshot_social_activity()
from public, anon, authenticated, service_role;

drop trigger if exists snapshot_likes_notify_activity
on public.snapshot_likes;
create trigger snapshot_likes_notify_activity
after insert on public.snapshot_likes
for each row execute function private.notify_snapshot_social_activity();

drop trigger if exists snapshot_comments_notify_activity
on public.snapshot_comments;
create trigger snapshot_comments_notify_activity
after insert on public.snapshot_comments
for each row execute function private.notify_snapshot_social_activity();

drop trigger if exists snapshot_comment_likes_notify_activity
on public.snapshot_comment_likes;
create trigger snapshot_comment_likes_notify_activity
after insert on public.snapshot_comment_likes
for each row execute function private.notify_snapshot_social_activity();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'snapshot_likes'
  ) then
    alter publication supabase_realtime add table public.snapshot_likes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'snapshot_comments'
  ) then
    alter publication supabase_realtime add table public.snapshot_comments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'snapshot_comment_likes'
  ) then
    alter publication supabase_realtime add table public.snapshot_comment_likes;
  end if;
end;
$$;

commit;
