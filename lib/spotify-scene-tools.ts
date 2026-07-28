import {
  requireGuardedSpotifyPlaylistExportSession,
  SpotifySessionChangedError,
  spotifyAuthenticatedFetch,
} from "./spotify-auth";

import type {
  SpotifyConnectionGuard,
} from "./spotify-auth";

import type {
  SceneTrack,
  StoredScene,
} from "./scenes";

import type {
  SpotifyTrack,
} from "./spotify-api";

import type {
  SpotifyLibrarySnapshot,
} from "./spotify-library";

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
  connectionGuard?:
    SpotifyConnectionGuard,
): Promise<T> {
  const response =
    await spotifyAuthenticatedFetch(
      `${SPOTIFY_API_BASE}${path}`,
      {
        ...init,

        headers: {
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
      connectionGuard,
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
  connectionGuard?:
    SpotifyConnectionGuard,
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
      undefined,
      connectionGuard,
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

export function getSpotifyLibraryTrackSuggestions(
  snapshot:
    | SpotifyLibrarySnapshot
    | null,
  query: string,
  limit = 10,
): SpotifySceneSearchTrack[] {
  const normalized =
    query.trim().toLowerCase();

  if (
    !snapshot ||
    !normalized
  ) {
    return [];
  }

  const candidates =
    new Map<
      string,
      {
        track: SpotifyTrack;
        score: number;
      }
    >();

  const addTracks = (
    tracks: SpotifyTrack[],
    sourceScore: number,
  ): void => {
    tracks.forEach(
      (track, index) => {
        const title =
          track.name.toLowerCase();

        const artists =
          track.artists
            .map(
              (artist) =>
                artist.name.toLowerCase(),
            )
            .join(" ");

        const titleStarts =
          title.startsWith(
            normalized,
          );

        const artistStarts =
          track.artists.some(
            (artist) =>
              artist.name
                .toLowerCase()
                .startsWith(
                  normalized,
                ),
          );

        if (
          !title.includes(
            normalized,
          ) &&
          !artists.includes(
            normalized,
          )
        ) {
          return;
        }

        const score =
          sourceScore -
          index +
          (titleStarts
            ? 50
            : 0) +
          (artistStarts
            ? 40
            : 0);

        const existing =
          candidates.get(
            track.id,
          );

        if (
          !existing ||
          score >
            existing.score
        ) {
          candidates.set(
            track.id,
            {
              track,
              score,
            },
          );
        }
      },
    );
  };

  addTracks(
    snapshot.recentTracks,
    300,
  );

  addTracks(
    snapshot.topTracks,
    240,
  );

  addTracks(
    snapshot.savedTracks,
    180,
  );

  addTracks(
    snapshot.playlistTracks,
    210,
  );

  addTracks(
    snapshot.discoveryTracks,
    100,
  );

  return Array.from(
    candidates.values(),
  )
    .sort(
      (first, second) =>
        second.score -
        first.score,
    )
    .slice(0, limit)
    .map(
      ({ track }) => ({
        id: track.id,
        name: track.name,
        uri: track.uri,
        duration_ms:
          track.duration_ms ??
          210_000,
        explicit:
          track.explicit ??
          false,
        artists:
          track.artists.map(
            (artist) => ({
              id: artist.id,
              name:
                artist.name,
            }),
          ),
        album:
          track.album
            ? {
                id:
                  track.album.id,
                name:
                  track.album.name,
                images:
                  track.album.images?.map(
                    (image) => ({
                      url:
                        image.url,
                      height:
                        image.height ??
                        null,
                      width:
                        image.width ??
                        null,
                    }),
                  ),
              }
            : undefined,
        external_urls:
          track.external_urls,
      }),
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
  connectionGuard:
    SpotifyConnectionGuard,
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
        connectionGuard,
      );

    return (
      matches[0]
        ?.uri ??
      null
    );
  } catch (error) {
    if (
      error instanceof
      SpotifySessionChangedError
    ) {
      throw error;
    }

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

  const {
    connectionGuard,
  } =
    await requireGuardedSpotifyPlaylistExportSession();

  const uriResults =
    await Promise.all(
      scene.tracks.map(
        (track) =>
          resolveSceneTrackUri(
            track,
            connectionGuard,
          ),
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
      connectionGuard,
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
      connectionGuard,
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
