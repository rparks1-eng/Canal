begin;

alter table public.snapshots
  add column if not exists provider_id text,
  add column if not exists provider_track_id text,
  add column if not exists provider_url text;

alter table public.snapshots
  drop constraint if exists snapshots_provider_id_valid,
  drop constraint if exists snapshots_provider_track_id_safe,
  drop constraint if exists snapshots_provider_url_safe,
  drop constraint if exists snapshots_provider_metadata_complete;

alter table public.snapshots
  drop constraint if exists snapshots_track_image_url_safe;

alter table public.snapshots
  add constraint snapshots_provider_id_valid check (
    provider_id is null
    or provider_id in ('spotify', 'apple-music')
  ),
  add constraint snapshots_provider_track_id_safe check (
    provider_track_id is null
    or (
      length(provider_track_id) between 1 and 256
      and provider_track_id !~ '[[:cntrl:]]'
    )
  ),
  add constraint snapshots_provider_url_safe check (
    provider_url is null
    or (
      length(provider_url) <= 2048
      and provider_url !~ '[[:cntrl:]]'
      and (
        (
          provider_id = 'spotify'
          and provider_url ~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$'
        )
        or (
          provider_id = 'apple-music'
          and provider_url ~ '^https://(music|geo[.]music)[.]apple[.]com/'
        )
      )
    )
  ),
  add constraint snapshots_provider_metadata_complete check (
    (
      provider_id is null
      and provider_track_id is null
      and provider_url is null
    )
    or (
      provider_id is not null
      and provider_track_id is not null
    )
  ),
  add constraint snapshots_track_image_url_safe check (
    track_image_url is null
    or (
      char_length(track_image_url) <= 1024
      and octet_length(track_image_url) <= 2048
      and (
        track_image_url ~ '^https://(i[.]scdn[.]co|image-cdn-(ak|fa)[.]spotifycdn[.]com)/image/[A-Za-z0-9]{16,128}$'
        or track_image_url ~ '^https://[A-Za-z0-9-]+[.]mzstatic[.]com/[A-Za-z0-9/_.~%+-]+([?][A-Za-z0-9&=_%.~+-]+)?$'
        or track_image_url ~ '^https://(images|t2)[.]genius[.]com/[A-Za-z0-9/_.~%+-]+$'
      )
    )
  );

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
  provider_id text;
  provider_track_id text;
  provider_url text;
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
      or not (track ?& array['id', 'title', 'artist', 'source'])
      or (
        track - array[
          'id', 'title', 'artist', 'source',
          'spotifyUri', 'spotifyUrl', 'durationMs', 'imageUrl',
          'providerId', 'providerTrackId', 'providerUrl'
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
        or track ->> 'spotifyUri' !~ '^spotify:track:[A-Za-z0-9]{22}$'
      then
        return false;
      end if;
      spotify_uri := track ->> 'spotifyUri';
    end if;

    if track ? 'spotifyUrl' then
      if jsonb_typeof(track -> 'spotifyUrl') <> 'string'
        or char_length(track ->> 'spotifyUrl') > 96
        or octet_length(track ->> 'spotifyUrl') > 192
        or track ->> 'spotifyUrl' !~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$'
      then
        return false;
      end if;
      spotify_url := track ->> 'spotifyUrl';
    end if;

    if spotify_uri is not null
      and spotify_url is not null
      and split_part(spotify_uri, ':', 3) <>
        regexp_replace(spotify_url, '^https://open[.]spotify[.]com/track/', '')
    then
      return false;
    end if;

    provider_id := null;
    provider_track_id := null;
    provider_url := null;

    if track ? 'providerId' then
      if jsonb_typeof(track -> 'providerId') <> 'string'
        or track ->> 'providerId' not in ('spotify', 'apple-music')
      then
        return false;
      end if;
      provider_id := track ->> 'providerId';
    end if;

    if track ? 'providerTrackId' then
      if jsonb_typeof(track -> 'providerTrackId') <> 'string'
        or char_length(track ->> 'providerTrackId') not between 1 and 256
        or octet_length(track ->> 'providerTrackId') > 512
        or track ->> 'providerTrackId' <> btrim(track ->> 'providerTrackId')
        or track ->> 'providerTrackId' ~ '[[:cntrl:]]'
      then
        return false;
      end if;
      provider_track_id := track ->> 'providerTrackId';
    end if;

    if track ? 'providerUrl' then
      if jsonb_typeof(track -> 'providerUrl') <> 'string'
        or char_length(track ->> 'providerUrl') > 2048
        or octet_length(track ->> 'providerUrl') > 4096
      then
        return false;
      end if;
      provider_url := track ->> 'providerUrl';
    end if;

    if (provider_id is null) <> (provider_track_id is null)
      or (provider_url is not null and provider_id is null)
      or (
        provider_url is not null
        and (
          (
            provider_id = 'spotify'
            and provider_url !~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$'
          )
          or (
            provider_id = 'apple-music'
            and provider_url !~ '^https://(music|geo[.]music)[.]apple[.]com/[A-Za-z0-9/_.~%+-]+([?][A-Za-z0-9&=_%.~+-]+)?$'
          )
        )
      )
    then
      return false;
    end if;

    if track ? 'durationMs'
      and (
        jsonb_typeof(track -> 'durationMs') <> 'number'
        or (track ->> 'durationMs')::numeric <= 0
        or (track ->> 'durationMs')::numeric > 86400000
        or mod((track ->> 'durationMs')::numeric, 1) <> 0
      )
    then
      return false;
    end if;

    if track ? 'imageUrl'
      and (
        jsonb_typeof(track -> 'imageUrl') <> 'string'
        or char_length(track ->> 'imageUrl') > 1024
        or octet_length(track ->> 'imageUrl') > 2048
        or (
          track ->> 'imageUrl' !~ '^https://(i[.]scdn[.]co|image-cdn-(ak|fa)[.]spotifycdn[.]com)/image/[A-Za-z0-9]{16,128}$'
          and track ->> 'imageUrl' !~ '^https://[A-Za-z0-9-]+[.]mzstatic[.]com/[A-Za-z0-9/_.~%+-]+([?][A-Za-z0-9&=_%.~+-]+)?$'
          and track ->> 'imageUrl' !~ '^https://(images|t2)[.]genius[.]com/[A-Za-z0-9/_.~%+-]+$'
        )
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
