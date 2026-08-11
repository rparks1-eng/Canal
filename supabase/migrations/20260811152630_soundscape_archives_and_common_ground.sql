begin;

create table public.soundscape_archives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_kind text not null check (period_kind in ('year', 'season')),
  period_key text not null check (length(period_key) between 1 and 32),
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  version integer not null check (version between 1 and 1000000),
  history_state text not null check (history_state in ('ready', 'insufficient_history')),
  insufficient_reason text,
  schema_version integer not null default 1 check (schema_version between 1 and 100),
  generated_at timestamptz not null,
  refreshed_at timestamptz not null,
  visibility text not null default 'private' check (visibility in ('private', 'connections', 'public')),
  content jsonb not null check (pg_column_size(content) <= 1048576),
  share_projection jsonb not null check (pg_column_size(share_projection) <= 65536),
  created_at timestamptz not null default timezone('utc', now()),
  check (period_starts_at < period_ends_at),
  unique (user_id, period_kind, period_key, version)
);

create index soundscape_archives_latest_index
on public.soundscape_archives (user_id, period_kind, period_key, version desc);

alter table public.soundscape_archives enable row level security;
create policy "Owners read Soundscape archives" on public.soundscape_archives
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners create private Soundscape archives" on public.soundscape_archives
  for insert to authenticated with check ((select auth.uid()) = user_id and visibility = 'private');
create policy "Owners update Soundscape archives" on public.soundscape_archives
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Owners delete Soundscape archives" on public.soundscape_archives
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.soundscape_archives to authenticated;

create or replace function private.enforce_soundscape_archive_immutability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.period_kind is distinct from old.period_kind
    or new.period_key is distinct from old.period_key
    or new.period_starts_at is distinct from old.period_starts_at
    or new.period_ends_at is distinct from old.period_ends_at
    or new.version is distinct from old.version
    or new.history_state is distinct from old.history_state
    or new.insufficient_reason is distinct from old.insufficient_reason
    or new.schema_version is distinct from old.schema_version
    or new.generated_at is distinct from old.generated_at
    or new.refreshed_at is distinct from old.refreshed_at
    or new.content is distinct from old.content
    or new.share_projection is distinct from old.share_projection
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Soundscape archive versions are immutable.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_soundscape_archive_immutability()
  from public, anon, authenticated, service_role;
create trigger soundscape_archive_immutable_fields
before update on public.soundscape_archives
for each row execute function private.enforce_soundscape_archive_immutability();

create or replace function public.soundscape_insert_archive(
  requested_period_kind text,
  requested_period_key text,
  requested_period_starts_at timestamptz,
  requested_period_ends_at timestamptz,
  requested_history_state text,
  requested_insufficient_reason text,
  requested_schema_version integer,
  requested_generated_at timestamptz,
  requested_content jsonb,
  requested_share_projection jsonb
) returns setof public.soundscape_archives
language plpgsql volatile security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
  next_version integer;
begin
  if viewer_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if requested_period_kind not in ('year', 'season')
    or length(requested_period_key) not between 1 and 32
    or requested_period_starts_at >= requested_period_ends_at
    or requested_history_state not in ('ready', 'insufficient_history')
    or requested_schema_version not between 1 and 100
    or pg_column_size(requested_content) > 1048576
    or pg_column_size(requested_share_projection) > 65536
  then
    raise exception 'Invalid Soundscape archive input.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(viewer_id::text || ':' || requested_period_kind || ':' || requested_period_key, 0)
  );
  select coalesce(max(archive.version), 0) + 1 into next_version
  from public.soundscape_archives as archive
  where archive.user_id = viewer_id
    and archive.period_kind = requested_period_kind
    and archive.period_key = requested_period_key;

  return query
  insert into public.soundscape_archives (
    user_id, period_kind, period_key, period_starts_at, period_ends_at,
    version, history_state, insufficient_reason, schema_version,
    generated_at, refreshed_at, visibility, content, share_projection
  ) values (
    viewer_id, requested_period_kind, requested_period_key,
    requested_period_starts_at, requested_period_ends_at, next_version,
    requested_history_state, requested_insufficient_reason, requested_schema_version,
    requested_generated_at, requested_generated_at, 'private',
    requested_content, requested_share_projection
  ) returning *;
end;
$$;
revoke all on function public.soundscape_insert_archive(
  text, text, timestamptz, timestamptz, text, text, integer,
  timestamptz, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.soundscape_insert_archive(
  text, text, timestamptz, timestamptz, text, text, integer,
  timestamptz, jsonb, jsonb
) to authenticated;

create table public.soundscape_refresh_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_kind text not null check (period_kind in ('year', 'season')),
  period_key text not null check (length(period_key) between 1 and 32),
  status text not null default 'idle' check (status in ('idle', 'refreshing', 'ready', 'failed')),
  requested_at timestamptz,
  completed_at timestamptz,
  last_archive_version integer check (last_archive_version between 1 and 1000000),
  error_code text check (error_code is null or length(error_code) between 1 and 80),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, period_kind, period_key)
);

alter table public.soundscape_refresh_state enable row level security;
create policy "Owners read Soundscape refresh state" on public.soundscape_refresh_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners create Soundscape refresh state" on public.soundscape_refresh_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update Soundscape refresh state" on public.soundscape_refresh_state
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Owners delete Soundscape refresh state" on public.soundscape_refresh_state
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.soundscape_refresh_state to authenticated;

create or replace function private.soundscape_users_are_mutual_connections(
  first_user_id uuid,
  second_user_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select first_user_id is not null
    and second_user_id is not null
    and first_user_id <> second_user_id
    and exists (
      select 1 from public.user_relationships as first_follow
      where first_follow.user_id = first_user_id
        and first_follow.target_user_id = second_user_id
        and first_follow.relationship_type = 'following'
    )
    and exists (
      select 1 from public.user_relationships as second_follow
      where second_follow.user_id = second_user_id
        and second_follow.target_user_id = first_user_id
        and second_follow.relationship_type = 'following'
    )
    and not private.canal_users_are_blocked(first_user_id, second_user_id)
    and not private.canal_users_are_blocked(second_user_id, first_user_id);
$$;
revoke all on function private.soundscape_users_are_mutual_connections(uuid, uuid)
  from public, anon, authenticated, service_role;

create table public.soundscape_common_ground_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_user_id uuid not null references auth.users(id) on delete cascade,
  approved_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, peer_user_id),
  check (user_id <> peer_user_id)
);
create index soundscape_common_ground_peer_index
  on public.soundscape_common_ground_consents (peer_user_id, user_id);
alter table public.soundscape_common_ground_consents enable row level security;
create policy "Participants read Common Ground consent" on public.soundscape_common_ground_consents
  for select to authenticated using ((select auth.uid()) = user_id or (select auth.uid()) = peer_user_id);
grant select on public.soundscape_common_ground_consents to authenticated;

create or replace function public.soundscape_set_common_ground_approval(
  peer_user_id uuid,
  approved boolean
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  if viewer_id is null or peer_user_id is null or viewer_id = peer_user_id
    or not private.soundscape_users_are_mutual_connections(viewer_id, peer_user_id)
  then
    raise exception 'Common Ground requires a mutual, unblocked connection.' using errcode = '42501';
  end if;
  if approved then
    insert into public.soundscape_common_ground_consents (
      user_id, peer_user_id, approved_at, revoked_at, updated_at
    ) values (
      viewer_id, peer_user_id, timezone('utc', now()), null, timezone('utc', now())
    ) on conflict (user_id, peer_user_id) do update set
      approved_at = excluded.approved_at,
      revoked_at = null,
      updated_at = excluded.updated_at;
  else
    delete from public.soundscape_common_ground_consents
    where user_id = viewer_id
      and peer_user_id = soundscape_set_common_ground_approval.peer_user_id;
  end if;
end;
$$;
revoke all on function public.soundscape_set_common_ground_approval(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.soundscape_set_common_ground_approval(uuid, boolean)
  to authenticated;

create or replace function public.soundscape_common_ground_state(peer_user_id uuid)
returns table (mutual_connection boolean, approved_by_account boolean, approved_by_peer boolean)
language sql stable security definer set search_path = '' as $$
  select
    private.soundscape_users_are_mutual_connections((select auth.uid()), peer_user_id),
    exists (
      select 1 from public.soundscape_common_ground_consents as consent
      where consent.user_id = (select auth.uid())
        and consent.peer_user_id = soundscape_common_ground_state.peer_user_id
        and consent.revoked_at is null
    ),
    exists (
      select 1 from public.soundscape_common_ground_consents as consent
      where consent.user_id = soundscape_common_ground_state.peer_user_id
        and consent.peer_user_id = (select auth.uid())
        and consent.revoked_at is null
    )
  where (select auth.uid()) is not null
    and peer_user_id is not null
    and peer_user_id <> (select auth.uid());
$$;
revoke all on function public.soundscape_common_ground_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.soundscape_common_ground_state(uuid) to authenticated;

create or replace function public.soundscape_common_ground_projection(
  peer_user_id uuid,
  requested_period_kind text,
  requested_period_key text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
  viewer_projection jsonb;
  peer_projection jsonb;
begin
  if viewer_id is null or peer_user_id is null or viewer_id = peer_user_id
    or requested_period_kind not in ('year', 'season')
    or length(requested_period_key) not between 1 and 32
    or not private.soundscape_users_are_mutual_connections(viewer_id, peer_user_id)
    or not exists (
      select 1 from public.soundscape_common_ground_consents
      where user_id = viewer_id
        and peer_user_id = soundscape_common_ground_projection.peer_user_id
        and revoked_at is null
    )
    or not exists (
      select 1 from public.soundscape_common_ground_consents
      where user_id = soundscape_common_ground_projection.peer_user_id
        and peer_user_id = viewer_id
        and revoked_at is null
    )
  then
    return jsonb_build_object('status', 'ineligible', 'members', jsonb_build_array());
  end if;

  select archive.share_projection into viewer_projection
  from public.soundscape_archives as archive
  where archive.user_id = viewer_id
    and archive.period_kind = requested_period_kind
    and archive.period_key = requested_period_key
  order by archive.version desc limit 1;

  select archive.share_projection into peer_projection
  from public.soundscape_archives as archive
  where archive.user_id = peer_user_id
    and archive.period_kind = requested_period_kind
    and archive.period_key = requested_period_key
  order by archive.version desc limit 1;

  if viewer_projection is null or peer_projection is null then
    return jsonb_build_object(
      'status', 'insufficient_history',
      'members', jsonb_build_array()
    );
  end if;

  return jsonb_build_object(
    'status', 'approved',
    'period', coalesce(viewer_projection -> 'period', peer_projection -> 'period'),
    'members', jsonb_build_array(
      jsonb_build_object('userId', viewer_id, 'soundscape', viewer_projection),
      jsonb_build_object('userId', peer_user_id, 'soundscape', peer_projection)
    )
  );
end;
$$;
revoke all on function public.soundscape_common_ground_projection(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.soundscape_common_ground_projection(uuid, text, text)
  to authenticated;

create or replace function public.soundscape_share_projection(
  owner_user_id uuid,
  requested_period_kind text,
  requested_period_key text
) returns jsonb language sql stable security definer set search_path = '' as $$
  select archive.share_projection
  from public.soundscape_archives as archive
  where archive.user_id = owner_user_id
    and archive.period_kind = requested_period_kind
    and archive.period_key = requested_period_key
    and (
      archive.user_id = (select auth.uid())
      or archive.visibility = 'public'
      or (
        archive.visibility = 'connections'
        and (select auth.uid()) is not null
        and private.soundscape_users_are_mutual_connections((select auth.uid()), archive.user_id)
      )
    )
  order by archive.version desc limit 1;
$$;
revoke all on function public.soundscape_share_projection(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.soundscape_share_projection(uuid, text, text)
  to anon, authenticated;

commit;
