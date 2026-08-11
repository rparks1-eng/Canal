begin;

create table if not exists private.song_scene_mood_evidence (
  user_id uuid not null references auth.users(id) on delete cascade,
  scene_id text not null,
  track_id text not null,
  mood_label text not null,
  visibility text not null,
  updated_at timestamptz not null,
  primary key (user_id, scene_id, track_id, mood_label),
  constraint song_scene_mood_evidence_visibility_valid check (visibility in ('private', 'public')),
  constraint song_scene_mood_evidence_track_safe check (char_length(track_id) between 1 and 160),
  constraint song_scene_mood_evidence_label_safe check (char_length(mood_label) between 1 and 80)
);

create index if not exists song_scene_mood_evidence_track_index
on private.song_scene_mood_evidence (track_id, visibility, mood_label, user_id);

revoke all on table private.song_scene_mood_evidence from public, anon, authenticated;

create or replace function private.refresh_song_scene_mood_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from private.song_scene_mood_evidence
    where user_id = old.user_id and scene_id = old.id;
  end if;

  if tg_op <> 'DELETE' and new.deleted_at is null then
    insert into private.song_scene_mood_evidence (
      user_id, scene_id, track_id, mood_label, visibility, updated_at
    )
    select distinct
      new.user_id,
      new.id,
      btrim(track ->> 'id'),
      lower(btrim(mood.value)),
      case when new.payload ->> 'visibility' = 'public' then 'public' else 'private' end,
      new.updated_at
    from jsonb_array_elements(
      case when jsonb_typeof(new.payload -> 'tracks') = 'array' then new.payload -> 'tracks' else '[]'::jsonb end
    ) as track
    cross join lateral regexp_split_to_table(
      coalesce(new.payload ->> 'emotions', ''),
      E'\\s*(?:,|•|\\||/)\\s*'
    ) as mood(value)
    where char_length(btrim(track ->> 'id')) between 1 and 160
      and char_length(btrim(mood.value)) between 1 and 80
    on conflict (user_id, scene_id, track_id, mood_label) do update
    set visibility = excluded.visibility, updated_at = excluded.updated_at;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.refresh_song_scene_mood_evidence() from public, anon, authenticated;

drop trigger if exists refresh_song_scene_mood_evidence_on_scene on public.scenes;
create trigger refresh_song_scene_mood_evidence_on_scene
after insert or update of payload, deleted_at or delete on public.scenes
for each row execute function private.refresh_song_scene_mood_evidence();

insert into private.song_scene_mood_evidence (
  user_id, scene_id, track_id, mood_label, visibility, updated_at
)
select distinct
  scene.user_id,
  scene.id,
  btrim(track ->> 'id'),
  lower(btrim(mood.value)),
  case when scene.payload ->> 'visibility' = 'public' then 'public' else 'private' end,
  scene.updated_at
from public.scenes as scene
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(scene.payload -> 'tracks') = 'array' then scene.payload -> 'tracks' else '[]'::jsonb end
) as track
cross join lateral regexp_split_to_table(
  coalesce(scene.payload ->> 'emotions', ''),
  E'\\s*(?:,|•|\\||/)\\s*'
) as mood(value)
where scene.deleted_at is null
  and char_length(btrim(track ->> 'id')) between 1 and 160
  and char_length(btrim(mood.value)) between 1 and 80
on conflict (user_id, scene_id, track_id, mood_label) do update
set visibility = excluded.visibility, updated_at = excluded.updated_at;

create or replace function public.get_song_scene_mood_evidence(track_id_value text)
returns table (
  mood_label text,
  personal_count integer,
  community_count integer,
  community_users integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(track_id_value, ''))) not between 1 and 160 then
    raise exception 'Invalid track ID.' using errcode = '22023';
  end if;

  return query
  with per_owner as (
    select
      evidence.mood_label,
      evidence.user_id,
      count(*)::integer as uses,
      bool_or(evidence.visibility = 'public') as has_public
    from private.song_scene_mood_evidence as evidence
    where evidence.track_id = btrim(track_id_value)
      and (evidence.user_id = current_user_id or evidence.visibility = 'public')
    group by evidence.mood_label, evidence.user_id
  ), aggregate_evidence as (
    select
      owner_evidence.mood_label,
      coalesce(sum(owner_evidence.uses) filter (where owner_evidence.user_id = current_user_id), 0)::integer as personal_count,
      coalesce(sum(least(owner_evidence.uses, 3)) filter (
        where owner_evidence.user_id <> current_user_id and owner_evidence.has_public
      ), 0)::integer as raw_community_count,
      count(*) filter (
        where owner_evidence.user_id <> current_user_id and owner_evidence.has_public
      )::integer as community_users
    from per_owner as owner_evidence
    group by owner_evidence.mood_label
  )
  select
    aggregate_evidence.mood_label,
    aggregate_evidence.personal_count,
    case when aggregate_evidence.community_users >= 3 then aggregate_evidence.raw_community_count else 0 end,
    case when aggregate_evidence.community_users >= 3 then aggregate_evidence.community_users else 0 end
  from aggregate_evidence
  where aggregate_evidence.personal_count > 0 or aggregate_evidence.community_users >= 3
  order by
    (aggregate_evidence.personal_count * 3 + case when aggregate_evidence.community_users >= 3 then aggregate_evidence.raw_community_count else 0 end) desc,
    aggregate_evidence.mood_label
  limit 12;
end;
$$;

revoke all on function public.get_song_scene_mood_evidence(text) from public, anon;
grant execute on function public.get_song_scene_mood_evidence(text) to authenticated;

commit;
