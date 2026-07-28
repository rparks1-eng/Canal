import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  addSpotifyItemsToPlaylist,
  createSpotifyPlaylist,
  getAllSpotifyPlaylists,
  getAllSpotifyPlaylistTracks,
  getAllSpotifySavedTracks,
  getSpotifyArtistsByIds,
  getSpotifyProfile,
  getSpotifyRecentlyPlayed,
  getSpotifyTopArtists,
  getSpotifyTopTracks,
  searchSpotifyCatalogTracks,
} from "./spotify-api";

import type {
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "./spotify-api";

import type {
  SpotifyProfile,
} from "./spotify-auth";

export const SPOTIFY_LIBRARY_STORAGE_KEY =
  "@canal/spotify-library-snapshot";

export type SpotifyGenreSignal = {
  name: string;
  count: number;
};

export type SpotifyLibrarySnapshot = {
  syncedAt: string;
  profile: SpotifyProfile;
  topArtists: SpotifyArtist[];
  topTracks: SpotifyTrack[];
  recentTracks: SpotifyTrack[];
  savedTracks: SpotifyTrack[];
  playlistTracks: SpotifyTrack[];
  discoveryTracks: SpotifyTrack[];
  playlists: SpotifyPlaylist[];
  topGenres: SpotifyGenreSignal[];
  trackGenres: Record<
    string,
    string[]
  >;
  warnings: string[];
};

export type SpotifyPlaylistExportResult = {
  playlist: SpotifyPlaylist;
  trackCount: number;
};

export type LatestSpotifyLibraryResult = {
  snapshot: SpotifyLibrarySnapshot | null;
  refreshed: boolean;
  warning?: string;
};

const DEFAULT_LIBRARY_MAX_AGE_MS =
  6 * 60 * 60 * 1000;

let libraryRefreshPromise:
  Promise<SpotifyLibrarySnapshot> | null =
    null;

let lastLibraryRefreshFailureAt =
  0;

function readErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "Unknown Spotify error.";
}

function buildTopGenres(
  artists: SpotifyArtist[],
): SpotifyGenreSignal[] {
  const genreCounts =
    new Map<string, number>();

  for (
    const artist of artists
  ) {
    for (
      const genre of
        artist.genres ?? []
    ) {
      const normalizedGenre =
        genre.trim();

      if (!normalizedGenre) {
        continue;
      }

      genreCounts.set(
        normalizedGenre,

        (genreCounts.get(
          normalizedGenre,
        ) ?? 0) + 1,
      );
    }
  }

  return Array.from(
    genreCounts.entries(),
  )
    .map(
      ([name, count]) => ({
        name,
        count,
      }),
    )
    .sort(
      (first, second) =>
        second.count -
        first.count,
    )
    .slice(0, 12);
}

function deduplicateTracks(
  tracks: SpotifyTrack[],
): SpotifyTrack[] {
  const tracksById =
    new Map<
      string,
      SpotifyTrack
    >();

  for (
    const track of tracks
  ) {
    if (!track?.id) {
      continue;
    }

    if (
      !tracksById.has(
        track.id,
      )
    ) {
      tracksById.set(
        track.id,
        track,
      );
    }
  }

  return Array.from(
    tracksById.values(),
  );
}

export async function saveSpotifyLibrarySnapshot(
  snapshot: SpotifyLibrarySnapshot,
): Promise<void> {
  await AsyncStorage.setItem(
    SPOTIFY_LIBRARY_STORAGE_KEY,
    JSON.stringify(snapshot),
  );
}

export async function readSpotifyLibrarySnapshot(): Promise<
  SpotifyLibrarySnapshot | null
> {
  const serialized =
    await AsyncStorage.getItem(
      SPOTIFY_LIBRARY_STORAGE_KEY,
    );

  if (!serialized) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(serialized) as
        Partial<SpotifyLibrarySnapshot>;

    if (
      !parsed.profile ||
      typeof parsed.syncedAt !==
        "string"
    ) {
      return null;
    }

    return {
      syncedAt:
        parsed.syncedAt,

      profile:
        parsed.profile,

      topArtists:
        Array.isArray(
          parsed.topArtists,
        )
          ? parsed.topArtists
          : [],

      topTracks:
        Array.isArray(
          parsed.topTracks,
        )
          ? parsed.topTracks
          : [],

      recentTracks:
        Array.isArray(
          parsed.recentTracks,
        )
          ? parsed.recentTracks
          : [],

      savedTracks:
        Array.isArray(
          parsed.savedTracks,
        )
          ? parsed.savedTracks
          : [],

      playlistTracks:
        Array.isArray(
          parsed.playlistTracks,
        )
          ? parsed.playlistTracks
          : [],

      discoveryTracks:
        Array.isArray(
          parsed.discoveryTracks,
        )
          ? parsed.discoveryTracks
          : [],

      playlists:
        Array.isArray(
          parsed.playlists,
        )
          ? parsed.playlists
          : [],

      topGenres:
        Array.isArray(
          parsed.topGenres,
        )
          ? parsed.topGenres
          : [],

      trackGenres:
        parsed.trackGenres &&
        typeof parsed.trackGenres ===
          "object"
          ? parsed.trackGenres
          : {},

      warnings:
        Array.isArray(
          parsed.warnings,
        )
          ? parsed.warnings
          : [],
    };
  } catch {
    return null;
  }
}

export async function clearSpotifyLibrarySnapshot(): Promise<void> {
  await AsyncStorage.removeItem(
    SPOTIFY_LIBRARY_STORAGE_KEY,
  );
}

export async function getLatestSpotifyLibrarySnapshot(
  maxAgeMs =
    DEFAULT_LIBRARY_MAX_AGE_MS,
): Promise<LatestSpotifyLibraryResult> {
  const cached =
    await readSpotifyLibrarySnapshot();

  const syncedAt =
    cached
      ? Date.parse(
          cached.syncedAt,
        )
      : Number.NaN;

  const isFresh =
    Number.isFinite(syncedAt) &&
    Date.now() - syncedAt <
      maxAgeMs;

  if (cached && isFresh) {
    return {
      snapshot: cached,
      refreshed: false,
    };
  }

  if (
    cached &&
    Date.now() -
      lastLibraryRefreshFailureAt <
      15 * 60 * 1000
  ) {
    return {
      snapshot: cached,
      refreshed: false,
      warning:
        "Using the last Spotify sync while Canal waits to retry the connection.",
    };
  }

  try {
    if (!libraryRefreshPromise) {
      libraryRefreshPromise =
        syncSpotifyLibrary().finally(
          () => {
            libraryRefreshPromise =
              null;
          },
        );
    }

    const refreshedSnapshot =
      await libraryRefreshPromise;

    lastLibraryRefreshFailureAt =
      0;

    return {
      snapshot:
        refreshedSnapshot,
      refreshed: true,
    };
  } catch (error) {
    lastLibraryRefreshFailureAt =
      Date.now();

    if (cached) {
      return {
        snapshot: cached,
        refreshed: false,
        warning:
          error instanceof Error
            ? `Using the last Spotify sync because the latest listening data could not refresh: ${error.message}`
            : "Using the last Spotify sync because the latest listening data could not refresh.",
      };
    }

    return {
      snapshot: null,
      refreshed: false,
      warning:
        error instanceof Error
          ? error.message
          : "Canal could not load Spotify listening data.",
    };
  }
}

export async function syncSpotifyLibrary(): Promise<
  SpotifyLibrarySnapshot
> {
  const [
    profileResult,
    topArtistsResult,
    topTracksResult,
    recentResult,
    savedResult,
    playlistsResult,
  ] = await Promise.allSettled([
    getSpotifyProfile(),
    getSpotifyTopArtists(20),
    getSpotifyTopTracks(20),
    getSpotifyRecentlyPlayed(20),
    getAllSpotifySavedTracks(),
    getAllSpotifyPlaylists(),
  ]);

  if (
    profileResult.status ===
    "rejected"
  ) {
    throw new Error(
      readErrorMessage(
        profileResult.reason,
      ),
    );
  }

  const warnings: string[] =
    [];

  const topArtists =
    topArtistsResult.status ===
    "fulfilled"
      ? topArtistsResult.value
          .items
      : [];

  if (
    topArtistsResult.status ===
    "rejected"
  ) {
    warnings.push(
      `Top artists: ${readErrorMessage(
        topArtistsResult.reason,
      )}`,
    );
  }

  const topTracks =
    topTracksResult.status ===
    "fulfilled"
      ? topTracksResult.value
          .items
      : [];

  if (
    topTracksResult.status ===
    "rejected"
  ) {
    warnings.push(
      `Top tracks: ${readErrorMessage(
        topTracksResult.reason,
      )}`,
    );
  }

  const recentTracks =
    recentResult.status ===
    "fulfilled"
      ? recentResult.value.items.map(
          (item) => item.track,
        )
      : [];

  if (
    recentResult.status ===
    "rejected"
  ) {
    warnings.push(
      `Recently played: ${readErrorMessage(
        recentResult.reason,
      )}`,
    );
  }

  const savedTracks =
    savedResult.status ===
    "fulfilled"
      ? savedResult.value.map(
          (item) => item.track,
        )
      : [];

  if (
    savedResult.status ===
    "rejected"
  ) {
    warnings.push(
      `Saved tracks: ${readErrorMessage(
        savedResult.reason,
      )}`,
    );
  }

  const playlists =
    playlistsResult.status ===
    "fulfilled"
      ? playlistsResult.value
      : [];

  if (
    playlistsResult.status ===
    "rejected"
  ) {
    warnings.push(
      `Playlists: ${readErrorMessage(
        playlistsResult.reason,
      )}`,
    );
  }

  const playlistTracks:
    SpotifyTrack[] = [];

  for (
    const playlist of
      playlists
  ) {
    try {
      playlistTracks.push(
        ...(await getAllSpotifyPlaylistTracks(
          playlist.id,
        )),
      );
    } catch (error) {
      warnings.push(
        `Playlist ${playlist.name}: ${readErrorMessage(
          error,
        )}`,
      );
    }
  }

  const userLibraryTracks =
    deduplicateTracks([
      ...topTracks,
      ...savedTracks,
      ...recentTracks,
      ...playlistTracks,
    ]);

  const artistIds =
    userLibraryTracks.flatMap(
      (track) =>
        track.artists.map(
          (artist) =>
            artist.id,
        ),
    );

  let libraryArtists:
    SpotifyArtist[] = [];

  try {
    libraryArtists =
      await getSpotifyArtistsByIds(
        artistIds,
      );
  } catch (error) {
    warnings.push(
      `Track genres: ${readErrorMessage(
        error,
      )}`,
    );
  }

  const artistsById =
    new Map(
      [
        ...topArtists,
        ...libraryArtists,
      ].map(
        (artist) => [
          artist.id,
          artist,
        ] as const,
      ),
    );

  const trackGenres:
    Record<
      string,
      string[]
    > = {};

  for (
    const track of
      userLibraryTracks
  ) {
    trackGenres[track.id] =
      Array.from(
        new Set(
          track.artists.flatMap(
            (artist) =>
              artistsById.get(
                artist.id,
              )?.genres ??
              [],
          ),
        ),
      );
  }

  const topGenres =
    buildTopGenres([
      ...topArtists,
      ...libraryArtists,
    ]);

  const userTrackIds =
    new Set(
      userLibraryTracks.map(
        (track) =>
          track.id,
      ),
    );

  const discoveryTracks:
    SpotifyTrack[] = [];

  for (
    const genre of
      topGenres.slice(0, 4)
  ) {
    try {
      const matches =
        (
          await searchSpotifyCatalogTracks(
            `genre:"${genre.name}"`,
            10,
          )
        ).filter(
          (track) =>
            !userTrackIds.has(
              track.id,
            ),
        );

      for (
        const track of
          matches
      ) {
        discoveryTracks.push(
          track,
        );

        trackGenres[track.id] =
          Array.from(
            new Set([
              ...(trackGenres[
                track.id
              ] ?? []),
              genre.name,
            ]),
          );
      }
    } catch (error) {
      warnings.push(
        `Discovery for ${genre.name}: ${readErrorMessage(
          error,
        )}`,
      );
    }
  }

  const snapshot: SpotifyLibrarySnapshot = {
    syncedAt:
      new Date().toISOString(),

    profile:
      profileResult.value,

    topArtists,

    topTracks:
      deduplicateTracks(
        topTracks,
      ),

    recentTracks:
      deduplicateTracks(
        recentTracks,
      ),

    savedTracks:
      deduplicateTracks(
        savedTracks,
      ),

    playlistTracks:
      deduplicateTracks(
        playlistTracks,
      ),

    discoveryTracks:
      deduplicateTracks(
        discoveryTracks,
      ),

    playlists,

    topGenres,

    trackGenres,

    warnings,
  };

  await saveSpotifyLibrarySnapshot(
    snapshot,
  );

  return snapshot;
}

export async function exportSpotifyTastePlaylist(
  snapshot: SpotifyLibrarySnapshot,
): Promise<SpotifyPlaylistExportResult> {
  const candidateTracks =
    deduplicateTracks([
      ...snapshot.topTracks,
      ...snapshot.savedTracks,
      ...snapshot.recentTracks,
    ]);

  const trackUris =
    candidateTracks
      .map((track) =>
        track.uri,
      )
      .filter(
        (uri) =>
          typeof uri ===
            "string" &&
          uri.startsWith(
            "spotify:track:",
          ),
      )
      .slice(0, 50);

  if (
    trackUris.length === 0
  ) {
    throw new Error(
      "Canal could not find any Spotify tracks to export.",
    );
  }

  const displayName =
    snapshot.profile
      .display_name?.trim() ||
    "My";

  const playlist =
    await createSpotifyPlaylist({
      name:
        `Canal: ${displayName} Current Sound`,

      description:
        "A private playlist created by Canal from your Spotify top tracks, saved music, and recent listening.",

      isPublic: false,
    });

  await addSpotifyItemsToPlaylist(
    playlist.id,
    trackUris,
  );

  return {
    playlist,
    trackCount:
      trackUris.length,
  };
}
