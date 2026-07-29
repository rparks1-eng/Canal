import {
  addSpotifyItemsToPlaylist,
  createSpotifyPlaylist,
  searchSpotifyCatalogTracks,
} from "./spotify-api";

import {
  requireGuardedSpotifyPlaylistExportSession,
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

import {
  normalizeSpotifyTrackLinks,
} from "./spotify-track-links";

export type SpotifySceneSearchTrack = {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit: boolean;
  artists: {
    id?: string;
    name: string;
  }[];
  album?: {
    id?: string;
    name?: string;
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

  const tracks =
    await searchSpotifyCatalogTracks(
      normalized,
      10,
      {
        connectionGuard,
      },
    );

  return tracks.map(
    spotifyTrackToSceneSearchTrack,
  );
}

function spotifyTrackToSceneSearchTrack(
  track: SpotifyTrack,
): SpotifySceneSearchTrack {
  return {
    id:
      track.id,
    name:
      track.name,
    uri:
      track.uri,
    duration_ms:
      track.duration_ms ??
      210_000,
    explicit:
      track.explicit ??
      false,
    artists:
      track.artists.map(
        (artist) => ({
          id:
            artist.id,
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
          }
        : undefined,
    external_urls:
      track.external_urls,
  };
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
  };
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

  const uris =
    Array.from(
      new Set(
        scene.tracks
          .map(
            (track) =>
              normalizeSpotifyTrackLinks(
                track.spotifyUri,
                track.spotifyUrl,
              ).spotifyUri,
          )
          .filter(
            (
              uri,
            ): uri is string =>
              Boolean(uri),
          ),
      ),
    );

  if (
    uris.length ===
    0
  ) {
    throw new Error(
      "This legacy Scene has no Spotify track links to export. Sync Spotify and regenerate the Scene.",
    );
  }

  const playlist =
    await createSpotifyPlaylist(
      {
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
        isPublic:
          false,
      },
      {
        connectionGuard,
      },
    );

  if (!playlist.id) {
    throw new Error(
      "Spotify created no usable playlist.",
    );
  }

  await addSpotifyItemsToPlaylist(
    playlist.id,
    uris,
    {
      connectionGuard,
    },
  );

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
