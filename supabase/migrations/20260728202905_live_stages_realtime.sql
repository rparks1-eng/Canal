begin;

create schema if not exists private;

revoke all
on schema private
from public;

grant usage
on schema private
to authenticated, service_role;

create table if not exists private.live_stage_join_attempts (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,
  window_started_at timestamptz not null
    default now(),
  attempt_count integer not null
    default 0,
  blocked_until timestamptz,
  expires_at timestamptz not null,
  constraint live_stage_join_attempts_count_nonnegative
    check (attempt_count >= 0)
);

alter table private.live_stage_join_attempts
enable row level security;

revoke all
on table private.live_stage_join_attempts
from public, anon, authenticated, service_role;

create index if not exists live_stage_join_attempts_expiry_index
on private.live_stage_join_attempts (expires_at);

create or replace function private.live_stage_tracks_are_safe(
  track_list jsonb
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  track jsonb;
  spotify_uri text;
  spotify_url text;
begin
  if jsonb_typeof(track_list) <> 'array'
    or jsonb_array_length(track_list) > 100
    or octet_length(track_list::text) > 262144
  then
    return false;
  end if;

  for track in
    select item.value
    from jsonb_array_elements(track_list) as item(value)
  loop
    if jsonb_typeof(track) <> 'object'
      or not (
        track ?& array[
          'id',
          'title',
          'artist',
          'source'
        ]
      )
      or (
        track - array[
          'id',
          'title',
          'artist',
          'source',
          'spotifyUri',
          'spotifyUrl',
          'durationMs',
          'imageUrl'
        ]::text[]
      ) <> '{}'::jsonb
    then
      return false;
    end if;

    if jsonb_typeof(track -> 'id') <> 'string'
      or char_length(track ->> 'id') not between 1 and 128
      or octet_length(track ->> 'id') > 256
      or track ->> 'id' <> btrim(track ->> 'id')
      or track ->> 'id' ~ '[[:cntrl:]]'
      or jsonb_typeof(track -> 'title') <> 'string'
      or char_length(track ->> 'title') not between 1 and 200
      or octet_length(track ->> 'title') > 800
      or track ->> 'title' <> btrim(track ->> 'title')
      or track ->> 'title' ~ '[[:cntrl:]]'
      or jsonb_typeof(track -> 'artist') <> 'string'
      or char_length(track ->> 'artist') not between 1 and 200
      or octet_length(track ->> 'artist') > 800
      or track ->> 'artist' <> btrim(track ->> 'artist')
      or track ->> 'artist' ~ '[[:cntrl:]]'
      or jsonb_typeof(track -> 'source') <> 'string'
      or char_length(track ->> 'source') not between 1 and 40
      or octet_length(track ->> 'source') > 160
      or track ->> 'source' <> btrim(track ->> 'source')
      or track ->> 'source' ~ '[[:cntrl:]]'
    then
      return false;
    end if;

    spotify_uri := null;
    spotify_url := null;

    if track ? 'spotifyUri' then
      if jsonb_typeof(track -> 'spotifyUri') <> 'string'
        or char_length(track ->> 'spotifyUri') > 64
        or octet_length(track ->> 'spotifyUri') > 128
        or track ->> 'spotifyUri'
          !~ '^spotify:track:[A-Za-z0-9]{22}$'
      then
        return false;
      end if;

      spotify_uri :=
        track ->> 'spotifyUri';
    end if;

    if track ? 'spotifyUrl' then
      if jsonb_typeof(track -> 'spotifyUrl') <> 'string'
        or char_length(track ->> 'spotifyUrl') > 96
        or octet_length(track ->> 'spotifyUrl') > 192
        or track ->> 'spotifyUrl'
          !~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$'
      then
        return false;
      end if;

      spotify_url :=
        track ->> 'spotifyUrl';
    end if;

    if spotify_uri is not null
      and spotify_url is not null
      and split_part(spotify_uri, ':', 3) <>
        regexp_replace(
          spotify_url,
          '^https://open[.]spotify[.]com/track/',
          ''
        )
    then
      return false;
    end if;

    if track ? 'durationMs'
      and (
        jsonb_typeof(track -> 'durationMs') <> 'number'
        or (track ->> 'durationMs')::numeric <= 0
        or (track ->> 'durationMs')::numeric > 86400000
        or mod(
          (track ->> 'durationMs')::numeric,
          1
        ) <> 0
      )
    then
      return false;
    end if;

    if track ? 'imageUrl'
      and (
        jsonb_typeof(track -> 'imageUrl') <> 'string'
        or char_length(track ->> 'imageUrl') > 1024
        or octet_length(track ->> 'imageUrl') > 2048
        or track ->> 'imageUrl' !~
          '^https://i[.]scdn[.]co/image/[A-Za-z0-9]{16,128}$'
      )
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all
on function private.live_stage_tracks_are_safe(jsonb)
from public, anon, authenticated, service_role;

grant execute
on function private.live_stage_tracks_are_safe(jsonb)
to authenticated, service_role;

create table if not exists public.live_stages (
  id uuid primary key
    default gen_random_uuid(),
  host_id uuid not null
    references public.profiles(id)
    on delete cascade,
  host_display_name text not null
    default 'Canal Listener',
  host_handle text not null
    default 'canal_listener',
  scene_id text,
  stage_code text not null,
  name text not null,
  activity text not null
    default 'Listening together',
  visibility text not null
    default 'public',
  status text not null
    default 'live',
  tracks jsonb not null
    default '[]'::jsonb,
  current_track_index integer not null
    default 0,
  created_at timestamptz not null
    default now(),
  updated_at timestamptz not null
    default now(),
  ended_at timestamptz,
  constraint live_stages_stage_code_format
    check (stage_code ~ '^[0-9]{6}$'),
  constraint live_stages_name_length
    check (char_length(trim(name)) between 1 and 80),
  constraint live_stages_host_display_name_length
    check (
      char_length(trim(host_display_name))
      between 1 and 60
    ),
  constraint live_stages_host_handle_format
    check (host_handle ~ '^[a-z0-9_]{3,24}$'),
  constraint live_stages_activity_length
    check (char_length(trim(activity)) between 1 and 120),
  constraint live_stages_visibility_check
    check (visibility in ('public', 'private')),
  constraint live_stages_status_check
    check (status in ('live', 'ended')),
  constraint live_stages_track_index_nonnegative
    check (current_track_index >= 0)
);

alter table public.live_stages
drop constraint if exists live_stages_tracks_array;

alter table public.live_stages
add constraint live_stages_tracks_array
check (
  jsonb_typeof(tracks) = 'array'
  and jsonb_array_length(tracks) <= 100
  and octet_length(tracks::text) <= 262144
  and private.live_stage_tracks_are_safe(tracks)
);

create unique index if not exists live_stages_stage_code_unique_index
on public.live_stages (stage_code);

create index if not exists live_stages_public_status_updated_index
on public.live_stages (
  status,
  updated_at desc
)
where visibility = 'public';

create index if not exists live_stages_host_updated_index
on public.live_stages (
  host_id,
  updated_at desc
);

create table if not exists public.live_stage_members (
  stage_id uuid not null
    references public.live_stages(id)
    on delete cascade,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  display_name text not null
    default 'Canal Listener',
  handle text not null
    default 'canal_listener',
  role text not null
    default 'listener',
  joined_at timestamptz not null
    default now(),
  last_seen_at timestamptz not null
    default now(),
  primary key (stage_id, user_id),
  constraint live_stage_members_role_check
    check (
      role in (
        'host',
        'collaborator',
        'listener'
      )
    ),
  constraint live_stage_members_display_name_length
    check (
      char_length(trim(display_name))
      between 1 and 60
    ),
  constraint live_stage_members_handle_format
    check (handle ~ '^[a-z0-9_]{3,24}$')
);

create index if not exists live_stage_members_stage_joined_index
on public.live_stage_members (
  stage_id,
  joined_at
);

create index if not exists live_stage_members_user_joined_index
on public.live_stage_members (
  user_id,
  joined_at desc
);

update public.live_stage_members as member
set role = 'listener'
from public.live_stages as stage
where stage.id = member.stage_id
  and member.role = 'host'
  and member.user_id <> stage.host_id;

insert into public.live_stage_members (
  stage_id,
  user_id,
  display_name,
  handle,
  role
)
select
  stage.id,
  stage.host_id,
  stage.host_display_name,
  stage.host_handle,
  'host'
from public.live_stages as stage
on conflict (stage_id, user_id)
do update
set role = excluded.role
where live_stage_members.role
  is distinct from excluded.role;

create unique index if not exists live_stage_members_single_host_index
on public.live_stage_members (stage_id)
where role = 'host';

create table if not exists public.live_stage_messages (
  id uuid primary key
    default gen_random_uuid(),
  stage_id uuid not null,
  user_id uuid not null,
  display_name text not null
    default 'Canal Listener',
  handle text not null
    default 'canal_listener',
  body text not null,
  created_at timestamptz not null
    default now(),
  constraint live_stage_messages_stage_fkey
    foreign key (stage_id)
    references public.live_stages(id)
    on delete cascade,
  constraint live_stage_messages_user_fkey
    foreign key (user_id)
    references public.profiles(id)
    on delete cascade,
  constraint live_stage_messages_body_length
    check (char_length(trim(body)) between 1 and 500),
  constraint live_stage_messages_display_name_length
    check (
      char_length(trim(display_name))
      between 1 and 60
    ),
  constraint live_stage_messages_handle_format
    check (handle ~ '^[a-z0-9_]{3,24}$')
);

alter table public.live_stage_messages
drop constraint if exists live_stage_messages_member;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'live_stage_messages_stage_fkey'
      and conrelid =
        'public.live_stage_messages'::regclass
  ) then
    alter table public.live_stage_messages
    add constraint live_stage_messages_stage_fkey
    foreign key (stage_id)
    references public.live_stages(id)
    on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'live_stage_messages_user_fkey'
      and conrelid =
        'public.live_stage_messages'::regclass
  ) then
    alter table public.live_stage_messages
    add constraint live_stage_messages_user_fkey
    foreign key (user_id)
    references public.profiles(id)
    on delete cascade;
  end if;
end;
$$;

create index if not exists live_stage_messages_stage_created_index
on public.live_stage_messages (
  stage_id,
  created_at,
  id
);

drop index if exists public.live_stage_messages_member_index;

create index if not exists live_stage_messages_user_stage_index
on public.live_stage_messages (
  user_id,
  stage_id
);

alter table public.live_stages
enable row level security;

alter table public.live_stage_members
enable row level security;

alter table public.live_stage_messages
enable row level security;

create or replace function private.can_access_live_stage(
  target_stage_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.live_stages as stage
      where stage.id = target_stage_id
        and (
          stage.visibility = 'public'
          or stage.host_id = (select auth.uid())
          or exists (
            select 1
            from public.live_stage_members as member
            where member.stage_id = stage.id
              and member.user_id = (select auth.uid())
          )
        )
    );
$$;

revoke all
on function private.can_access_live_stage(uuid)
from public, anon, authenticated, service_role;

grant execute
on function private.can_access_live_stage(uuid)
to authenticated;

create or replace function private.live_stage_id_from_topic(
  topic_value text
)
returns uuid
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select
    case
      when topic_value ~
        '^live-stage:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
      then substr(
        topic_value,
        char_length('live-stage:') + 1
      )::uuid
      else null
    end;
$$;

revoke all
on function private.live_stage_id_from_topic(text)
from public, anon, authenticated, service_role;

grant execute
on function private.live_stage_id_from_topic(text)
to authenticated;

create or replace function private.consume_live_stage_join_attempt(
  target_user_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  attempt_time timestamptz :=
    now();
  rate_window constant interval :=
    interval '10 minutes';
  block_window constant interval :=
    interval '15 minutes';
  maximum_attempts constant integer :=
    8;
  current_window_started_at timestamptz;
  current_attempt_count integer;
  current_blocked_until timestamptz;
begin
  if (
    target_user_id is null
    or target_user_id is distinct from
      (select auth.uid())
  ) then
    return false;
  end if;

  if pg_try_advisory_xact_lock(
    1128353356,
    2
  ) then
    delete from private.live_stage_join_attempts
    where expires_at <= attempt_time;
  end if;

  insert into private.live_stage_join_attempts (
    user_id,
    window_started_at,
    attempt_count,
    blocked_until,
    expires_at
  )
  values (
    target_user_id,
    attempt_time,
    0,
    null,
    attempt_time + rate_window
  )
  on conflict (user_id)
  do nothing;

  select
    attempt.window_started_at,
    attempt.attempt_count,
    attempt.blocked_until
  into
    current_window_started_at,
    current_attempt_count,
    current_blocked_until
  from private.live_stage_join_attempts as attempt
  where attempt.user_id = target_user_id
  for update;

  if (
    current_blocked_until is not null
    and current_blocked_until > attempt_time
  ) then
    return false;
  end if;

  if (
    current_window_started_at <=
      attempt_time - rate_window
  ) then
    current_window_started_at :=
      attempt_time;
    current_attempt_count :=
      0;
    current_blocked_until :=
      null;
  end if;

  current_attempt_count :=
    current_attempt_count + 1;

  if current_attempt_count > maximum_attempts then
    current_blocked_until :=
      attempt_time + block_window;

    update private.live_stage_join_attempts
    set
      window_started_at =
        current_window_started_at,
      attempt_count =
        current_attempt_count,
      blocked_until =
        current_blocked_until,
      expires_at =
        current_blocked_until
    where user_id = target_user_id;

    return false;
  end if;

  update private.live_stage_join_attempts
  set
    window_started_at =
      current_window_started_at,
    attempt_count =
      current_attempt_count,
    blocked_until =
      null,
    expires_at =
      current_window_started_at + rate_window
  where user_id = target_user_id;

  return true;
end;
$$;

revoke all
on function private.consume_live_stage_join_attempt(uuid)
from public, anon, authenticated, service_role;

create or replace function private.assign_live_stage_code()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  entropy bytea;
  random_value integer;
  candidate_code text;
  generation_attempt integer;
begin
  /*
   * Stage creation is infrequent. A transaction-scoped lock
   * makes the code availability check and assignment atomic
   * across concurrent inserts while the unique index remains
   * the final integrity boundary.
   */
  perform pg_advisory_xact_lock(
    1128353356,
    1
  );

  for generation_attempt in 1..128 loop
    loop
      entropy :=
        uuid_send(
          gen_random_uuid()
        );

      random_value :=
        get_byte(entropy, 0) * 65536
        + get_byte(entropy, 1) * 256
        + get_byte(entropy, 2);

      /*
       * Reject the top of the 24-bit range so modulo produces
       * an exactly uniform six-digit value.
       */
      exit when random_value < 16000000;
    end loop;

    candidate_code :=
      lpad(
        (random_value % 1000000)::text,
        6,
        '0'
      );

    if not exists (
      select 1
      from public.live_stages as stage
      where stage.stage_code = candidate_code
    ) then
      new.stage_code :=
        candidate_code;

      return new;
    end if;
  end loop;

  raise exception
    'Canal could not allocate a Stage code.'
    using errcode = '54000';
end;
$$;

revoke all
on function private.assign_live_stage_code()
from public, anon, authenticated, service_role;

alter table public.live_stages
alter column stage_code
drop default;

drop trigger if exists live_stages_assign_code
on public.live_stages;

create trigger live_stages_assign_code
before insert
on public.live_stages
for each row
execute function private.assign_live_stage_code();

create or replace function private.add_live_stage_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.live_stage_members (
    stage_id,
    user_id,
    role
  )
  values (
    new.id,
    new.host_id,
    'host'
  )
  on conflict (stage_id, user_id)
  do update
  set role = 'host';

  return new;
end;
$$;

revoke all
on function private.add_live_stage_host()
from public, anon, authenticated, service_role;

create or replace function private.stamp_live_stage_host_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select
    coalesce(
      nullif(trim(profile.display_name), ''),
      'Canal Listener'
    ),
    profile.handle
  into
    new.host_display_name,
    new.host_handle
  from public.profiles as profile
  where profile.id = new.host_id;

  return new;
end;
$$;

revoke all
on function private.stamp_live_stage_host_profile()
from public, anon, authenticated, service_role;

drop trigger if exists live_stages_stamp_host_profile
on public.live_stages;

create trigger live_stages_stamp_host_profile
before insert or update of host_id
on public.live_stages
for each row
execute function private.stamp_live_stage_host_profile();

drop trigger if exists live_stages_add_host
on public.live_stages;

create trigger live_stages_add_host
after insert
on public.live_stages
for each row
execute function private.add_live_stage_host();

create or replace function private.enforce_live_stage_host_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actual_host_id uuid;
begin
  select stage.host_id
  into actual_host_id
  from public.live_stages as stage
  where stage.id = new.stage_id;

  if actual_host_id is null then
    raise exception
      'The live Stage does not exist.'
      using errcode = '23503';
  end if;

  if new.user_id = actual_host_id then
    new.role :=
      'host';
  elsif new.role = 'host' then
    raise exception
      'Only the Stage owner can have the host role.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_live_stage_host_role()
from public, anon, authenticated, service_role;

drop trigger if exists live_stage_members_enforce_host_role
on public.live_stage_members;

create trigger live_stage_members_enforce_host_role
before insert or update of stage_id, user_id, role
on public.live_stage_members
for each row
execute function private.enforce_live_stage_host_role();

create or replace function private.stamp_live_stage_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select
    coalesce(
      nullif(trim(profile.display_name), ''),
      'Canal Listener'
    ),
    profile.handle
  into
    new.display_name,
    new.handle
  from public.profiles as profile
  where profile.id = new.user_id;

  return new;
end;
$$;

revoke all
on function private.stamp_live_stage_member_profile()
from public, anon, authenticated, service_role;

drop trigger if exists live_stage_members_stamp_profile
on public.live_stage_members;

create trigger live_stage_members_stamp_profile
before insert or update of user_id
on public.live_stage_members
for each row
execute function private.stamp_live_stage_member_profile();

create or replace function private.stamp_live_stage_message_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select
    member.display_name,
    member.handle
  into
    new.display_name,
    new.handle
  from public.live_stage_members as member
  where member.stage_id = new.stage_id
    and member.user_id = new.user_id;

  return new;
end;
$$;

revoke all
on function private.stamp_live_stage_message_author()
from public, anon, authenticated, service_role;

drop trigger if exists live_stage_messages_stamp_author
on public.live_stage_messages;

create trigger live_stage_messages_stamp_author
before insert
on public.live_stage_messages
for each row
execute function private.stamp_live_stage_message_author();

create or replace function private.touch_live_stage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at =
    now();

  if (
    new.status = 'ended'
    and old.status is distinct from 'ended'
  ) then
    new.ended_at =
      now();
  elsif new.status = 'live' then
    new.ended_at = null;
  end if;

  return new;
end;
$$;

revoke all
on function private.touch_live_stage()
from public, anon, authenticated, service_role;

drop trigger if exists live_stages_touch_updated_at
on public.live_stages;

create trigger live_stages_touch_updated_at
before update
on public.live_stages
for each row
execute function private.touch_live_stage();

drop policy if exists "Members can read accessible live Stages"
on public.live_stages;

create policy "Members can read accessible live Stages"
on public.live_stages
for select
to authenticated
using (
  (select private.can_access_live_stage(id))
);

drop policy if exists "Users can create their own live Stages"
on public.live_stages;

create policy "Users can create their own live Stages"
on public.live_stages
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = host_id
  and (
    scene_id is null
    or exists (
      select 1
      from public.scenes as source_scene
      where source_scene.user_id = (select auth.uid())
        and source_scene.id = scene_id
        and source_scene.deleted_at is null
    )
  )
);

drop policy if exists "Hosts can update their live Stages"
on public.live_stages;

create policy "Hosts can update their live Stages"
on public.live_stages
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = host_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = host_id
);

drop policy if exists "Hosts can delete their live Stages"
on public.live_stages;

create policy "Hosts can delete their live Stages"
on public.live_stages
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = host_id
);

drop policy if exists "Members can read live Stage membership"
on public.live_stage_members;

create policy "Members can read live Stage membership"
on public.live_stage_members
for select
to authenticated
using (
  (select private.can_access_live_stage(stage_id))
);

drop policy if exists "Listeners can join public live Stages"
on public.live_stage_members;

create policy "Listeners can join public live Stages"
on public.live_stage_members
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and role = 'listener'
  and exists (
    select 1
    from public.live_stages as stage
    where stage.id = stage_id
      and stage.status = 'live'
      and stage.visibility = 'public'
  )
);

drop policy if exists "Hosts can update live Stage roles"
on public.live_stage_members;

create policy "Hosts can update live Stage roles"
on public.live_stage_members
for update
to authenticated
using (
  exists (
    select 1
    from public.live_stages as stage
    where stage.id = stage_id
      and stage.host_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.live_stages as stage
    where stage.id = stage_id
      and stage.host_id = (select auth.uid())
      and (
        (
          user_id = stage.host_id
          and role = 'host'
        )
        or (
          user_id <> stage.host_id
          and role in (
            'listener',
            'collaborator'
          )
        )
      )
  )
);

drop policy if exists "Members can leave live Stages"
on public.live_stage_members;

create policy "Members can leave live Stages"
on public.live_stage_members
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (
    (
      (select auth.uid()) = user_id
      and role <> 'host'
    )
    or exists (
      select 1
      from public.live_stages as stage
      where stage.id = stage_id
        and stage.host_id = (select auth.uid())
        and user_id <> stage.host_id
    )
  )
);

drop policy if exists "Members can read live Stage messages"
on public.live_stage_messages;

create policy "Members can read live Stage messages"
on public.live_stage_messages
for select
to authenticated
using (
  (select private.can_access_live_stage(stage_id))
);

drop policy if exists "Members can send live Stage messages"
on public.live_stage_messages;

create policy "Members can send live Stage messages"
on public.live_stage_messages
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.live_stage_members as member
    join public.live_stages as stage
      on stage.id = member.stage_id
    where member.stage_id =
        live_stage_messages.stage_id
      and stage.id =
        live_stage_messages.stage_id
      and member.user_id = (select auth.uid())
      and stage.status = 'live'
  )
);

drop policy if exists "Authors and hosts can delete live Stage messages"
on public.live_stage_messages;

create policy "Authors and hosts can delete live Stage messages"
on public.live_stage_messages
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.live_stages as stage
      where stage.id = stage_id
        and stage.host_id = (select auth.uid())
    )
  )
);

drop function if exists public.join_live_stage_by_code(text);

create or replace function public.join_live_stage_by_code(
  stage_code_value text,
  expected_stage_id uuid default null
)
returns setof public.live_stages
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  matched_stage_id uuid;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to join a Stage.'
      using errcode = '42501';
  end if;

  if not private.consume_live_stage_join_attempt(
    current_user_id
  ) then
    return;
  end if;

  if coalesce(stage_code_value, '') !~ '^[0-9]{6}$' then
    return;
  end if;

  select stage.id
  into matched_stage_id
  from public.live_stages as stage
  where stage.stage_code = stage_code_value
    and stage.status = 'live'
  for share;

  if matched_stage_id is null then
    return;
  end if;

  if (
    expected_stage_id is not null
    and expected_stage_id <> matched_stage_id
  ) then
    return;
  end if;

  insert into public.live_stage_members (
    stage_id,
    user_id,
    role
  )
  values (
    matched_stage_id,
    current_user_id,
    'listener'
  )
  on conflict (stage_id, user_id)
  do nothing;

  return query
  select stage.*
  from public.live_stages as stage
  where stage.id = matched_stage_id;
end;
$$;

revoke all
on function public.join_live_stage_by_code(text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.join_live_stage_by_code(text, uuid)
to authenticated;

revoke all
on public.live_stages,
   public.live_stage_members,
   public.live_stage_messages
from public, anon, authenticated;

grant select, delete
on public.live_stages
to authenticated;

grant insert (
  host_id,
  scene_id,
  name,
  activity,
  visibility,
  tracks
)
on public.live_stages
to authenticated;

grant update (
  name,
  activity,
  visibility,
  status,
  tracks,
  current_track_index
)
on public.live_stages
to authenticated;

grant select, delete
on public.live_stage_members
to authenticated;

grant insert (
  stage_id,
  user_id,
  role
)
on public.live_stage_members
to authenticated;

grant update (role)
on public.live_stage_members
to authenticated;

grant select, delete
on public.live_stage_messages
to authenticated;

grant insert (
  stage_id,
  user_id,
  body
)
on public.live_stage_messages
to authenticated;

create or replace function private.broadcast_live_stage_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_stage_id uuid;
begin
  if (
    tg_table_schema <> 'public'
    or tg_table_name not in (
      'live_stages',
      'live_stage_members',
      'live_stage_messages'
    )
  ) then
    raise exception
      'Unexpected live Stage broadcast source.'
      using errcode = '22023';
  end if;

  if tg_table_name = 'live_stages' then
    if tg_op = 'DELETE' then
      target_stage_id :=
        old.id;
    else
      target_stage_id :=
        new.id;
    end if;
  elsif tg_op = 'DELETE' then
    target_stage_id :=
      old.stage_id;
  else
    target_stage_id :=
      new.stage_id;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'stage_id',
      target_stage_id::text
    ),
    'stage_changed',
    'live-stage:' ||
      target_stage_id::text,
    true
  );

  return null;
end;
$$;

revoke all
on function private.broadcast_live_stage_changed()
from public, anon, authenticated, service_role;

drop trigger if exists live_stages_broadcast_change
on public.live_stages;

create trigger live_stages_broadcast_change
after insert or update or delete
on public.live_stages
for each row
execute function private.broadcast_live_stage_changed();

drop trigger if exists live_stage_members_broadcast_change
on public.live_stage_members;

create trigger live_stage_members_broadcast_change
after insert or update or delete
on public.live_stage_members
for each row
execute function private.broadcast_live_stage_changed();

drop trigger if exists live_stage_messages_broadcast_change
on public.live_stage_messages;

create trigger live_stage_messages_broadcast_change
after insert or update or delete
on public.live_stage_messages
for each row
execute function private.broadcast_live_stage_changed();

drop policy if exists "Live Stage members can receive broadcasts"
on realtime.messages;

create policy "Live Stage members can receive broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    select private.can_access_live_stage(
      private.live_stage_id_from_topic(
        (select realtime.topic())
      )
    )
  )
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'live_stages'
    ) then
      execute
        'alter publication supabase_realtime drop table public.live_stages';
    end if;

    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'live_stage_members'
    ) then
      execute
        'alter publication supabase_realtime drop table public.live_stage_members';
    end if;

    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'live_stage_messages'
    ) then
      execute
        'alter publication supabase_realtime drop table public.live_stage_messages';
    end if;
  end if;
end
$$;

commit;
