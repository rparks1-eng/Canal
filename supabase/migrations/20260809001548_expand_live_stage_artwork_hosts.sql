begin;

create or replace function private.live_stage_tracks_are_safe(
  track_list jsonb
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  track jsonb;
  spotify_uri text;
  spotify_url text;
begin
  if jsonb_typeof(track_list) <> 'array'
    or jsonb_array_length(track_list) > 100
    or octet_length(track_list::text) > 262144
  then
    return false;
  end if;

  for track in
    select item.value
    from jsonb_array_elements(track_list) as item(value)
  loop
    if jsonb_typeof(track) <> 'object'
      or not (
        track ?& array[
          'id',
          'title',
          'artist',
          'source'
        ]
      )
      or (
        track - array[
          'id',
          'title',
          'artist',
          'source',
          'spotifyUri',
          'spotifyUrl',
          'durationMs',
          'imageUrl'
        ]::text[]
      ) <> '{}'::jsonb
    then
      return false;
    end if;

    if jsonb_typeof(track -> 'id') <> 'string'
      or char_length(track ->> 'id') not between 1 and 128
      or octet_length(track ->> 'id') > 256
      or track ->> 'id' <> btrim(track ->> 'id')
      or track ->> 'id' ~ '[[:cntrl:]]'
      or jsonb_typeof(track -> 'title') <> 'string'
      or char_length(track ->> 'title') not between 1 and 200
      or octet_length(track ->> 'title') > 800
      or track ->> 'title' <> btrim(track ->> 'title')
      or track ->> 'title' ~ '[[:cntrl:]]'
      or jsonb_typeof(track -> 'artist') <> 'string'
      or char_length(track ->> 'artist') not between 1 and 200
      or octet_length(track ->> 'artist') > 800
      or track ->> 'artist' <> btrim(track ->> 'artist')
      or track ->> 'artist' ~ '[[:cntrl:]]'
      or jsonb_typeof(track -> 'source') <> 'string'
      or char_length(track ->> 'source') not between 1 and 40
      or octet_length(track ->> 'source') > 160
      or track ->> 'source' <> btrim(track ->> 'source')
      or track ->> 'source' ~ '[[:cntrl:]]'
    then
      return false;
    end if;

    spotify_uri := null;
    spotify_url := null;

    if track ? 'spotifyUri' then
      if jsonb_typeof(track -> 'spotifyUri') <> 'string'
        or char_length(track ->> 'spotifyUri') > 64
        or octet_length(track ->> 'spotifyUri') > 128
        or track ->> 'spotifyUri'
          !~ '^spotify:track:[A-Za-z0-9]{22}$'
      then
        return false;
      end if;

      spotify_uri :=
        track ->> 'spotifyUri';
    end if;

    if track ? 'spotifyUrl' then
      if jsonb_typeof(track -> 'spotifyUrl') <> 'string'
        or char_length(track ->> 'spotifyUrl') > 96
        or octet_length(track ->> 'spotifyUrl') > 192
        or track ->> 'spotifyUrl'
          !~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$'
      then
        return false;
      end if;

      spotify_url :=
        track ->> 'spotifyUrl';
    end if;

    if spotify_uri is not null
      and spotify_url is not null
      and split_part(spotify_uri, ':', 3) <>
        regexp_replace(
          spotify_url,
          '^https://open[.]spotify[.]com/track/',
          ''
        )
    then
      return false;
    end if;

    if track ? 'durationMs'
      and (
        jsonb_typeof(track -> 'durationMs') <> 'number'
        or (track ->> 'durationMs')::numeric <= 0
        or (track ->> 'durationMs')::numeric > 86400000
        or mod(
          (track ->> 'durationMs')::numeric,
          1
        ) <> 0
      )
    then
      return false;
    end if;

    if track ? 'imageUrl'
      and (
        jsonb_typeof(track -> 'imageUrl') <> 'string'
        or char_length(track ->> 'imageUrl') > 1024
        or octet_length(track ->> 'imageUrl') > 2048
        or track ->> 'imageUrl' !~
          '^https://(i[.]scdn[.]co|image-cdn-(ak|fa)[.]spotifycdn[.]com)/image/[A-Za-z0-9]{16,128}$'
      )
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all
on function private.live_stage_tracks_are_safe(jsonb)
from public, anon, authenticated, service_role;

grant execute
on function private.live_stage_tracks_are_safe(jsonb)
to authenticated, service_role;

commit;
