begin;

alter table public.user_song_preferences
add column if not exists disliked_until timestamptz;

alter table public.user_song_preferences
drop constraint if exists user_song_preferences_state_valid;
alter table public.user_song_preferences
add constraint user_song_preferences_state_valid check (
  not liked or disliked_until is null
);

create index if not exists user_song_preferences_active_dislike_index
on public.user_song_preferences (user_id, disliked_until desc)
where liked = false and disliked_until is not null;

commit;
