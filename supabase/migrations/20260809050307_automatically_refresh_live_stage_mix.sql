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

  if current_track_id is not null then
    select item.ordinality::integer - 1 into next_track_index
    from jsonb_array_elements(mixed_tracks) with ordinality as item(track, ordinality)
    where item.track ->> 'id' = current_track_id
    limit 1;

    next_track_index := coalesce(next_track_index, 0);
  end if;

  update public.live_stages
  set
    tracks = mixed_tracks,
    current_track_index = next_track_index,
    updated_at = now()
  where id = stage_id_value
  returning * into stage_row;

  return stage_row;
end;
$$;

revoke all on function private.refresh_live_stage_mix(uuid)
from public, anon, authenticated, service_role;

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
  stage_host_id uuid;
begin
  if current_user_id is null
    or current_user_id is distinct from expected_host_id_value
  then
    raise exception 'Your Canal session changed. Reopen the Stage and try again.'
      using errcode = '42501';
  end if;

  select stage.host_id into stage_host_id
  from public.live_stages as stage
  where stage.id = stage_id_value
    and stage.status = 'live';

  if stage_host_id is null or stage_host_id is distinct from current_user_id then
    raise exception 'Only the host can build this active Stage mix.' using errcode = '42501';
  end if;

  return private.refresh_live_stage_mix(stage_id_value);
end;
$$;

revoke all on function public.build_collaborative_stage_mix(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.build_collaborative_stage_mix(uuid, uuid)
to authenticated;

create or replace function private.refresh_live_stage_mix_after_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_live_stage_mix(new.stage_id);
  return new;
end;
$$;

revoke all on function private.refresh_live_stage_mix_after_contribution()
from public, anon, authenticated, service_role;

drop trigger if exists refresh_live_stage_mix_after_contribution
on public.live_stage_contributions;

create trigger refresh_live_stage_mix_after_contribution
after insert or update of tracks, ready
on public.live_stage_contributions
for each row
when (new.ready)
execute function private.refresh_live_stage_mix_after_contribution();
