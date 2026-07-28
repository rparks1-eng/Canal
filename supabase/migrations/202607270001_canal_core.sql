begin;

/*
 * Core Canal schema.
 *
 * Later migrations extend these tables with social discovery,
 * account-isolation safeguards, and Snapshots. Keeping the base
 * schema here makes a fresh Supabase project reproducible.
 */
create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Canal Listener',
  handle text not null,
  avatar_url text,
  bio text not null default '',
  favorite_activities text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (id),
  constraint profiles_handle_length
    check (char_length(handle) between 3 and 24),
  constraint profiles_handle_format
    check (handle ~ '^[a-z0-9_]+$')
);

create unique index if not exists profiles_handle_unique_index
on public.profiles (lower(handle));

create table if not exists public.scenes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists scenes_user_updated_index
on public.scenes (
  user_id,
  updated_at desc
);

create or replace function public.handle_new_canal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    handle
  )
  values (
    new.id,
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
        split_part(
          coalesce(
            new.email,
            ''
          ),
          '@',
          1
        ),
        ''
      ),
      'Canal Listener'
    ),
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

drop trigger if exists on_auth_user_created_canal
on auth.users;

create trigger on_auth_user_created_canal
after insert on auth.users
for each row
execute function public.handle_new_canal_user();

insert into public.profiles (
  id,
  display_name,
  handle
)
select
  users.id,
  coalesce(
    nullif(
      trim(
        users.raw_user_meta_data ->> 'display_name'
      ),
      ''
    ),
    nullif(
      trim(
        users.raw_user_meta_data ->> 'full_name'
      ),
      ''
    ),
    nullif(
      split_part(
        coalesce(
          users.email,
          ''
        ),
        '@',
        1
      ),
      ''
    ),
    'Canal Listener'
  ),
  'canal_' ||
    substr(
      replace(
        users.id::text,
        '-',
        ''
      ),
      1,
      10
    )
from auth.users as users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
)
on conflict (id) do nothing;

alter table public.profiles
enable row level security;

alter table public.scenes
enable row level security;

drop policy if exists "Users can read their own profile"
on public.profiles;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (
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

create policy "Users can read their own scenes"
on public.scenes
for select
to authenticated
using (
  (select auth.uid()) = user_id
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

grant select, insert, update, delete
on public.profiles
to authenticated;

grant select, insert, update, delete
on public.scenes
to authenticated;

commit;
