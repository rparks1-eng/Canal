begin;

alter table public.user_song_dna
  drop constraint if exists user_song_dna_sources_bounded;

alter table public.user_song_dna
  add constraint user_song_dna_sources_bounded check (
    cardinality(signal_sources) between 1 and 4
    and signal_sources <@ array[
      'spotify',
      'apple-music',
      'genius',
      'canal'
    ]::text[]
  );

commit;
