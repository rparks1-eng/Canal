create table if not exists public.scene_recommendation_feedback (
  id text primary key check (char_length(id) between 8 and 80),
  user_id uuid not null references auth.users(id) on delete cascade,
  intent_key text not null check (char_length(intent_key) between 2 and 1000),
  action text not null check (action in ('swap','remove','doesnt_match','favorite','unfavorite','skip','replay')),
  track_id text not null check (char_length(track_id) between 1 and 200),
  scene_id text check (scene_id is null or char_length(scene_id) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.scene_recommendation_feedback enable row level security;
revoke all on public.scene_recommendation_feedback from anon;
grant select, insert, update, delete on public.scene_recommendation_feedback to authenticated;

drop policy if exists "Users manage their recommendation feedback" on public.scene_recommendation_feedback;
create policy "Users manage their recommendation feedback"
on public.scene_recommendation_feedback
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create index if not exists scene_recommendation_feedback_owner_intent_created_index
on public.scene_recommendation_feedback (user_id, intent_key, created_at desc);
