const SPOTIFY_TRACK_ID_PATTERN =
  /^[A-Za-z0-9]{22}$/;

const SPOTIFY_TRACK_URI_PATTERN =
  /^spotify:track:([A-Za-z0-9]{22})$/;

export type CanonicalSpotifyTrackLinks = {
  spotifyUri?: string;
  spotifyUrl?: string;
};

export function normalizeSpotifyTrackLinks(
  spotifyUriValue: unknown,
  spotifyUrlValue: unknown,
): CanonicalSpotifyTrackLinks {
  const rawUri =
    readOptionalString(
      spotifyUriValue,
    );

  const rawUrl =
    readOptionalString(
      spotifyUrlValue,
    );

  const uriTrackId =
    rawUri
      ? parseSpotifyTrackUri(
          rawUri,
        )
      : null;

  const urlTrackId =
    rawUrl
      ? parseSpotifyTrackUrl(
          rawUrl,
        )
      : null;

  if (
    (
      rawUri &&
      !uriTrackId
    ) ||
    (
      rawUrl &&
      !urlTrackId
    ) ||
    (
      uriTrackId &&
      urlTrackId &&
      uriTrackId !==
        urlTrackId
    )
  ) {
    return {};
  }

  const trackId =
    uriTrackId ??
    urlTrackId;

  if (!trackId) {
    return {};
  }

  return {
    spotifyUri:
      `spotify:track:${trackId}`,
    spotifyUrl:
      `https://open.spotify.com/track/${trackId}`,
  };
}

export function canonicalSpotifyTrackUrl(
  spotifyUrlValue: unknown,
  spotifyUriValue?: unknown,
): string | null {
  return (
    normalizeSpotifyTrackLinks(
      spotifyUriValue,
      spotifyUrlValue,
    ).spotifyUrl ??
    null
  );
}

function parseSpotifyTrackUri(
  value: string,
): string | null {
  return (
    value.match(
      SPOTIFY_TRACK_URI_PATTERN,
    )?.[1] ??
    null
  );
}

function parseSpotifyTrackUrl(
  value: string,
): string | null {
  try {
    const parsed =
      new URL(
        value,
      );

    if (
      parsed.protocol !==
        "https:" ||
      parsed.hostname !==
        "open.spotify.com" ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    const match =
      parsed.pathname.match(
        /^\/track\/([A-Za-z0-9]{22})$/,
      );

    const trackId =
      match?.[1] ??
      null;

    return (
      trackId &&
      SPOTIFY_TRACK_ID_PATTERN.test(
        trackId,
      )
        ? trackId
        : null
    );
  } catch {
    return null;
  }
}

function readOptionalString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}
