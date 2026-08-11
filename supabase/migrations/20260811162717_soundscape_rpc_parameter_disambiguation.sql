begin;

create or replace function public.soundscape_set_common_ground_approval(
  peer_user_id uuid,
  approved boolean
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  if viewer_id is null
    or soundscape_set_common_ground_approval.peer_user_id is null
    or viewer_id = soundscape_set_common_ground_approval.peer_user_id
    or not private.soundscape_users_are_mutual_connections(
      viewer_id,
      soundscape_set_common_ground_approval.peer_user_id
    )
  then
    raise exception 'Common Ground requires a mutual, unblocked connection.' using errcode = '42501';
  end if;

  if approved then
    insert into public.soundscape_common_ground_consents (
      user_id, peer_user_id, approved_at, revoked_at, updated_at
    ) values (
      viewer_id,
      soundscape_set_common_ground_approval.peer_user_id,
      timezone('utc', now()),
      null,
      timezone('utc', now())
    ) on conflict on constraint soundscape_common_ground_consents_pkey do update set
      approved_at = excluded.approved_at,
      revoked_at = null,
      updated_at = excluded.updated_at;
  else
    delete from public.soundscape_common_ground_consents as consent
    where consent.user_id = viewer_id
      and consent.peer_user_id = soundscape_set_common_ground_approval.peer_user_id;
  end if;
end;
$$;
revoke all on function public.soundscape_set_common_ground_approval(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.soundscape_set_common_ground_approval(uuid, boolean)
  to authenticated;

create or replace function public.soundscape_common_ground_projection(
  peer_user_id uuid,
  requested_period_kind text,
  requested_period_key text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
  viewer_projection jsonb;
  peer_projection jsonb;
begin
  if viewer_id is null
    or soundscape_common_ground_projection.peer_user_id is null
    or viewer_id = soundscape_common_ground_projection.peer_user_id
    or requested_period_kind not in ('year', 'season')
    or length(requested_period_key) not between 1 and 32
    or not private.soundscape_users_are_mutual_connections(
      viewer_id,
      soundscape_common_ground_projection.peer_user_id
    )
    or not exists (
      select 1
      from public.soundscape_common_ground_consents as viewer_consent
      where viewer_consent.user_id = viewer_id
        and viewer_consent.peer_user_id = soundscape_common_ground_projection.peer_user_id
        and viewer_consent.revoked_at is null
    )
    or not exists (
      select 1
      from public.soundscape_common_ground_consents as peer_consent
      where peer_consent.user_id = soundscape_common_ground_projection.peer_user_id
        and peer_consent.peer_user_id = viewer_id
        and peer_consent.revoked_at is null
    )
  then
    return jsonb_build_object('status', 'ineligible', 'members', jsonb_build_array());
  end if;

  select archive.share_projection into viewer_projection
  from public.soundscape_archives as archive
  where archive.user_id = viewer_id
    and archive.period_kind = requested_period_kind
    and archive.period_key = requested_period_key
  order by archive.version desc
  limit 1;

  select archive.share_projection into peer_projection
  from public.soundscape_archives as archive
  where archive.user_id = soundscape_common_ground_projection.peer_user_id
    and archive.period_kind = requested_period_kind
    and archive.period_key = requested_period_key
  order by archive.version desc
  limit 1;

  if viewer_projection is null or peer_projection is null then
    return jsonb_build_object(
      'status', 'insufficient_history',
      'members', jsonb_build_array()
    );
  end if;

  return jsonb_build_object(
    'status', 'approved',
    'period', coalesce(viewer_projection -> 'period', peer_projection -> 'period'),
    'members', jsonb_build_array(
      jsonb_build_object('userId', viewer_id, 'soundscape', viewer_projection),
      jsonb_build_object(
        'userId', soundscape_common_ground_projection.peer_user_id,
        'soundscape', peer_projection
      )
    )
  );
end;
$$;
revoke all on function public.soundscape_common_ground_projection(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.soundscape_common_ground_projection(uuid, text, text)
  to authenticated;

commit;
