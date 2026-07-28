begin;

alter table public.profiles
add column if not exists bio text not null default '';

alter table public.profiles
add column if not exists favorite_activities text not null default '';

alter table public.profiles
add column if not exists updated_at timestamptz not null default timezone('utc', now());

insert into public.profiles (
  id,
  display_name,
  handle,
  bio,
  favorite_activities
)
select
  users.id,

  coalesce(
    nullif(
      users.raw_user_meta_data ->> 'display_name',
      ''
    ),
    nullif(
      users.raw_user_meta_data ->> 'full_name',
      ''
    ),
    split_part(
      coalesce(
        users.email,
        'Canal Listener'
      ),
      '@',
      1
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
  ),

  '',

  ''
from auth.users as users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
)
on conflict (id) do nothing;

alter table public.profiles
enable row level security;

drop policy if exists "Users can read their own profile"
on public.profiles;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
);

drop policy if exists "Users can insert their own profile"
on public.profiles;

create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (
  auth.uid() = id
);

drop policy if exists "Users can update their own profile"
on public.profiles;

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  auth.uid() = id
)
with check (
  auth.uid() = id
);

grant select, insert, update
on public.profiles
to authenticated;

commit;
