alter table public.live_stages
add column if not exists atmosphere_signals jsonb not null default '[]'::jsonb;

alter table public.live_stages
drop constraint if exists live_stages_atmosphere_signals_safe;

alter table public.live_stages
add constraint live_stages_atmosphere_signals_safe
check (
  jsonb_typeof(atmosphere_signals) = 'array'
  and jsonb_array_length(atmosphere_signals) <= 24
);

create or replace function private.refresh_live_stage_atmosphere(stage_id_value uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  next_signals jsonb;
begin
  select coalesce(jsonb_agg(signal order by signal), '[]'::jsonb)
  into next_signals
  from (
    select distinct signal
    from public.live_stage_contributions as contribution
    cross join lateral (
      select nullif(trim(contribution.preferences ->> 'activity'), '') as signal
      union all select nullif(trim(contribution.preferences ->> 'energy'), '')
      union all select nullif(trim(contribution.preferences ->> 'familiarity'), '')
      union all select nullif(trim(contribution.preferences ->> 'sceneArc'), '')
      union all select jsonb_array_elements_text(coalesce(contribution.preferences -> 'moods', '[]'::jsonb))
      union all select jsonb_array_elements_text(coalesce(contribution.preferences -> 'genres', '[]'::jsonb))
    ) as source
    where contribution.stage_id = stage_id_value
      and contribution.ready
      and signal is not null
      and length(signal) between 1 and 120
      and signal !~ '[[:cntrl:]]'
    order by signal
    limit 24
  ) as bounded;

  update public.live_stages
  set atmosphere_signals = next_signals
  where id = stage_id_value
    and atmosphere_signals is distinct from next_signals;
end;
$$;

revoke all on function private.refresh_live_stage_atmosphere(uuid)
from public, anon, authenticated, service_role;

create or replace function private.refresh_live_stage_atmosphere_after_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_live_stage_atmosphere(new.stage_id);
  return new;
end;
$$;

revoke all on function private.refresh_live_stage_atmosphere_after_contribution()
from public, anon, authenticated, service_role;

drop trigger if exists refresh_live_stage_atmosphere_after_contribution
on public.live_stage_contributions;

create trigger refresh_live_stage_atmosphere_after_contribution
after insert or update of preferences, ready
on public.live_stage_contributions
for each row
when (new.ready)
execute function private.refresh_live_stage_atmosphere_after_contribution();

do $$
declare
  stage_record record;
begin
  for stage_record in
    select distinct stage_id
    from public.live_stage_contributions
    where ready
  loop
    perform private.refresh_live_stage_atmosphere(stage_record.stage_id);
  end loop;
end;
$$;
