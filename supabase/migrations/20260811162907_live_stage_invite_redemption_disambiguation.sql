begin;

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

  if invite_row.id is null
    or invite_row.stage_id is distinct from expected_stage_id_value
  then
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
    )
  then
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
  on conflict on constraint live_stage_members_pkey do update
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

  update private.live_stage_invite_tokens as invite
  set redemption_count = invite.redemption_count + 1
  where invite.id = invite_row.id;

  return query select invite_row.stage_id, invite_row.grant_role, false;
end;
$$;

revoke all on function private.redeem_live_stage_invite_token(uuid, text)
from public, anon, authenticated, service_role;

commit;
