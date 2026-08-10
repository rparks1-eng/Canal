alter table public.scene_recommendation_feedback
add column if not exists reasons text[] not null default '{}',
add column if not exists track_artist_ids text[] not null default '{}',
add column if not exists track_genres text[] not null default '{}',
add column if not exists track_explicit boolean;

alter table public.scene_recommendation_feedback
drop constraint if exists scene_recommendation_feedback_reasons_check;

alter table public.scene_recommendation_feedback
add constraint scene_recommendation_feedback_reasons_check
check (
  coalesce(array_ndims(reasons), 1) = 1
  and cardinality(reasons) <= 4
  and reasons <@ array[
    'too_slow',
    'too_fast',
    'wrong_genre',
    'wrong_mood',
    'heard_too_much',
    'too_unfamiliar',
    'wrong_artist',
    'too_explicit'
  ]::text[]
  and not (
    reasons @> array['too_slow', 'too_fast']::text[]
  )
  and not (
    reasons @> array[
      'heard_too_much',
      'too_unfamiliar'
    ]::text[]
  )
  and (
    cardinality(reasons) = 0
    or action in (
      'swap',
      'remove',
      'doesnt_match'
    )
  )
);

alter table public.scene_recommendation_feedback
drop constraint if exists scene_recommendation_feedback_context_check;

create or replace function public.scene_feedback_context_is_bounded(
  values_to_check text[],
  maximum_items integer,
  maximum_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(array_ndims(values_to_check), 1) = 1
    and cardinality(values_to_check) <= maximum_items
    and coalesce(
      (
        select bool_and(
          value_to_check is not null
          and length(btrim(value_to_check)) between 1 and maximum_length
        )
        from unnest(values_to_check) as value_to_check
      ),
      true
    );
$$;

revoke all on function public.scene_feedback_context_is_bounded(text[], integer, integer)
from public, anon, authenticated;
grant execute on function public.scene_feedback_context_is_bounded(text[], integer, integer)
to authenticated, service_role;

alter table public.scene_recommendation_feedback
add constraint scene_recommendation_feedback_context_check
check (
  public.scene_feedback_context_is_bounded(
    track_artist_ids,
    20,
    128
  )
  and public.scene_feedback_context_is_bounded(
    track_genres,
    12,
    80
  )
  and (
    (
      cardinality(track_artist_ids) = 0
      and cardinality(track_genres) = 0
      and track_explicit is null
    )
    or action in (
      'swap',
      'remove',
      'doesnt_match'
    )
  )
);

comment on column public.scene_recommendation_feedback.reasons is
'Optional rejection reasons. Maximum four, with at most one reason per directional dimension. wrong_artist and wrong_genre ranking consumption remains provider-policy-gated.';

comment on column public.scene_recommendation_feedback.track_artist_ids is
'Bounded normalized artist identifiers captured with rejection feedback. Ranking consumption remains provider-policy-gated.';

comment on column public.scene_recommendation_feedback.track_genres is
'Bounded normalized genre labels captured with rejection feedback. Ranking consumption remains provider-policy-gated.';

comment on column public.scene_recommendation_feedback.track_explicit is
'Exact explicit-content provenance captured only for rejection feedback. NULL means unknown; only TRUE contributes to explicit suppression.';

revoke all on public.scene_recommendation_feedback from anon;
revoke all on public.scene_recommendation_feedback from authenticated;
grant select, insert, update, delete
on public.scene_recommendation_feedback
to authenticated;
