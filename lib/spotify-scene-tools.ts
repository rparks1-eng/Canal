import {
  getSpotifyAccessToken,
} from "./spotify-auth";

import type {
  SceneTrack,
  StoredScene,
} from "./scenes";

const SPOTIFY_API_BASE =
  "https://api.spotify.com/v1";

export type SpotifySceneSearchTrack = {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit: boolean;
  artists: Array<{
    id?: string;
    name: string;
  }>;
  album?: {
    id?: string;
    name?: string;
    images?: Array<{
      url: string;
      height: number | null;
      width: number | null;
    }>;
  };
  external_urls?: {
    spotify?: string;
  };
};

export type SpotifySceneExportResult = {
  playlistId: string;
  playlistUrl: string | null;
  playlistUri: string | null;
  trackCount: number;
  skippedCount: number;
};

type SpotifyErrorPayload = {
  error?:
    | string
    | {
        status?: number;
        message?: string;
      };
  error_description?: string;
};

async function spotifyRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const accessToken =
    await getSpotifyAccessToken();

  const response =
    await fetch(
      `${SPOTIFY_API_BASE}${path}`,
      {
        ...init,

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            "application/json",

          ...(init?.body
            ? {
                "Content-Type":
                  "application/json",
              }
            : {}),

        },
      },
    );

  const raw =
    await response.text();

  let payload:
    | T
    | SpotifyErrorPayload
    | null = null;

  if (raw) {
    try {
      payload =
        JSON.parse(
          raw,
        ) as
          | T
          | SpotifyErrorPayload;
    } catch {
      payload =
        null;
    }
  }

  if (!response.ok) {
    const errorPayload =
      payload as
        | SpotifyErrorPayload
        | null;

    const nestedMessage =
      typeof errorPayload
        ?.error ===
        "object"
        ? errorPayload.error
            .message
        : undefined;

    const directMessage =
      typeof errorPayload
        ?.error ===
        "string"
        ? errorPayload.error
        : undefined;

    if (
      response.status ===
      401
    ) {
      throw new Error(
        "Spotify authorization expired. Reconnect Spotify in Music Services.",
      );
    }

    if (
      response.status ===
      403
    ) {
      throw new Error(
        "Spotify rejected this action. Reconnect Spotify and confirm playlist permissions.",
      );
    }

    if (
      response.status ===
      429
    ) {
      throw new Error(
        "Spotify is temporarily rate-limiting Canal. Try again shortly.",
      );
    }

    throw new Error(
      nestedMessage ||
        errorPayload
          ?.error_description ||
        directMessage ||
        `Spotify request failed with status ${response.status}.`,
    );
  }

  return (
    payload ??
    ({} as T)
  ) as T;
}

export async function searchSpotifySceneTracks(
  query: string,
): Promise<
  SpotifySceneSearchTrack[]
> {
  const normalized =
    query.trim();

  if (
    normalized.length <
    2
  ) {
    throw new Error(
      "Enter at least two characters to search Spotify.",
    );
  }

  const result =
    await spotifyRequest<{
      tracks?: {
        items?: Array<
          SpotifySceneSearchTrack | null
        >;
      };
    }>(
      `/search?type=track&limit=10&q=${encodeURIComponent(normalized)}`,
    );

  return (
    result.tracks
      ?.items ??
    []
  ).filter(
    (
      track,
    ): track is SpotifySceneSearchTrack =>
      Boolean(
        track?.id &&
          track.name &&
          track.uri,
      ),
  );
}

export function spotifySearchTrackToSceneTrack(
  track: SpotifySceneSearchTrack,
): SceneTrack {
  return {
    id:
      track.id,

    title:
      track.name,

    artist:
      track.artists
        .map(
          (artist) =>
            artist.name,
        )
        .filter(
          Boolean,
        )
        .join(
          ", ",
        ),

    source:
      "spotify-search",

    spotifyUri:
      track.uri,

    spotifyUrl:
      track.external_urls
        ?.spotify,

    durationMs:
      track.duration_ms,

    imageUrl:
      track.album
        ?.images?.[0]
        ?.url,
  };
}

function buildTrackSearchQuery(
  track: SceneTrack,
): string {
  return [
    track.title,
    track.artist,
  ]
    .filter(
      Boolean,
    )
    .join(
      " ",
    );
}

async function resolveSceneTrackUri(
  track: SceneTrack,
): Promise<string | null> {
  if (
    track.spotifyUri
      ?.startsWith(
        "spotify:track:",
      )
  ) {
    return track.spotifyUri;
  }

  const query =
    buildTrackSearchQuery(
      track,
    );

  if (!query) {
    return null;
  }

  try {
    const matches =
      await searchSpotifySceneTracks(
        query,
      );

    return (
      matches[0]
        ?.uri ??
      null
    );
  } catch {
    return null;
  }
}

export async function exportSceneToSpotify(
  scene: StoredScene,
  description?: string,
): Promise<SpotifySceneExportResult> {
  if (
    scene.tracks.length ===
    0
  ) {
    throw new Error(
      "This Scene has no tracks to export.",
    );
  }

  const uriResults =
    await Promise.all(
      scene.tracks.map(
        resolveSceneTrackUri,
      ),
    );

  const uris =
    Array.from(
      new Set(
        uriResults.filter(
          (
            uri,
          ): uri is string =>
            Boolean(
              uri?.startsWith(
                "spotify:track:",
              ),
            ),
        ),
      ),
    );

  if (
    uris.length ===
    0
  ) {
    throw new Error(
      "Canal could not match any Scene tracks to Spotify.",
    );
  }

  const playlist =
    await spotifyRequest<{
      id: string;
      uri?: string;
      external_urls?: {
        spotify?: string;
      };
    }>(
      "/me/playlists",
      {
        method:
          "POST",

        body:
          JSON.stringify({
            name:
              `Canal: ${scene.name}`,

            description:
              (
                description ||
                `A Scene exported from Canal for ${scene.activity || "listening"}.`
              ).slice(
                0,
                300,
              ),

            public:
              false,

            collaborative:
              false,
          }),
      },
    );

  if (!playlist.id) {
    throw new Error(
      "Spotify created no usable playlist.",
    );
  }

  for (
    let index = 0;
    index <
    uris.length;
    index += 100
  ) {
    const chunk =
      uris.slice(
        index,
        index + 100,
      );

    await spotifyRequest(
      `/playlists/${encodeURIComponent(playlist.id)}/items`,
      {
        method:
          "POST",

        body:
          JSON.stringify({
            uris:
              chunk,
          }),
      },
    );
  }

  return {
    playlistId:
      playlist.id,

    playlistUrl:
      playlist.external_urls
        ?.spotify ??
      null,

    playlistUri:
      playlist.uri ??
      null,

    trackCount:
      uris.length,

    skippedCount:
      Math.max(
        0,
        scene.tracks.length -
          uris.length,
      ),
  };
}
