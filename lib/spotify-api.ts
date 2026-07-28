import {
  spotifyAuthenticatedFetch,
} from "./spotify-auth";

import type {
  SpotifyImage,
  SpotifyProfile,
} from "./spotify-auth";

const SPOTIFY_API_BASE_URL =
  "https://api.spotify.com/v1";

export type SpotifyExternalUrls = {
  spotify?: string;
};

export type SpotifyArtistSummary = {
  id: string;
  name: string;
  uri: string;
  href?: string;
  external_urls?: SpotifyExternalUrls;
};

export type SpotifyArtist =
  SpotifyArtistSummary & {
    genres?: string[];
    images?: SpotifyImage[];
    popularity?: number;

    followers?: {
      total: number;
    };
  };

export type SpotifyAlbum = {
  id: string;
  name: string;
  uri: string;
  album_type?: string;
  release_date?: string;
  images?: SpotifyImage[];
  artists?: SpotifyArtistSummary[];
  external_urls?: SpotifyExternalUrls;
};

export type SpotifyTrack = {
  id: string;
  name: string;
  uri: string;
  href?: string;
  duration_ms?: number;
  explicit?: boolean;
  popularity?: number;
  preview_url?: string | null;
  is_local?: boolean;
  artists: SpotifyArtistSummary[];
  album?: SpotifyAlbum;
  external_urls?: SpotifyExternalUrls;
};

export type SpotifyPlaylistOwner = {
  id: string;
  display_name?: string | null;
  uri?: string;
  external_urls?: SpotifyExternalUrls;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  uri: string;
  description?: string | null;
  public?: boolean | null;
  collaborative?: boolean;
  images?: SpotifyImage[];
  owner?: SpotifyPlaylistOwner;
  external_urls?: SpotifyExternalUrls;

  items?: {
    total: number;
  };

  tracks?: {
    total: number;
  };
};

export type SpotifyPage<T> = {
  href?: string;
  items: T[];
  limit?: number;
  next?: string | null;
  offset?: number;
  previous?: string | null;
  total?: number;
};

export type SpotifyRecentItem = {
  played_at: string;
  context?: {
    type?: string;
    uri?: string;
    external_urls?: SpotifyExternalUrls;
  } | null;
  track: SpotifyTrack;
};

export type SpotifyPlaylistTrackItem = {
  track?: SpotifyTrack | null;
  item?: SpotifyTrack | null;
};

export type SpotifySavedTrackItem = {
  added_at: string;
  track: SpotifyTrack;
};

export type SpotifyRecentResponse =
  SpotifyPage<SpotifyRecentItem> & {
    cursors?: {
      after?: string;
      before?: string;
    };
  };

type SpotifyRequestOptions = {
  method?:
    | "GET"
    | "POST"
    | "PUT"
    | "DELETE";

  body?: unknown;
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

export class SpotifyApiError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    retryAfterSeconds?: number,
  ) {
    super(message);

    this.name =
      "SpotifyApiError";

    this.status = status;

    this.retryAfterSeconds =
      retryAfterSeconds;
  }
}

function buildSpotifyUrl(
  path: string,
): string {
  if (
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }

  if (path.startsWith("/")) {
    return (
      SPOTIFY_API_BASE_URL +
      path
    );
  }

  return (
    SPOTIFY_API_BASE_URL +
    "/" +
    path
  );
}

function readSpotifyErrorMessage(
  payload: SpotifyErrorPayload | null,
  fallback: string,
): string {
  if (!payload) {
    return fallback;
  }

  if (
    typeof payload.error_description ===
    "string"
  ) {
    return payload.error_description;
  }

  if (
    typeof payload.error ===
    "string"
  ) {
    return payload.error;
  }

  if (
    payload.error &&
    typeof payload.error.message ===
      "string"
  ) {
    return payload.error.message;
  }

  return fallback;
}

async function spotifyRequest<T>(
  path: string,
  options: SpotifyRequestOptions = {},
): Promise<T> {
  const response =
    await spotifyAuthenticatedFetch(
    buildSpotifyUrl(path),
    {
      method:
        options.method ??
        "GET",

      headers: {
        Accept:
          "application/json",

        ...(options.body !== undefined
          ? {
              "Content-Type":
                "application/json",
            }
          : {}),
      },

      body:
        options.body !== undefined
          ? JSON.stringify(
              options.body,
            )
          : undefined,
    },
    );

  if (
    response.status === 204
  ) {
    return undefined as T;
  }

  let payload: unknown = null;

  const responseText =
    await response.text();

  if (responseText) {
    try {
      payload =
        JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const retryAfterHeader =
      response.headers.get(
        "Retry-After",
      );

    const retryAfterSeconds =
      retryAfterHeader
        ? Number(
            retryAfterHeader,
          )
        : undefined;

    const message =
      readSpotifyErrorMessage(
        payload as SpotifyErrorPayload | null,
        `Spotify request failed with status ${response.status}.`,
      );

    throw new SpotifyApiError(
      message,
      response.status,
      Number.isFinite(
        retryAfterSeconds,
      )
        ? retryAfterSeconds
        : undefined,
    );
  }

  return payload as T;
}

export async function getSpotifyProfile(): Promise<
  SpotifyProfile
> {
  return spotifyRequest<SpotifyProfile>(
    "/me",
  );
}

export async function getSpotifyTopArtists(
  limit = 20,
): Promise<SpotifyPage<SpotifyArtist>> {
  const safeLimit =
    Math.min(
      Math.max(limit, 1),
      50,
    );

  return spotifyRequest<
    SpotifyPage<SpotifyArtist>
  >(
    `/me/top/artists?time_range=medium_term&limit=${safeLimit}`,
  );
}

export async function getSpotifyTopTracks(
  limit = 20,
): Promise<SpotifyPage<SpotifyTrack>> {
  const safeLimit =
    Math.min(
      Math.max(limit, 1),
      50,
    );

  return spotifyRequest<
    SpotifyPage<SpotifyTrack>
  >(
    `/me/top/tracks?time_range=medium_term&limit=${safeLimit}`,
  );
}

export async function getSpotifyRecentlyPlayed(
  limit = 20,
): Promise<SpotifyRecentResponse> {
  const safeLimit =
    Math.min(
      Math.max(limit, 1),
      50,
    );

  return spotifyRequest<SpotifyRecentResponse>(
    `/me/player/recently-played?limit=${safeLimit}`,
  );
}

export async function getSpotifySavedTracks(
  limit = 20,
): Promise<
  SpotifyPage<SpotifySavedTrackItem>
> {
  const safeLimit =
    Math.min(
      Math.max(limit, 1),
      50,
    );

  return spotifyRequest<
    SpotifyPage<SpotifySavedTrackItem>
  >(
    `/me/tracks?limit=${safeLimit}&offset=0`,
  );
}

export async function getSpotifyPlaylists(
  limit = 20,
): Promise<SpotifyPage<SpotifyPlaylist>> {
  const safeLimit =
    Math.min(
      Math.max(limit, 1),
      50,
    );

  return spotifyRequest<
    SpotifyPage<SpotifyPlaylist>
  >(
    `/me/playlists?limit=${safeLimit}&offset=0`,
  );
}

async function collectSpotifyPages<T>(
  firstPath: string,
): Promise<T[]> {
  const items: T[] = [];
  const visited =
    new Set<string>();
  let next:
    | string
    | null =
      firstPath;

  while (
    next &&
    !visited.has(
      next,
    )
  ) {
    visited.add(next);

    const page:
      SpotifyPage<T> =
      await spotifyRequest<
        SpotifyPage<T>
      >(next);

    items.push(
      ...(page.items ?? []),
    );

    next =
      page.next ??
      null;
  }

  return items;
}

export async function getAllSpotifySavedTracks(): Promise<
  SpotifySavedTrackItem[]
> {
  return collectSpotifyPages<SpotifySavedTrackItem>(
    "/me/tracks?limit=50&offset=0",
  );
}

export async function getAllSpotifyPlaylists(): Promise<
  SpotifyPlaylist[]
> {
  return collectSpotifyPages<SpotifyPlaylist>(
    "/me/playlists?limit=50&offset=0",
  );
}

export async function getAllSpotifyPlaylistTracks(
  playlistId: string,
): Promise<SpotifyTrack[]> {
  const items =
    await collectSpotifyPages<SpotifyPlaylistTrackItem>(
      `/playlists/${encodeURIComponent(
        playlistId,
      )}/items?limit=50&offset=0`,
    );

  return items
    .map(
      (entry) =>
        entry.track ??
        entry.item ??
        null,
    )
    .filter(
      (
        track,
      ): track is SpotifyTrack =>
        Boolean(
          track?.id &&
            track.uri &&
            !track.is_local,
        ),
    );
}

export async function getSpotifyArtistsByIds(
  artistIds: string[],
): Promise<SpotifyArtist[]> {
  const uniqueIds =
    Array.from(
      new Set(
        artistIds.filter(
          Boolean,
        ),
      ),
    );

  const artists:
    SpotifyArtist[] = [];

  for (
    let index = 0;
    index <
    uniqueIds.length;
    index += 50
  ) {
    const batch =
      uniqueIds.slice(
        index,
        index + 50,
      );

    const response =
      await spotifyRequest<{
        artists?: Array<
          SpotifyArtist | null
        >;
      }>(
        `/artists?ids=${encodeURIComponent(
          batch.join(","),
        )}`,
      );

    artists.push(
      ...(response.artists ?? [])
        .filter(
          (
            artist,
          ): artist is SpotifyArtist =>
            artist !== null,
        ),
    );
  }

  return artists;
}

export async function searchSpotifyCatalogTracks(
  query: string,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const safeLimit =
    Math.min(
      Math.max(
        limit,
        1,
      ),
      10,
    );

  const response =
    await spotifyRequest<{
      tracks?: SpotifyPage<SpotifyTrack>;
    }>(
      `/search?type=track&limit=${safeLimit}&q=${encodeURIComponent(
        query,
      )}`,
    );

  return response.tracks
    ?.items ??
    [];
}

export async function createSpotifyPlaylist(
  input: {
    name: string;
    description?: string;
    isPublic?: boolean;
  },
): Promise<SpotifyPlaylist> {
  return spotifyRequest<SpotifyPlaylist>(
    "/me/playlists",
    {
      method: "POST",

      body: {
        name: input.name,

        description:
          input.description ??
          "",

        public:
          input.isPublic ??
          false,
      },
    },
  );
}

export async function addSpotifyItemsToPlaylist(
  playlistId: string,
  uris: string[],
): Promise<void> {
  const uniqueUris =
    Array.from(
      new Set(
        uris
          .map((uri) =>
            uri.trim(),
          )
          .filter(Boolean),
      ),
    );

  if (
    uniqueUris.length === 0
  ) {
    throw new Error(
      "There are no Spotify tracks to add.",
    );
  }

  for (
    let index = 0;
    index < uniqueUris.length;
    index += 100
  ) {
    const batch =
      uniqueUris.slice(
        index,
        index + 100,
      );

    await spotifyRequest<{
      snapshot_id?: string;
    }>(
      `/playlists/${encodeURIComponent(
        playlistId,
      )}/items`,
      {
        method: "POST",

        body: {
          uris: batch,
        },
      },
    );
  }
}
