begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.scenes
add column if not exists public_share_id uuid;

update public.scenes
set public_share_id = gen_random_uuid()
where public_share_id is null;

alter table public.scenes
alter column public_share_id set default gen_random_uuid(),
alter column public_share_id set not null;

create unique index if not exists scenes_public_share_id_unique_index
on public.scenes (public_share_id);

alter table public.snapshots
add column if not exists public_share_id uuid;

update public.snapshots
set public_share_id = gen_random_uuid()
where public_share_id is null;

alter table public.snapshots
alter column public_share_id set default gen_random_uuid(),
alter column public_share_id set not null;

create unique index if not exists snapshots_public_share_id_unique_index
on public.snapshots (public_share_id);

create table if not exists private.live_stage_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.live_stages(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash bytea not null unique,
  grant_role text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_redemptions integer not null default 1,
  redemption_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_stage_invite_tokens_role_check
    check (grant_role in ('listener', 'member', 'collaborator')),
  constraint live_stage_invite_tokens_expiry_check
    check (expires_at > created_at),
  constraint live_stage_invite_tokens_redemption_bounds
    check (
      max_redemptions between 1 and 100
      and redemption_count between 0 and max_redemptions
    )
);

create index if not exists live_stage_invite_tokens_creator_stage_index
on private.live_stage_invite_tokens (created_by, stage_id, created_at desc);

create index if not exists live_stage_invite_tokens_expiry_index
on private.live_stage_invite_tokens (expires_at)
where revoked_at is null;

create table if not exists private.live_stage_invite_redemptions (
  token_id uuid not null references private.live_stage_invite_tokens(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage_id uuid not null references public.live_stages(id) on delete cascade,
  granted_role text not null,
  redeemed_at timestamptz not null default timezone('utc', now()),
  primary key (token_id, user_id),
  constraint live_stage_invite_redemptions_role_check
    check (granted_role in ('listener', 'member', 'collaborator'))
);

create index if not exists live_stage_invite_redemptions_user_index
on private.live_stage_invite_redemptions (user_id, redeemed_at desc);

create table if not exists private.live_stage_invite_redemption_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_bucket timestamptz not null,
  attempt_count integer not null default 1 check (attempt_count between 1 and 8),
  primary key (user_id, attempt_bucket)
);

alter table private.live_stage_invite_tokens enable row level security;
alter table private.live_stage_invite_redemptions enable row level security;
alter table private.live_stage_invite_redemption_attempts enable row level security;

revoke all on private.live_stage_invite_tokens from public, anon, authenticated;
revoke all on private.live_stage_invite_redemptions from public, anon, authenticated;
revoke all on private.live_stage_invite_redemption_attempts from public, anon, authenticated;

create or replace function private.consume_live_stage_invite_redemption_attempt(
  user_id_value uuid
) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  bucket_value timestamptz := date_trunc('minute', timezone('utc', now()));
  next_count integer;
begin
  if user_id_value is null or user_id_value <> (select auth.uid()) then
    return false;
  end if;

  insert into private.live_stage_invite_redemption_attempts (
    user_id,
    attempt_bucket,
    attempt_count
  ) values (
    user_id_value,
    bucket_value,
    1
  )
  on conflict (user_id, attempt_bucket) do update
  set attempt_count = least(
    private.live_stage_invite_redemption_attempts.attempt_count + 1,
    8
  )
  returning attempt_count into next_count;

  delete from private.live_stage_invite_redemption_attempts
  where attempt_bucket < bucket_value - interval '10 minutes';

  return next_count <= 7;
end;
$$;

revoke all on function private.consume_live_stage_invite_redemption_attempt(uuid)
from public, anon, authenticated, service_role;

create or replace function private.create_live_stage_invite_token(
  stage_id_value uuid,
  grant_role_value text,
  expires_in_seconds integer,
  max_redemptions_value integer
) returns table (
  invite_token text,
  expires_at timestamptz,
  grant_role text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_role text := lower(trim(coalesce(grant_role_value, '')));
  raw_token text;
  expiry_value timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if normalized_role not in ('listener', 'member', 'collaborator') then
    raise exception 'Invite role is invalid.' using errcode = '22023';
  end if;

  if expires_in_seconds not between 300 and 2592000 then
    raise exception 'Invite lifetime must be between five minutes and thirty days.'
      using errcode = '22023';
  end if;

  if max_redemptions_value not between 1 and 100 then
    raise exception 'Invite redemption limit is invalid.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.live_stages as stage
    where stage.id = stage_id_value
      and stage.host_id = current_user_id
      and stage.status = 'live'
  ) then
    raise exception 'Only the host of a live Stage can create an invite.'
      using errcode = '42501';
  end if;

  raw_token := rtrim(
    translate(
      encode(extensions.gen_random_bytes(32), 'base64'),
      '+/',
      '-_'
    ),
    '='
  );
  expiry_value := timezone('utc', now()) + make_interval(secs => expires_in_seconds);

  insert into private.live_stage_invite_tokens (
    stage_id,
    created_by,
    token_hash,
    grant_role,
    expires_at,
    max_redemptions
  ) values (
    stage_id_value,
    current_user_id,
    extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'),
    normalized_role,
    expiry_value,
    max_redemptions_value
  );

  return query select raw_token, expiry_value, normalized_role;
end;
$$;

revoke all on function private.create_live_stage_invite_token(uuid, text, integer, integer)
from public, anon, authenticated, service_role;

create or replace function public.create_live_stage_invite_link(
  stage_id_value uuid,
  grant_role_value text,
  expires_in_seconds integer default 86400,
  max_redemptions_value integer default 1
) returns table (
  invite_token text,
  expires_at timestamptz,
  grant_role text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.create_live_stage_invite_token(
    stage_id_value,
    grant_role_value,
    expires_in_seconds,
    max_redemptions_value
  );
$$;

revoke all on function public.create_live_stage_invite_link(uuid, text, integer, integer)
from public, anon, authenticated, service_role;
grant execute on function public.create_live_stage_invite_link(uuid, text, integer, integer)
to authenticated;

create or replace function private.revoke_live_stage_invite_token(
  invite_token_value text
) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  changed_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if invite_token_value is null
    or invite_token_value !~ '^[A-Za-z0-9_-]{43}$' then
    return false;
  end if;

  update private.live_stage_invite_tokens as invite
  set revoked_at = coalesce(invite.revoked_at, timezone('utc', now()))
  where invite.token_hash = extensions.digest(
    convert_to(invite_token_value, 'UTF8'),
    'sha256'
  )
    and invite.created_by = current_user_id;

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

revoke all on function private.revoke_live_stage_invite_token(text)
from public, anon, authenticated, service_role;

create or replace function public.revoke_live_stage_invite_link(
  invite_token_value text
) returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select private.revoke_live_stage_invite_token(invite_token_value);
$$;

revoke all on function public.revoke_live_stage_invite_link(text)
from public, anon, authenticated, service_role;
grant execute on function public.revoke_live_stage_invite_link(text)
to authenticated;

create or replace function private.redeem_live_stage_invite_token(
  expected_stage_id_value uuid,
  invite_token_value text
) returns table (
  stage_id uuid,
  granted_role text,
  already_redeemed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invite_row private.live_stage_invite_tokens%rowtype;
  prior_redemption private.live_stage_invite_redemptions%rowtype;
  membership_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not private.consume_live_stage_invite_redemption_attempt(current_user_id) then
    raise exception 'Too many invite attempts. Try again shortly.' using errcode = 'P0001';
  end if;

  if invite_token_value is null
    or invite_token_value !~ '^[A-Za-z0-9_-]{43}$' then
    return;
  end if;

  select invite.*
  into invite_row
  from private.live_stage_invite_tokens as invite
  where invite.token_hash = extensions.digest(
    convert_to(invite_token_value, 'UTF8'),
    'sha256'
  )
  for update;

  if invite_row.id is null then
    return;
  end if;

  if invite_row.stage_id is distinct from expected_stage_id_value then
    return;
  end if;

  select redemption.*
  into prior_redemption
  from private.live_stage_invite_redemptions as redemption
  where redemption.token_id = invite_row.id
    and redemption.user_id = current_user_id;

  if prior_redemption.token_id is not null then
    return query select
      prior_redemption.stage_id,
      prior_redemption.granted_role,
      true;
    return;
  end if;

  if invite_row.revoked_at is not null
    or invite_row.expires_at <= timezone('utc', now())
    or invite_row.redemption_count >= invite_row.max_redemptions
    or not exists (
      select 1
      from public.live_stages as stage
      where stage.id = invite_row.stage_id
        and stage.status = 'live'
    ) then
    return;
  end if;

  membership_role := case
    when invite_row.grant_role = 'collaborator' then 'collaborator'
    else 'listener'
  end;

  insert into public.live_stage_members (
    stage_id,
    user_id,
    role
  ) values (
    invite_row.stage_id,
    current_user_id,
    membership_role
  )
  on conflict (stage_id, user_id) do update
  set
    role = case
      when public.live_stage_members.role in ('host', 'collaborator')
        then public.live_stage_members.role
      else excluded.role
    end,
    last_seen_at = timezone('utc', now());

  insert into private.live_stage_invite_redemptions (
    token_id,
    user_id,
    stage_id,
    granted_role
  ) values (
    invite_row.id,
    current_user_id,
    invite_row.stage_id,
    invite_row.grant_role
  );

  update private.live_stage_invite_tokens
  set redemption_count = redemption_count + 1
  where id = invite_row.id;

  return query select invite_row.stage_id, invite_row.grant_role, false;
end;
$$;

revoke all on function private.redeem_live_stage_invite_token(uuid, text)
from public, anon, authenticated, service_role;

create or replace function public.redeem_live_stage_invite_link(
  expected_stage_id_value uuid,
  invite_token_value text
) returns table (
  stage_id uuid,
  granted_role text,
  already_redeemed boolean
)
language sql
volatile
security definer
set search_path = ''
as $$
  select * from private.redeem_live_stage_invite_token(
    expected_stage_id_value,
    invite_token_value
  );
$$;

revoke all on function public.redeem_live_stage_invite_link(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.redeem_live_stage_invite_link(uuid, text)
to authenticated;

create or replace function public.get_or_create_public_scene_share_id(
  scene_id_value text
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  share_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select scene.public_share_id
  into share_id
  from public.scenes as scene
  where scene.user_id = current_user_id
    and scene.id = scene_id_value
    and scene.deleted_at is null
    and coalesce(scene.payload ->> 'visibility', 'private') = 'public';

  if share_id is null then
    raise exception 'Publish this Scene before sharing it.' using errcode = '22023';
  end if;
  return share_id;
end;
$$;

revoke all on function public.get_or_create_public_scene_share_id(text)
from public, anon, authenticated, service_role;
grant execute on function public.get_or_create_public_scene_share_id(text)
to authenticated;

create or replace function public.get_or_create_public_snapshot_share_id(
  snapshot_id_value text
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  share_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select snapshot.public_share_id
  into share_id
  from public.snapshots as snapshot
  where snapshot.user_id = current_user_id
    and snapshot.id = snapshot_id_value
    and snapshot.visibility = 'public';

  if share_id is null then
    raise exception 'Publish this Snapshot before sharing it.' using errcode = '22023';
  end if;
  return share_id;
end;
$$;

revoke all on function public.get_or_create_public_snapshot_share_id(text)
from public, anon, authenticated, service_role;
grant execute on function public.get_or_create_public_snapshot_share_id(text)
to authenticated;

create or replace function public.get_public_scene_link_preview(
  public_share_id_value uuid
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'scene',
    'id', scene.public_share_id,
    'title', left(coalesce(nullif(trim(scene.payload ->> 'name'), ''), 'Untitled Scene'), 80),
    'activity', left(coalesce(nullif(trim(scene.payload ->> 'activity'), ''), 'Listening'), 120),
    'moods', coalesce(scene.payload -> 'emotions', '[]'::jsonb),
    'genres', coalesce(scene.payload -> 'genres', '[]'::jsonb),
    'ownerDisplayName', profile.display_name,
    'ownerHandle', profile.handle,
    'updatedAt', scene.updated_at
  )
  from public.scenes as scene
  join public.profiles as profile on profile.id = scene.user_id
  where scene.public_share_id = public_share_id_value
    and scene.deleted_at is null
    and coalesce(scene.payload ->> 'visibility', 'private') = 'public'
    and profile.is_public = true
  limit 1;
$$;

revoke all on function public.get_public_scene_link_preview(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_scene_link_preview(uuid)
to anon, authenticated;

create or replace function public.get_public_snapshot_link_preview(
  public_share_id_value uuid
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'snapshot',
    'id', snapshot.public_share_id,
    'sceneName', snapshot.scene_name,
    'sceneActivity', snapshot.scene_activity,
    'trackTitle', snapshot.track_title,
    'trackArtist', snapshot.track_artist,
    'trackImageUrl', snapshot.track_image_url,
    'mediaType', snapshot.media_type,
    'ownerDisplayName', profile.display_name,
    'ownerHandle', profile.handle,
    'updatedAt', snapshot.updated_at
  )
  from public.snapshots as snapshot
  join public.profiles as profile on profile.id = snapshot.user_id
  where snapshot.public_share_id = public_share_id_value
    and snapshot.visibility = 'public'
    and profile.is_public = true
  limit 1;
$$;

revoke all on function public.get_public_snapshot_link_preview(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_snapshot_link_preview(uuid)
to anon, authenticated;

create or replace function public.get_public_stage_link_preview(
  stage_id_value uuid
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'stage',
    'id', stage.id,
    'name', stage.name,
    'activity', stage.activity,
    'status', stage.status,
    'hostDisplayName', stage.host_display_name,
    'hostHandle', stage.host_handle,
    'hostIsVerified', stage.host_is_verified,
    'hostIsCanal', stage.host_is_canal,
    'stageKind', stage.stage_kind,
    'trackCount', jsonb_array_length(stage.tracks),
    'createdAt', stage.created_at,
    'updatedAt', stage.updated_at
  )
  from public.live_stages as stage
  join public.profiles as profile on profile.id = stage.host_id
  where stage.id = stage_id_value
    and stage.visibility = 'public'
    and profile.is_public = true
  limit 1;
$$;

revoke all on function public.get_public_stage_link_preview(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_stage_link_preview(uuid)
to anon, authenticated;

commit;
