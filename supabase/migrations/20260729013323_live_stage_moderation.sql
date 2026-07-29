create table if not exists private.live_stage_message_rate_limits (
  stage_id uuid not null
    references public.live_stages(id)
    on delete cascade,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  window_started_at timestamptz not null
    default now(),
  message_count integer not null
    default 0,
  primary key (stage_id, user_id),
  constraint live_stage_message_rate_limits_count
    check (message_count >= 0)
);

revoke all
on private.live_stage_message_rate_limits
from public, anon, authenticated, service_role;

create table if not exists public.live_stage_bans (
  stage_id uuid not null
    references public.live_stages(id)
    on delete cascade,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  created_by uuid not null,
  reason text,
  created_at timestamptz not null
    default now(),
  primary key (stage_id, user_id),
  constraint live_stage_bans_reason_length
    check (
      reason is null
      or (
        char_length(reason) between 1 and 240
        and octet_length(reason) <= 960
        and reason = btrim(reason)
        and reason !~ '[[:cntrl:]]'
      )
    )
);

create index if not exists live_stage_bans_user_stage_index
on public.live_stage_bans (user_id, stage_id);

create table if not exists public.live_stage_moderation_events (
  id uuid primary key
    default gen_random_uuid(),
  stage_id uuid not null,
  actor_id uuid not null,
  target_user_id uuid,
  message_id uuid,
  action text not null,
  report_reason text,
  moderation_reason text,
  evidence_body text,
  created_at timestamptz not null
    default now(),
  constraint live_stage_moderation_events_action
    check (
      action in (
        'message_reported',
        'message_removed',
        'member_promoted',
        'member_demoted',
        'member_removed'
      )
    ),
  constraint live_stage_moderation_events_report_reason
    check (
      report_reason is null
      or report_reason in (
        'spam',
        'harassment',
        'unsafe_content',
        'other'
      )
    ),
  constraint live_stage_moderation_events_report_context
    check (
      (
        action = 'message_reported'
        and report_reason is not null
        and target_user_id is not null
        and message_id is not null
        and evidence_body is not null
      )
      or (
        action <> 'message_reported'
        and report_reason is null
      )
    ),
  constraint live_stage_moderation_events_reason_length
    check (
      moderation_reason is null
      or (
        char_length(moderation_reason)
          between 1 and 240
        and octet_length(moderation_reason)
          <= 960
        and moderation_reason =
          btrim(moderation_reason)
        and moderation_reason
          !~ '[[:cntrl:]]'
      )
    ),
  constraint live_stage_moderation_events_body_length
    check (
      evidence_body is null
      or (
        char_length(evidence_body)
          between 1 and 500
        and octet_length(evidence_body)
          <= 2000
      )
    )
);

create index if not exists live_stage_moderation_events_stage_created_index
on public.live_stage_moderation_events (
  stage_id,
  created_at desc
);

create index if not exists live_stage_moderation_events_actor_created_index
on public.live_stage_moderation_events (
  actor_id,
  created_at desc
);

create unique index if not exists live_stage_message_reports_actor_unique
on public.live_stage_moderation_events (
  stage_id,
  actor_id,
  message_id,
  action
)
where action = 'message_reported';

alter table public.live_stage_bans
enable row level security;

alter table public.live_stage_moderation_events
enable row level security;

revoke all
on public.live_stage_bans,
   public.live_stage_moderation_events
from public, anon, authenticated, service_role;

grant select
on public.live_stage_bans,
   public.live_stage_moderation_events
to authenticated, service_role;

drop policy if exists "Hosts can read live Stage bans"
on public.live_stage_bans;

create policy "Hosts can read live Stage bans"
on public.live_stage_bans
for select
to authenticated
using (
  exists (
    select 1
    from public.live_stages as stage
    where stage.id =
      live_stage_bans.stage_id
      and stage.host_id =
        (select auth.uid())
  )
);

drop policy if exists "Actors and hosts can read live Stage moderation evidence"
on public.live_stage_moderation_events;

create policy "Actors and hosts can read live Stage moderation evidence"
on public.live_stage_moderation_events
for select
to authenticated
using (
  actor_id = (select auth.uid())
  or (
    action <> 'message_reported'
    and exists (
      select 1
      from public.live_stages as stage
      where stage.id =
        live_stage_moderation_events.stage_id
        and stage.host_id =
          (select auth.uid())
    )
  )
);

create or replace function private.enforce_live_stage_message_throttle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  attempt_time timestamptz :=
    now();
  current_count integer;
begin
  if current_user_id is null
    or new.user_id is distinct from
      current_user_id then
    raise exception
      'Authentication is required to send a Stage message.'
      using errcode = '42501';
  end if;

  insert into private.live_stage_message_rate_limits (
    stage_id,
    user_id,
    window_started_at,
    message_count
  )
  values (
    new.stage_id,
    current_user_id,
    attempt_time,
    1
  )
  on conflict (stage_id, user_id)
  do update
  set
    window_started_at =
      case
        when private.live_stage_message_rate_limits
          .window_started_at
          <= attempt_time - interval '10 seconds'
        then attempt_time
        else private.live_stage_message_rate_limits
          .window_started_at
      end,
    message_count =
      case
        when private.live_stage_message_rate_limits
          .window_started_at
          <= attempt_time - interval '10 seconds'
        then 1
        else private.live_stage_message_rate_limits
          .message_count + 1
      end
  returning message_count
  into current_count;

  if current_count > 5 then
    raise exception
      'Stage chat is moving too quickly. Wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_live_stage_message_throttle()
from public, anon, authenticated, service_role;

drop trigger if exists zz_live_stage_messages_throttle
on public.live_stage_messages;

create trigger zz_live_stage_messages_throttle
before insert
on public.live_stage_messages
for each row
execute function private.enforce_live_stage_message_throttle();

/*
 * Ending a Stage is terminal. The existing trigger already invokes this
 * function for every Stage update, so replacing it closes direct status
 * revival without changing the client update contract.
 */
create or replace function private.touch_live_stage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'ended'
    and new.status is distinct from 'ended' then
    raise exception
      'An ended Stage cannot be restarted.'
      using errcode = '22023';
  end if;

  new.updated_at = now();

  if (
    new.status = 'ended'
    and old.status is distinct from 'ended'
  ) then
    new.ended_at = now();
  elsif new.status = 'live' then
    new.ended_at = null;
  end if;

  return new;
end;
$$;

revoke all
on function private.touch_live_stage()
from public, anon, authenticated, service_role;

/*
 * A removed member cannot regain access through the public insert policy,
 * the private access helper, or the code-join RPC.
 */
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
        and not exists (
          select 1
          from public.live_stage_bans as ban
          where ban.stage_id = stage.id
            and ban.user_id =
              (select auth.uid())
        )
        and not private.canal_users_are_blocked(
          (select auth.uid()),
          stage.host_id
        )
        and not private.canal_users_are_blocked(
          stage.host_id,
          (select auth.uid())
        )
        and (
          stage.visibility = 'public'
          or stage.host_id =
            (select auth.uid())
          or exists (
            select 1
            from public.live_stage_members as member
            where member.stage_id = stage.id
              and member.user_id =
                (select auth.uid())
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

drop policy if exists "Members can read live Stage membership"
on public.live_stage_members;

create policy "Members can read live Stage membership"
on public.live_stage_members
for select
to authenticated
using (
  (select private.can_access_live_stage(stage_id))
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.live_stages as stage
      where stage.id =
        live_stage_members.stage_id
        and stage.host_id =
          (select auth.uid())
    )
    or (
      not private.canal_users_are_blocked(
        (select auth.uid()),
        user_id
      )
      and not private.canal_users_are_blocked(
        user_id,
        (select auth.uid())
      )
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
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.live_stages as stage
      where stage.id =
        live_stage_messages.stage_id
        and stage.host_id =
          (select auth.uid())
    )
    or (
      not private.canal_users_are_blocked(
        (select auth.uid()),
        user_id
      )
      and not private.canal_users_are_blocked(
        user_id,
        (select auth.uid())
      )
    )
  )
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
  and not exists (
    select 1
    from public.live_stage_bans as ban
    where ban.stage_id =
      live_stage_members.stage_id
      and ban.user_id =
        (select auth.uid())
  )
  and exists (
    select 1
    from public.live_stages as stage
    where stage.id =
      live_stage_members.stage_id
      and stage.status = 'live'
      and stage.visibility = 'public'
      and private.can_access_live_stage(
        stage.id
      )
  )
);

/*
 * Clients may leave themselves, but host role changes and removals must pass
 * through the audited moderation RPCs below.
 */
drop policy if exists "Hosts can update live Stage roles"
on public.live_stage_members;

drop policy if exists "Members can leave live Stages"
on public.live_stage_members;

create policy "Members can leave live Stages"
on public.live_stage_members
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and role <> 'host'
);

revoke update (role)
on public.live_stage_members
from authenticated;

drop policy if exists "Authors and hosts can delete live Stage messages"
on public.live_stage_messages;

create policy "Authors can delete their live Stage messages"
on public.live_stage_messages
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create or replace function public.report_live_stage_message(
  stage_id_value uuid,
  message_id_value uuid,
  reason_value text,
  expected_actor_id_value uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  message_author_id uuid;
  message_body text;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to report a Stage message.'
      using errcode = '42501';
  end if;

  if current_user_id is distinct from
    expected_actor_id_value then
    raise exception
      'The signed-in Canal account changed. Try again.'
      using errcode = '42501';
  end if;

  if reason_value is null
    or reason_value not in (
    'spam',
    'harassment',
    'unsafe_content',
    'other'
  ) then
    raise exception
      'Choose a valid Stage report reason.'
      using errcode = '22023';
  end if;

  if not private.can_access_live_stage(
    stage_id_value
  ) then
    raise exception
      'This Stage message is unavailable.'
      using errcode = '42501';
  end if;

  select
    message.user_id,
    message.body
  into
    message_author_id,
    message_body
  from public.live_stage_messages as message
  where message.id = message_id_value
    and message.stage_id = stage_id_value;

  if message_author_id is null then
    raise exception
      'This Stage message is unavailable.'
      using errcode = 'P0002';
  end if;

  if private.canal_users_are_blocked(
    current_user_id,
    message_author_id
  )
  or private.canal_users_are_blocked(
    message_author_id,
    current_user_id
  ) then
    raise exception
      'This Stage message is unavailable.'
      using errcode = '42501';
  end if;

  if message_author_id = current_user_id then
    raise exception
      'You cannot report your own Stage message.'
      using errcode = '22023';
  end if;

  insert into public.live_stage_moderation_events (
    stage_id,
    actor_id,
    target_user_id,
    message_id,
    action,
    report_reason,
    evidence_body
  )
  values (
    stage_id_value,
    current_user_id,
    message_author_id,
    message_id_value,
    'message_reported',
    reason_value,
    message_body
  )
  on conflict (
    stage_id,
    actor_id,
    message_id,
    action
  )
  where action = 'message_reported'
  do nothing;
end;
$$;

revoke all
on function public.report_live_stage_message(uuid, uuid, text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.report_live_stage_message(uuid, uuid, text, uuid)
to authenticated;

create or replace function public.moderate_live_stage_member(
  stage_id_value uuid,
  target_user_id_value uuid,
  action_value text,
  expected_actor_id_value uuid,
  reason_value text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  stage_status text;
  target_role text;
  normalized_reason text :=
    nullif(btrim(reason_value), '');
  evidence_action text;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to moderate a Stage.'
      using errcode = '42501';
  end if;

  if current_user_id is distinct from
    expected_actor_id_value then
    raise exception
      'The signed-in Canal account changed. Try again.'
      using errcode = '42501';
  end if;

  if action_value is null
    or action_value not in (
    'promote',
    'demote',
    'remove'
  ) then
    raise exception
      'Choose a valid Stage member action.'
      using errcode = '22023';
  end if;

  if normalized_reason is not null
    and (
      char_length(normalized_reason) > 240
      or octet_length(normalized_reason) > 960
      or normalized_reason ~ '[[:cntrl:]]'
    ) then
    raise exception
      'Stage moderation notes must be 240 characters or fewer.'
      using errcode = '22023';
  end if;

  select stage.status
  into stage_status
  from public.live_stages as stage
  where stage.id = stage_id_value
    and stage.host_id = current_user_id
  for update;

  if stage_status is null then
    raise exception
      'Only the Stage host can moderate members.'
      using errcode = '42501';
  end if;

  if stage_status <> 'live' then
    raise exception
      'This Stage has ended and can no longer be changed.'
      using errcode = '22023';
  end if;

  if target_user_id_value = current_user_id then
    raise exception
      'The Stage host cannot moderate their own membership.'
      using errcode = '22023';
  end if;

  select member.role
  into target_role
  from public.live_stage_members as member
  where member.stage_id = stage_id_value
    and member.user_id = target_user_id_value
  for update;

  if target_role is null
    or target_role = 'host' then
    raise exception
      'This Stage member is unavailable.'
      using errcode = 'P0002';
  end if;

  if action_value = 'remove' then
    insert into public.live_stage_bans (
      stage_id,
      user_id,
      created_by,
      reason
    )
    values (
      stage_id_value,
      target_user_id_value,
      current_user_id,
      normalized_reason
    )
    on conflict (stage_id, user_id)
    do update
    set
      created_by = excluded.created_by,
      reason = excluded.reason,
      created_at = now();

    delete from public.live_stage_members
    where stage_id = stage_id_value
      and user_id = target_user_id_value;

    evidence_action :=
      'member_removed';
  elsif action_value = 'promote' then
    update public.live_stage_members
    set role = 'collaborator'
    where stage_id = stage_id_value
      and user_id = target_user_id_value;

    evidence_action :=
      'member_promoted';
  else
    update public.live_stage_members
    set role = 'listener'
    where stage_id = stage_id_value
      and user_id = target_user_id_value;

    evidence_action :=
      'member_demoted';
  end if;

  insert into public.live_stage_moderation_events (
    stage_id,
    actor_id,
    target_user_id,
    action,
    moderation_reason
  )
  values (
    stage_id_value,
    current_user_id,
    target_user_id_value,
    evidence_action,
    normalized_reason
  );
end;
$$;

revoke all
on function public.moderate_live_stage_member(uuid, uuid, text, uuid, text)
from public, anon, authenticated, service_role;

grant execute
on function public.moderate_live_stage_member(uuid, uuid, text, uuid, text)
to authenticated;

create or replace function public.moderate_live_stage_message(
  stage_id_value uuid,
  message_id_value uuid,
  expected_actor_id_value uuid,
  reason_value text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  stage_status text;
  message_author_id uuid;
  message_body text;
  normalized_reason text :=
    nullif(btrim(reason_value), '');
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to moderate a Stage.'
      using errcode = '42501';
  end if;

  if current_user_id is distinct from
    expected_actor_id_value then
    raise exception
      'The signed-in Canal account changed. Try again.'
      using errcode = '42501';
  end if;

  if normalized_reason is not null
    and (
      char_length(normalized_reason) > 240
      or octet_length(normalized_reason) > 960
      or normalized_reason ~ '[[:cntrl:]]'
    ) then
    raise exception
      'Stage moderation notes must be 240 characters or fewer.'
      using errcode = '22023';
  end if;

  select stage.status
  into stage_status
  from public.live_stages as stage
  where stage.id = stage_id_value
    and stage.host_id = current_user_id
  for update;

  if stage_status is null then
    raise exception
      'Only the Stage host can remove messages.'
      using errcode = '42501';
  end if;

  if stage_status <> 'live' then
    raise exception
      'This Stage has ended and can no longer be changed.'
      using errcode = '22023';
  end if;

  select
    message.user_id,
    message.body
  into
    message_author_id,
    message_body
  from public.live_stage_messages as message
  where message.id = message_id_value
    and message.stage_id = stage_id_value
  for update;

  if message_author_id is null then
    raise exception
      'This Stage message is unavailable.'
      using errcode = 'P0002';
  end if;

  insert into public.live_stage_moderation_events (
    stage_id,
    actor_id,
    target_user_id,
    message_id,
    action,
    moderation_reason,
    evidence_body
  )
  values (
    stage_id_value,
    current_user_id,
    message_author_id,
    message_id_value,
    'message_removed',
    normalized_reason,
    message_body
  );

  delete from public.live_stage_messages
  where id = message_id_value
    and stage_id = stage_id_value;
end;
$$;

revoke all
on function public.moderate_live_stage_message(uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;

grant execute
on function public.moderate_live_stage_message(uuid, uuid, uuid, text)
to authenticated;

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
  matched_host_id uuid;
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

  select
    stage.id,
    stage.host_id
  into
    matched_stage_id,
    matched_host_id
  from public.live_stages as stage
  where stage.stage_code = stage_code_value
    and stage.status = 'live'
  for share;

  if matched_stage_id is null
    or (
      expected_stage_id is not null
      and expected_stage_id <>
        matched_stage_id
    )
    or exists (
      select 1
      from public.live_stage_bans as ban
      where ban.stage_id = matched_stage_id
        and ban.user_id = current_user_id
    )
    or private.canal_users_are_blocked(
      current_user_id,
      matched_host_id
    )
    or private.canal_users_are_blocked(
      matched_host_id,
      current_user_id
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
