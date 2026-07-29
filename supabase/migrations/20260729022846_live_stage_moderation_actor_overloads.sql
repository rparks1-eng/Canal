begin;

-- The deployed migration history predates the account-race guard now used by
-- Canal clients. Add the hardened signatures without dropping the legacy
-- overloads so older clients retain their existing compatibility path.

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

commit;
