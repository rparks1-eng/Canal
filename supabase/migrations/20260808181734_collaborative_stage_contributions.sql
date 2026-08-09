begin;

create table if not exists public.live_stage_contributions (
  stage_id uuid not null
    references public.live_stages(id)
    on delete cascade,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  source_type text not null,
  scene_id text,
  scene_name text,
  preferences jsonb not null default '{}'::jsonb,
  tracks jsonb not null default '[]'::jsonb,
  shares_music_context boolean not null default false,
  consent_version text not null default 'stage-contribution-v1',
  ready boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stage_id, user_id),
  constraint live_stage_contributions_source_check
    check (source_type in ('existing_scene', 'fresh_scene', 'selected_music')),
  constraint live_stage_contributions_scene_id_length
    check (scene_id is null or char_length(scene_id) between 1 and 128),
  constraint live_stage_contributions_scene_name_length
    check (scene_name is null or char_length(trim(scene_name)) between 1 and 80),
  constraint live_stage_contributions_preferences_shape
    check (
      jsonb_typeof(preferences) = 'object'
      and octet_length(preferences::text) <= 8192
      and (preferences - array[
        'activity', 'moods', 'genres', 'energy', 'familiarity',
        'sceneArc', 'allowExplicit', 'notes'
      ]::text[]) = '{}'::jsonb
    ),
  constraint live_stage_contributions_tracks_safe
    check (
      jsonb_typeof(tracks) = 'array'
      and jsonb_array_length(tracks) between 1 and 100
      and octet_length(tracks::text) <= 262144
      and private.live_stage_tracks_are_safe(tracks)
    ),
  constraint live_stage_contributions_consent_version
    check (consent_version = 'stage-contribution-v1'),
  constraint live_stage_contributions_revision_positive
    check (revision > 0)
);

create index if not exists live_stage_contributions_stage_ready_index
on public.live_stage_contributions (stage_id, ready, updated_at);

alter table public.live_stage_contributions enable row level security;

revoke all on public.live_stage_contributions
from public, anon, authenticated, service_role;

grant select on public.live_stage_contributions
to authenticated, service_role;

create policy "Contributors and hosts can read Stage contributions"
on public.live_stage_contributions
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.live_stages as stage
    where stage.id = live_stage_contributions.stage_id
      and stage.host_id = (select auth.uid())
  )
);

create or replace function private.live_stage_preferences_are_safe(
  preference_value jsonb
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select
    jsonb_typeof(preference_value) = 'object'
    and octet_length(preference_value::text) <= 8192
    and (preference_value - array[
      'activity', 'moods', 'genres', 'energy', 'familiarity',
      'sceneArc', 'allowExplicit', 'notes'
    ]::text[]) = '{}'::jsonb
    and not jsonb_path_exists(
      preference_value,
      '$.** ? (@.type() == "string" && @.size() > 300)'
    )
    and not jsonb_path_exists(
      preference_value,
      '$.** ? (@.type() == "array" && @.size() > 12)'
    );
$$;

revoke all on function private.live_stage_preferences_are_safe(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.submit_live_stage_contribution(
  stage_id_value uuid,
  expected_user_id_value uuid,
  source_type_value text,
  scene_id_value text,
  scene_name_value text,
  preferences_value jsonb,
  tracks_value jsonb,
  shares_music_context_value boolean default false
)
returns public.live_stage_contributions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  contribution public.live_stage_contributions%rowtype;
begin
  if current_user_id is null or current_user_id is distinct from expected_user_id_value then
    raise exception 'Your Canal session changed. Reopen the Stage and try again.'
      using errcode = '42501';
  end if;

  if source_type_value not in ('existing_scene', 'fresh_scene', 'selected_music') then
    raise exception 'Choose a valid Stage contribution.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.live_stages as stage
    join public.live_stage_members as member
      on member.stage_id = stage.id
     and member.user_id = current_user_id
    where stage.id = stage_id_value
      and stage.status = 'live'
  ) then
    raise exception 'Join this active Stage before contributing.' using errcode = '42501';
  end if;

  if not private.live_stage_preferences_are_safe(coalesce(preferences_value, '{}'::jsonb))
    or not private.live_stage_tracks_are_safe(tracks_value)
    or jsonb_array_length(tracks_value) < 1
  then
    raise exception 'This Stage contribution is invalid or too large.' using errcode = '22023';
  end if;

  insert into public.live_stage_contributions (
    stage_id, user_id, source_type, scene_id, scene_name, preferences,
    tracks, shares_music_context, consent_version, ready
  ) values (
    stage_id_value,
    current_user_id,
    source_type_value,
    nullif(btrim(scene_id_value), ''),
    nullif(left(btrim(scene_name_value), 80), ''),
    coalesce(preferences_value, '{}'::jsonb),
    tracks_value,
    coalesce(shares_music_context_value, false),
    'stage-contribution-v1',
    true
  )
  on conflict (stage_id, user_id)
  do update set
    source_type = excluded.source_type,
    scene_id = excluded.scene_id,
    scene_name = excluded.scene_name,
    preferences = excluded.preferences,
    tracks = excluded.tracks,
    shares_music_context = excluded.shares_music_context,
    consent_version = excluded.consent_version,
    ready = true,
    revision = public.live_stage_contributions.revision + 1,
    updated_at = now()
  returning * into contribution;

  return contribution;
end;
$$;

revoke all on function public.submit_live_stage_contribution(
  uuid, uuid, text, text, text, jsonb, jsonb, boolean
) from public, anon, authenticated, service_role;

grant execute on function public.submit_live_stage_contribution(
  uuid, uuid, text, text, text, jsonb, jsonb, boolean
) to authenticated;

create or replace function public.list_live_stage_contribution_statuses(
  stage_id_value uuid
)
returns table (
  user_id uuid,
  display_name text,
  handle text,
  source_type text,
  scene_name text,
  ready boolean,
  track_count integer,
  shares_music_context boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_access_live_stage(stage_id_value) then
    raise exception 'This Stage is unavailable.' using errcode = '42501';
  end if;

  return query
  select
    member.user_id,
    member.display_name,
    member.handle,
    contribution.source_type,
    contribution.scene_name,
    coalesce(contribution.ready, false),
    coalesce(jsonb_array_length(contribution.tracks), 0),
    coalesce(contribution.shares_music_context, false),
    contribution.updated_at
  from public.live_stage_members as member
  left join public.live_stage_contributions as contribution
    on contribution.stage_id = member.stage_id
   and contribution.user_id = member.user_id
  where member.stage_id = stage_id_value
  order by
    case member.role when 'host' then 0 when 'collaborator' then 1 else 2 end,
    member.joined_at,
    member.user_id;
end;
$$;

revoke all on function public.list_live_stage_contribution_statuses(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.list_live_stage_contribution_statuses(uuid)
to authenticated;

create or replace function public.build_collaborative_stage_mix(
  stage_id_value uuid,
  expected_host_id_value uuid
)
returns public.live_stages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  mixed_tracks jsonb;
  stage_row public.live_stages%rowtype;
begin
  if current_user_id is null
    or current_user_id is distinct from expected_host_id_value
  then
    raise exception 'Your Canal session changed. Reopen the Stage and try again.'
      using errcode = '42501';
  end if;

  select * into stage_row
  from public.live_stages as stage
  where stage.id = stage_id_value
    and stage.host_id = current_user_id
    and stage.status = 'live'
  for update;

  if stage_row.id is null then
    raise exception 'Only the host can build this active Stage mix.' using errcode = '42501';
  end if;

  with expanded as (
    select
      contribution.user_id,
      item.ordinality::integer as source_ordinal,
      item.track,
      item.track ->> 'id' as track_id
    from public.live_stage_contributions as contribution
    cross join lateral jsonb_array_elements(contribution.tracks)
      with ordinality as item(track, ordinality)
    where contribution.stage_id = stage_id_value
      and contribution.ready
  ),
  counts as (
    select track_id, count(distinct user_id)::integer as overlap_count
    from expanded
    group by track_id
  ),
  owned as (
    select distinct on (expanded.track_id)
      expanded.user_id,
      expanded.source_ordinal,
      expanded.track,
      expanded.track_id,
      counts.overlap_count
    from expanded
    join counts using (track_id)
    order by expanded.track_id, expanded.user_id, expanded.source_ordinal
  ),
  balanced as (
    select
      owned.*,
      row_number() over (
        partition by owned.user_id
        order by owned.source_ordinal, md5(stage_id_value::text || owned.track_id)
      ) as owner_round
    from owned
  ),
  limited as (
    select *
    from balanced
    order by
      case when overlap_count > 1 then 0 else 1 end,
      case when overlap_count > 1 then -overlap_count else owner_round::integer end,
      md5(stage_id_value::text || track_id),
      user_id
    limit 100
  )
  select jsonb_agg(track order by
    case when overlap_count > 1 then 0 else 1 end,
    case when overlap_count > 1 then -overlap_count else owner_round::integer end,
    md5(stage_id_value::text || track_id),
    user_id
  ) into mixed_tracks
  from limited;

  if mixed_tracks is null or jsonb_array_length(mixed_tracks) < 1 then
    raise exception 'At least one collaborator must submit a Scene before mixing.'
      using errcode = '22023';
  end if;

  update public.live_stages
  set
    tracks = mixed_tracks,
    current_track_index = 0,
    updated_at = now()
  where id = stage_id_value
  returning * into stage_row;

  return stage_row;
end;
$$;

revoke all on function public.build_collaborative_stage_mix(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.build_collaborative_stage_mix(uuid, uuid)
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
  if tg_table_schema <> 'public'
    or tg_table_name not in (
      'live_stages', 'live_stage_members', 'live_stage_messages',
      'live_stage_contributions'
    )
  then
    raise exception 'Unexpected live Stage broadcast source.' using errcode = '22023';
  end if;

  if tg_table_name = 'live_stages' then
    target_stage_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_stage_id := case when tg_op = 'DELETE' then old.stage_id else new.stage_id end;
  end if;

  perform realtime.send(
    jsonb_build_object('stage_id', target_stage_id::text),
    'stage_changed',
    'live-stage:' || target_stage_id::text,
    true
  );

  return null;
end;
$$;

revoke all on function private.broadcast_live_stage_changed()
from public, anon, authenticated, service_role;

create trigger live_stage_contributions_broadcast_change
after insert or update or delete
on public.live_stage_contributions
for each row execute function private.broadcast_live_stage_changed();

commit;
