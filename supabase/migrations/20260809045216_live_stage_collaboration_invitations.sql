begin;

alter table public.activity_events
add column if not exists stage_id uuid
  references public.live_stages(id)
  on delete cascade,
add column if not exists stage_invite_id uuid;

create table if not exists public.live_stage_collaboration_invites (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null
    references public.live_stages(id)
    on delete cascade,
  inviter_id uuid not null
    references public.profiles(id)
    on delete cascade,
  invitee_id uuid not null
    references public.profiles(id)
    on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  constraint live_stage_collaboration_invites_people_check
    check (inviter_id <> invitee_id),
  constraint live_stage_collaboration_invites_status_check
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  unique (stage_id, invitee_id)
);

alter table public.activity_events
add constraint activity_events_stage_invite_fk
foreign key (stage_invite_id)
references public.live_stage_collaboration_invites(id)
on delete set null;

create index if not exists live_stage_collaboration_invites_invitee_status_index
on public.live_stage_collaboration_invites (invitee_id, status, created_at desc);

alter table public.live_stage_collaboration_invites enable row level security;

revoke all on public.live_stage_collaboration_invites
from public, anon, authenticated, service_role;

grant select on public.live_stage_collaboration_invites
to authenticated, service_role;

create policy "Hosts and invitees can read Stage collaboration invitations"
on public.live_stage_collaboration_invites
for select
to authenticated
using (
  invitee_id = (select auth.uid())
  or inviter_id = (select auth.uid())
);

create or replace function public.invite_live_stage_collaborators(
  stage_id_value uuid,
  invitee_ids_value uuid[]
)
returns setof public.live_stage_collaboration_invites
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invitee_id_value uuid;
  invite_row public.live_stage_collaboration_invites%rowtype;
  stage_name_value text;
  host_name_value text;
  host_handle_value text;
begin
  if current_user_id is null then
    raise exception 'Sign in to invite collaborators.' using errcode = '42501';
  end if;

  if coalesce(array_length(invitee_ids_value, 1), 0) < 1
    or array_length(invitee_ids_value, 1) > 25
  then
    raise exception 'Choose between 1 and 25 collaborators.' using errcode = '22023';
  end if;

  select stage.name, stage.host_display_name, stage.host_handle
  into stage_name_value, host_name_value, host_handle_value
  from public.live_stages as stage
  where stage.id = stage_id_value
    and stage.host_id = current_user_id
    and stage.status = 'live';

  if stage_name_value is null then
    raise exception 'Only the host can invite collaborators to this active Stage.'
      using errcode = '42501';
  end if;

  foreach invitee_id_value in array invitee_ids_value loop
    if invitee_id_value = current_user_id
      or not exists (
        select 1
        from public.user_relationships as outgoing
        join public.user_relationships as incoming
          on incoming.user_id = invitee_id_value
         and incoming.target_user_id = current_user_id
         and incoming.relationship_type = 'following'
        where outgoing.user_id = current_user_id
          and outgoing.target_user_id = invitee_id_value
          and outgoing.relationship_type = 'following'
      )
    then
      raise exception 'Only mutual Canal friends can be invited as collaborators.'
        using errcode = '42501';
    end if;

    insert into public.live_stage_collaboration_invites (
      stage_id, inviter_id, invitee_id, status, expires_at, responded_at
    ) values (
      stage_id_value, current_user_id, invitee_id_value, 'pending',
      now() + interval '14 days', null
    )
    on conflict (stage_id, invitee_id)
    do update set
      inviter_id = excluded.inviter_id,
      status = 'pending',
      created_at = now(),
      expires_at = now() + interval '14 days',
      responded_at = null
    returning * into invite_row;

    insert into public.activity_events (
      user_id, id, type, title, description, username, display_name,
      stage_id, stage_invite_id, created_at, is_read
    ) values (
      invitee_id_value,
      'stage-collaboration-invite:' || invite_row.id::text,
      'collaboration',
      'Stage collaboration invite',
      coalesce(host_name_value, 'A Canal friend') || ' invited you to contribute to ' || stage_name_value || '.',
      host_handle_value,
      host_name_value,
      stage_id_value,
      invite_row.id,
      now(),
      false
    )
    on conflict (user_id, id)
    do update set
      description = excluded.description,
      stage_id = excluded.stage_id,
      stage_invite_id = excluded.stage_invite_id,
      created_at = excluded.created_at,
      is_read = false;

    return next invite_row;
  end loop;
end;
$$;

revoke all on function public.invite_live_stage_collaborators(uuid, uuid[])
from public, anon, authenticated, service_role;

grant execute on function public.invite_live_stage_collaborators(uuid, uuid[])
to authenticated;

create or replace function public.respond_to_live_stage_collaboration_invite(
  invite_id_value uuid,
  accept_value boolean
)
returns public.live_stages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invite_row public.live_stage_collaboration_invites%rowtype;
  stage_row public.live_stages%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in to respond to this invitation.' using errcode = '42501';
  end if;

  select * into invite_row
  from public.live_stage_collaboration_invites as invitation
  where invitation.id = invite_id_value
    and invitation.invitee_id = current_user_id
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  for update;

  if invite_row.id is null then
    raise exception 'This Stage invitation is unavailable or expired.'
      using errcode = '42501';
  end if;

  select * into stage_row
  from public.live_stages as stage
  where stage.id = invite_row.stage_id
    and stage.status = 'live';

  if stage_row.id is null then
    raise exception 'This Stage is no longer active.' using errcode = '42501';
  end if;

  update public.live_stage_collaboration_invites
  set
    status = case when accept_value then 'accepted' else 'declined' end,
    responded_at = now()
  where id = invite_row.id;

  if accept_value then
    insert into public.live_stage_members (
      stage_id, user_id, display_name, handle, role
    )
    select
      invite_row.stage_id,
      profile.id,
      profile.display_name,
      profile.handle,
      'collaborator'
    from public.profiles as profile
    where profile.id = current_user_id
    on conflict (stage_id, user_id)
    do update set role = 'collaborator';
  end if;

  delete from public.activity_events
  where user_id = current_user_id
    and stage_invite_id = invite_row.id;

  return stage_row;
end;
$$;

revoke all on function public.respond_to_live_stage_collaboration_invite(uuid, boolean)
from public, anon, authenticated, service_role;

grant execute on function public.respond_to_live_stage_collaboration_invite(uuid, boolean)
to authenticated;

create or replace function private.enforce_live_stage_contribution_role()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.live_stages as stage
    join public.live_stage_members as member
      on member.stage_id = stage.id
     and member.user_id = new.user_id
    where stage.id = new.stage_id
      and stage.status = 'live'
      and (
        stage.host_id = new.user_id
        or member.role = 'collaborator'
      )
  ) then
    raise exception 'Only the host or an accepted collaborator can contribute to this Stage.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_live_stage_contribution_role()
from public, anon, authenticated, service_role;

drop trigger if exists enforce_live_stage_contribution_role
on public.live_stage_contributions;

create trigger enforce_live_stage_contribution_role
before insert or update
on public.live_stage_contributions
for each row
execute function private.enforce_live_stage_contribution_role();

create or replace function private.notify_live_stage_collaborator_promotion()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  stage_row public.live_stages%rowtype;
begin
  if new.role <> 'collaborator'
    or old.role = 'collaborator'
  then
    return new;
  end if;

  select * into stage_row
  from public.live_stages as stage
  where stage.id = new.stage_id
    and stage.status = 'live';

  if stage_row.id is null then
    return new;
  end if;

  insert into public.activity_events (
    user_id, id, type, title, description, username, display_name,
    stage_id, created_at, is_read
  ) values (
    new.user_id,
    'stage-collaborator-promotion:' || new.stage_id::text,
    'collaboration',
    'You are now a Stage collaborator',
    'Add a Scene or create your own take for ' || stage_row.name || '.',
    stage_row.host_handle,
    stage_row.host_display_name,
    new.stage_id,
    now(),
    false
  )
  on conflict (user_id, id)
  do update set
    description = excluded.description,
    created_at = excluded.created_at,
    is_read = false;

  return new;
end;
$$;

revoke all on function private.notify_live_stage_collaborator_promotion()
from public, anon, authenticated, service_role;

drop trigger if exists notify_live_stage_collaborator_promotion
on public.live_stage_members;

create trigger notify_live_stage_collaborator_promotion
after update of role
on public.live_stage_members
for each row
execute function private.notify_live_stage_collaborator_promotion();

commit;
