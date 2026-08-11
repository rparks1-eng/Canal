begin;

create table if not exists public.user_song_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  track_title text not null,
  track_artist text not null,
  liked boolean not null default true,
  genre_labels text[] not null default '{}'::text[],
  mood_labels text[] not null default '{}'::text[],
  taxonomy_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, track_id),
  constraint user_song_preferences_track_id_safe check (
    char_length(track_id) between 1 and 160
    and octet_length(track_id) <= 640
  ),
  constraint user_song_preferences_copy_safe check (
    char_length(btrim(track_title)) between 1 and 300
    and char_length(btrim(track_artist)) between 1 and 300
    and octet_length(track_title) <= 1200
    and octet_length(track_artist) <= 1200
  ),
  constraint user_song_preferences_labels_bounded check (
    cardinality(genre_labels) <= 4
    and cardinality(mood_labels) <= 4
    and array_position(genre_labels, null) is null
    and array_position(mood_labels, null) is null
    and char_length(array_to_string(genre_labels, '')) <= 320
    and char_length(array_to_string(mood_labels, '')) <= 320
    and octet_length(array_to_string(genre_labels, '')) <= 1280
    and octet_length(array_to_string(mood_labels, '')) <= 1280
  ),
  constraint user_song_preferences_taxonomy_version check (
    taxonomy_version between 1 and 1000
  )
);

create index if not exists user_song_preferences_liked_updated_index
on public.user_song_preferences (user_id, updated_at desc)
where liked = true;

alter table public.user_song_preferences enable row level security;

drop policy if exists "Users manage their own song preferences"
on public.user_song_preferences;
create policy "Users manage their own song preferences"
on public.user_song_preferences
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.user_song_preferences from public, anon;
grant select, insert, update, delete on table public.user_song_preferences to authenticated;

commit;
