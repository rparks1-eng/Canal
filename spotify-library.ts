import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  addSpotifyItemsToPlaylist,
  createSpotifyPlaylist,
  getSpotifyPlaylists,
  getSpotifyProfile,
  getSpotifyRecentlyPlayed,
  getSpotifySavedTracks,
  getSpotifyTopArtists,
  getSpotifyTopTracks,
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
  playlists: SpotifyPlaylist[];
  topGenres: SpotifyGenreSignal[];
  warnings: string[];
};

export type SpotifyPlaylistExportResult = {
  playlist: SpotifyPlaylist;
  trackCount: number;
};

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
    getSpotifySavedTracks(20),
    getSpotifyPlaylists(20),
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
      ? savedResult.value.items.map(
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
          .items
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

    playlists,

    topGenres:
      buildTopGenres(
        topArtists,
      ),

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
