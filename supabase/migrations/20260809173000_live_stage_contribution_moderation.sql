begin;

-- Existing ready contributions may already have replaced live_stages.tracks with a
-- collaborative mix. There is no reliable way to reconstruct the host's original
-- base from that mixed payload, so fail closed instead of recording a false base.
do $$
begin
  if exists (
    select 1
    from public.live_stage_contributions contribution
    where contribution.ready
  ) then
    raise exception
      'Stage moderation migration requires remediation of existing ready contributions before deployment.'
      using errcode = '55000';
  end if;
end;
$$;

alter table public.live_stages
add column if not exists collaboration_base_tracks jsonb;

update public.live_stages
set collaboration_base_tracks = tracks
where collaboration_base_tracks is null;

alter table public.live_stages
alter column collaboration_base_tracks set default '[]'::jsonb;

create or replace function private.capture_live_stage_collaboration_base()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.collaboration_base_tracks is null or jsonb_array_length(new.collaboration_base_tracks) = 0 then
    new.collaboration_base_tracks := new.tracks;
  end if;
  return new;
end;
$$;
revoke all on function private.capture_live_stage_collaboration_base() from public, anon, authenticated, service_role;
drop trigger if exists capture_live_stage_collaboration_base on public.live_stages;
create trigger capture_live_stage_collaboration_base
before insert on public.live_stages for each row
execute function private.capture_live_stage_collaboration_base();

alter table public.live_stage_contributions
add column if not exists moderation_status text not null default 'pending';

alter table public.live_stage_contributions
drop constraint if exists live_stage_contributions_moderation_status_check;
alter table public.live_stage_contributions
add constraint live_stage_contributions_moderation_status_check
check (moderation_status in ('pending', 'approved', 'rejected'));

create or replace function private.reset_live_stage_contribution_moderation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.moderation_status := 'pending';
  new.ready := false;
  return new;
end;
$$;
revoke all on function private.reset_live_stage_contribution_moderation() from public, anon, authenticated, service_role;
drop trigger if exists reset_live_stage_contribution_moderation on public.live_stage_contributions;
create trigger reset_live_stage_contribution_moderation
before insert or update of tracks on public.live_stage_contributions
for each row execute function private.reset_live_stage_contribution_moderation();

create or replace function private.refresh_live_stage_mix(stage_id_value uuid)
returns public.live_stages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mixed_tracks jsonb;
  stage_row public.live_stages%rowtype;
  current_track_id text;
  next_track_index integer := 0;
begin
  select * into stage_row
  from public.live_stages as stage
  where stage.id = stage_id_value
    and stage.status = 'live'
  for update;

  if stage_row.id is null then
    raise exception 'This active Stage is no longer available.' using errcode = '22023';
  end if;

  current_track_id := stage_row.tracks -> stage_row.current_track_index ->> 'id';

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
      and contribution.moderation_status = 'approved'
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
    raise exception 'At least one approved collaborator must submit a Scene before mixing.'
      using errcode = '22023';
  end if;

  if current_track_id is not null then
    select item.ordinality::integer - 1 into next_track_index
    from jsonb_array_elements(mixed_tracks) with ordinality as item(track, ordinality)
    where item.track ->> 'id' = current_track_id
    limit 1;
    next_track_index := coalesce(next_track_index, 0);
  end if;

  update public.live_stages
  set tracks = mixed_tracks,
      current_track_index = next_track_index,
      updated_at = now()
  where id = stage_id_value
  returning * into stage_row;

  return stage_row;
end;
$$;

revoke all on function private.refresh_live_stage_mix(uuid)
from public, anon, authenticated, service_role;

create table if not exists public.live_stage_mix_revisions (
  stage_id uuid not null references public.live_stages(id) on delete cascade,
  revision bigint generated always as identity,
  tracks jsonb not null,
  current_track_index integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (stage_id, revision),
  constraint live_stage_mix_revision_tracks_safe check (
    jsonb_typeof(tracks) = 'array'
    and jsonb_array_length(tracks) <= 100
    and private.live_stage_tracks_are_safe(tracks)
  )
);

alter table public.live_stage_mix_revisions enable row level security;
revoke all on public.live_stage_mix_revisions from public, anon, authenticated, service_role;
grant select on public.live_stage_mix_revisions to authenticated;
create policy "Stage hosts can read mix revisions"
on public.live_stage_mix_revisions for select to authenticated
using (exists (
  select 1 from public.live_stages stage
  where stage.id = live_stage_mix_revisions.stage_id
    and stage.host_id = (select auth.uid())
));

create or replace function private.archive_live_stage_mix_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.tracks is distinct from new.tracks then
    insert into public.live_stage_mix_revisions(stage_id, tracks, current_track_index)
    values (old.id, old.tracks, old.current_track_index);
  end if;
  return new;
end;
$$;
revoke all on function private.archive_live_stage_mix_revision() from public, anon, authenticated, service_role;
drop trigger if exists archive_live_stage_mix_revision on public.live_stages;
create trigger archive_live_stage_mix_revision
before update of tracks on public.live_stages
for each row execute function private.archive_live_stage_mix_revision();

drop function if exists public.list_live_stage_contribution_statuses(uuid);
create function public.list_live_stage_contribution_statuses(stage_id_value uuid)
returns table (
  user_id uuid, display_name text, handle text, source_type text, scene_name text,
  ready boolean, track_count integer, shares_music_context boolean,
  moderation_status text, contribution_revision bigint, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.live_stage_members member
    where member.stage_id = stage_id_value and member.user_id = (select auth.uid())
  ) then
    raise exception 'This Stage is unavailable.' using errcode = '42501';
  end if;
  return query
  select member.user_id, member.display_name, member.handle,
    contribution.source_type, contribution.scene_name, coalesce(contribution.ready, false),
    coalesce(jsonb_array_length(contribution.tracks), 0),
    coalesce(contribution.shares_music_context, false),
    coalesce(contribution.moderation_status, 'pending'),
    coalesce(contribution.revision, 0), contribution.updated_at
  from public.live_stage_members member
  left join public.live_stage_contributions contribution
    on contribution.stage_id = member.stage_id and contribution.user_id = member.user_id
  where member.stage_id = stage_id_value
  order by case member.role when 'host' then 0 when 'collaborator' then 1 else 2 end,
    member.joined_at, member.user_id;
end;
$$;
revoke all on function public.list_live_stage_contribution_statuses(uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_live_stage_contribution_statuses(uuid) to authenticated;

create or replace function public.moderate_live_stage_contribution(
  stage_id_value uuid, contributor_id_value uuid, action_value text, expected_host_id_value uuid,
  expected_contribution_revision_value bigint
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or current_user_id is distinct from expected_host_id_value then
    raise exception 'Your Canal session changed. Reopen the Stage and try again.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.live_stages where id = stage_id_value and host_id = current_user_id and status = 'live') then
    raise exception 'Only the host can moderate this active Stage.' using errcode = '42501';
  end if;
  if action_value = 'remove' then
    delete from public.live_stage_contributions
    where stage_id = stage_id_value and user_id = contributor_id_value
      and revision = expected_contribution_revision_value;
  elsif action_value in ('approve', 'reject') then
    update public.live_stage_contributions
    set moderation_status = case action_value when 'approve' then 'approved' else 'rejected' end,
        ready = action_value = 'approve',
        revision = revision + 1, updated_at = now()
    where stage_id = stage_id_value and user_id = contributor_id_value
      and revision = expected_contribution_revision_value;
  else
    raise exception 'Choose approve, reject, or remove.' using errcode = '22023';
  end if;
  if not found then raise exception 'This contribution changed. Reload before moderating it.' using errcode = '40001'; end if;

  if exists (select 1 from public.live_stage_contributions where stage_id = stage_id_value and ready and moderation_status = 'approved') then
    perform private.refresh_live_stage_mix(stage_id_value);
  else
    update public.live_stages
    set tracks = collaboration_base_tracks, current_track_index = 0, updated_at = now()
    where id = stage_id_value and host_id = current_user_id;
  end if;
end;
$$;
revoke all on function public.moderate_live_stage_contribution(uuid, uuid, text, uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.moderate_live_stage_contribution(uuid, uuid, text, uuid, bigint) to authenticated;

drop function if exists public.join_live_stage_as_collaborator_by_code(text, uuid);
create function public.join_live_stage_as_collaborator_by_code(
  stage_code_value text, expected_stage_id uuid default null
) returns setof public.live_stages language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid()); matched_stage_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication is required to join a Stage.' using errcode = '42501'; end if;
  if not private.consume_live_stage_join_attempt(current_user_id) then return; end if;
  if coalesce(stage_code_value, '') !~ '^[0-9]{6}$' then return; end if;
  select stage.id into matched_stage_id from public.live_stages stage
  where stage.stage_code = stage_code_value and stage.status = 'live' for share;
  if matched_stage_id is null or (expected_stage_id is not null and expected_stage_id <> matched_stage_id) then return; end if;
  insert into public.live_stage_members(stage_id, user_id, role)
  values (matched_stage_id, current_user_id, 'collaborator')
  on conflict (stage_id, user_id) do update
  set role = case when public.live_stage_members.role = 'host' then 'host' else 'collaborator' end;
  return query select stage.* from public.live_stages stage where stage.id = matched_stage_id;
end;
$$;
revoke all on function public.join_live_stage_as_collaborator_by_code(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.join_live_stage_as_collaborator_by_code(text, uuid) to authenticated;

create or replace function public.rollback_live_stage_mix(
  stage_id_value uuid, revision_value bigint, expected_host_id_value uuid,
  expected_stage_updated_at_value timestamptz
) returns public.live_stages language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid()); revision_row public.live_stage_mix_revisions%rowtype; stage_row public.live_stages%rowtype;
begin
  if current_user_id is null or current_user_id is distinct from expected_host_id_value then
    raise exception 'Your Canal session changed. Reopen the Stage and try again.' using errcode = '42501';
  end if;
  select * into stage_row from public.live_stages where id = stage_id_value and host_id = current_user_id and status = 'live' for update;
  if stage_row.id is null then raise exception 'Only the host can roll back this active Stage.' using errcode = '42501'; end if;
  if stage_row.updated_at is distinct from expected_stage_updated_at_value then
    raise exception 'This Stage mix changed. Reload before rolling it back.' using errcode = '40001';
  end if;
  select * into revision_row from public.live_stage_mix_revisions where stage_id = stage_id_value and revision = revision_value;
  if revision_row.stage_id is null then raise exception 'That Stage mix revision is unavailable.' using errcode = '22023'; end if;
  update public.live_stages set tracks = revision_row.tracks,
    current_track_index = least(revision_row.current_track_index, greatest(jsonb_array_length(revision_row.tracks) - 1, 0)), updated_at = now()
  where id = stage_id_value returning * into stage_row;
  return stage_row;
end;
$$;
revoke all on function public.rollback_live_stage_mix(uuid, bigint, uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.rollback_live_stage_mix(uuid, bigint, uuid, timestamptz) to authenticated;

commit;
