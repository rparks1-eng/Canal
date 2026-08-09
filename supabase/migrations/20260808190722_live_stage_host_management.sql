begin;

alter table public.live_stages
add column if not exists started_at timestamptz;

update public.live_stages
set started_at = created_at
where started_at is null;

alter table public.live_stages
alter column started_at set default now(),
alter column started_at set not null;

create index if not exists live_stages_host_status_started_index
on public.live_stages (
  host_id,
  status,
  started_at desc
);

create or replace function private.touch_live_stage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();

  if (
    new.status = 'ended'
    and old.status is distinct from 'ended'
  ) then
    new.ended_at = now();
  elsif (
    new.status = 'live'
    and old.status is distinct from 'live'
  ) then
    new.started_at = now();
    new.ended_at = null;
  elsif new.status = 'live' then
    new.ended_at = null;
  end if;

  return new;
end;
$$;

revoke all
on function private.touch_live_stage()
from public, anon, authenticated, service_role;

commit;
