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
  SpotifyConnectionGuard,
  SpotifyProfile,
} from "./spotify-auth";

import {
  assertSpotifyConnectionGuardCurrent,
  getSpotifyConnectionGeneration,
  isSpotifyConnectionGuardCurrent,
  readGuardedSpotifySession,
  requireGuardedSpotifyLibrarySession,
  requireGuardedSpotifyPlaylistExportSession,
} from "./spotify-auth";

import type {
  RecoveryIssue,
} from "./recovery-issue";

import {
  classifyRecoveryIssue,
} from "./recovery-issue";

export const SPOTIFY_LIBRARY_STORAGE_KEY =
  "@canal/spotify-library-snapshot";

const SPOTIFY_LIBRARY_ENVELOPE_VERSION =
  2;

type PersistedSpotifyLibraryEnvelope = {
  version: number;
  ownerId: string;
  accountGeneration: number;
  snapshot:
    SpotifyLibrarySnapshot;
};

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
  issue?: RecoveryIssue;
};

const DEFAULT_LIBRARY_MAX_AGE_MS =
  6 * 60 * 60 * 1000;

let libraryRefreshPromise:
  Promise<SpotifyLibrarySnapshot> | null =
    null;

let libraryRefreshGeneration:
  number | null =
    null;

let lastLibraryRefreshFailureAt =
  0;

let lastLibraryRefreshIssue:
  RecoveryIssue | null =
    null;

let libraryCacheOperationTail:
  Promise<void> =
    Promise.resolve();

async function runLibraryCacheOperation<
  Result,
>(
  operation:
    () => Promise<Result>,
): Promise<Result> {
  const previousOperation =
    libraryCacheOperationTail;

  let releaseOperation:
    () => void =
      () => {};

  libraryCacheOperationTail =
    new Promise<void>(
      (resolve) => {
        releaseOperation =
          resolve;
      },
    );

  await previousOperation;

  try {
    return await operation();
  } finally {
    releaseOperation();
  }
}

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

function isSpotifyAccessFailure(
  error: unknown,
): boolean {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return false;
  }

  const candidate =
    error as {
      status?: unknown;
      authorizationInvalid?: unknown;
    };

  return (
    candidate.status ===
      401 ||
    candidate.status ===
      403 ||
    candidate.authorizationInvalid ===
      true
  );
}

function rethrowSpotifyAccessFailure(
  error: unknown,
): void {
  if (
    isSpotifyAccessFailure(
      error,
    )
  ) {
    throw error;
  }
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

async function writeSpotifyLibrarySnapshot(
  snapshot: SpotifyLibrarySnapshot,
  options: {
    expectedConnectionGeneration?: number;
    connectionGuard?:
      SpotifyConnectionGuard;
  } = {},
): Promise<void> {
  const guardedSession =
    await readGuardedSpotifySession();

  const connectionGuard =
    options.connectionGuard ??
    guardedSession?.connectionGuard;

  const ownershipChanged =
    !guardedSession ||
    !connectionGuard ||
    guardedSession.session.profile.id !==
      snapshot.profile.id ||
    (
      options.expectedConnectionGeneration !==
        undefined &&
      options.expectedConnectionGeneration !==
        connectionGuard.connectionGeneration
    );

  if (ownershipChanged) {
    throw new Error(
      "Spotify account changed while Canal was syncing. Sync the current account again.",
    );
  }

  await assertSpotifyConnectionGuardCurrent(
    connectionGuard,
  );

  const storedValue =
    connectionGuard.canalOwnerId
      ? {
          version:
            SPOTIFY_LIBRARY_ENVELOPE_VERSION,
          ownerId:
            connectionGuard.canalOwnerId,
          accountGeneration:
            connectionGuard.canalAccountGeneration,
          snapshot,
        } satisfies PersistedSpotifyLibraryEnvelope
      : snapshot;

  const serialized =
    JSON.stringify(
      storedValue,
    );

  await AsyncStorage.setItem(
    SPOTIFY_LIBRARY_STORAGE_KEY,
    serialized,
  );

  try {
    await assertSpotifyConnectionGuardCurrent(
      connectionGuard,
    );
  } catch (error) {
    await AsyncStorage.removeItem(
      SPOTIFY_LIBRARY_STORAGE_KEY,
    );

    throw error;
  }
}

export async function saveSpotifyLibrarySnapshot(
  snapshot: SpotifyLibrarySnapshot,
  options: {
    expectedConnectionGeneration?: number;
    connectionGuard?:
      SpotifyConnectionGuard;
  } = {},
): Promise<void> {
  return runLibraryCacheOperation(
    () =>
      writeSpotifyLibrarySnapshot(
        snapshot,
        options,
      ),
  );
}

function normalizeSpotifyLibrarySnapshot(
  value: unknown,
): SpotifyLibrarySnapshot | null {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  const parsed =
    value as
      Partial<SpotifyLibrarySnapshot>;

  if (
    !parsed.profile ||
    typeof parsed.profile.id !==
      "string" ||
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
}

function normalizeSpotifyLibraryEnvelope(
  value: unknown,
): PersistedSpotifyLibraryEnvelope | null {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  const candidate =
    value as
      Partial<PersistedSpotifyLibraryEnvelope>;

  if (
    candidate.version !==
      SPOTIFY_LIBRARY_ENVELOPE_VERSION ||
    typeof candidate.ownerId !==
      "string" ||
    !candidate.ownerId ||
    typeof candidate.accountGeneration !==
      "number" ||
    !Number.isSafeInteger(
      candidate.accountGeneration,
    ) ||
    candidate.accountGeneration < 1
  ) {
    return null;
  }

  const snapshot =
    normalizeSpotifyLibrarySnapshot(
      candidate.snapshot,
    );

  if (!snapshot) {
    return null;
  }

  return {
    version:
      SPOTIFY_LIBRARY_ENVELOPE_VERSION,
    ownerId:
      candidate.ownerId,
    accountGeneration:
      candidate.accountGeneration,
    snapshot,
  };
}

async function loadSpotifyLibrarySnapshot(): Promise<
  SpotifyLibrarySnapshot | null
> {
  const guardedSession =
    await readGuardedSpotifySession();

  if (!guardedSession) {
    await AsyncStorage.removeItem(
      SPOTIFY_LIBRARY_STORAGE_KEY,
    );

    return null;
  }

  const {
    connectionGuard,
    session,
  } =
    guardedSession;

  const serialized =
    await AsyncStorage.getItem(
      SPOTIFY_LIBRARY_STORAGE_KEY,
    );

  if (!serialized) {
    return null;
  }

  try {
    const parsed: unknown =
      JSON.parse(
        serialized,
      );

    const envelope =
      normalizeSpotifyLibraryEnvelope(
        parsed,
      );

    const snapshot =
      connectionGuard.canalOwnerId
        ? (
            envelope?.ownerId ===
              connectionGuard.canalOwnerId &&
            envelope.accountGeneration ===
              connectionGuard.canalAccountGeneration
              ? envelope.snapshot
              : null
          )
        : (
            envelope?.snapshot ??
            normalizeSpotifyLibrarySnapshot(
              parsed,
            )
          );

    if (
      !snapshot ||
      session.profile.id !==
        snapshot.profile.id
    ) {
      await AsyncStorage.removeItem(
        SPOTIFY_LIBRARY_STORAGE_KEY,
      );

      return null;
    }

    await assertSpotifyConnectionGuardCurrent(
      connectionGuard,
    );

    return snapshot;
  } catch {
    await AsyncStorage.removeItem(
      SPOTIFY_LIBRARY_STORAGE_KEY,
    );

    return null;
  }
}

export async function readSpotifyLibrarySnapshot(): Promise<
  SpotifyLibrarySnapshot | null
> {
  return runLibraryCacheOperation(
    loadSpotifyLibrarySnapshot,
  );
}

export async function clearSpotifyLibrarySnapshot(): Promise<void> {
  return runLibraryCacheOperation(
    () =>
      AsyncStorage.removeItem(
        SPOTIFY_LIBRARY_STORAGE_KEY,
      ),
  );
}

async function isSpotifyConnectionStillCurrent(
  connectionGuard:
    SpotifyConnectionGuard,
): Promise<boolean> {
  if (
    !isSpotifyConnectionGuardCurrent(
      connectionGuard,
    )
  ) {
    return false;
  }

  try {
    await assertSpotifyConnectionGuardCurrent(
      connectionGuard,
    );

    return true;
  } catch {
    return false;
  }
}

export async function getLatestSpotifyLibrarySnapshot(
  maxAgeMs =
    DEFAULT_LIBRARY_MAX_AGE_MS,
): Promise<LatestSpotifyLibraryResult> {
  const cachedCandidate =
    await readSpotifyLibrarySnapshot();

  let connectionGuard:
    Awaited<
      ReturnType<
        typeof requireGuardedSpotifyLibrarySession
      >
    >["connectionGuard"];

  try {
    ({
      connectionGuard,
    } =
      await requireGuardedSpotifyLibrarySession());
  } catch (error) {
    const issue =
      classifyRecoveryIssue(
        error,
        {
          service:
            "spotify",
        },
      );

    lastLibraryRefreshFailureAt =
      Date.now();

    lastLibraryRefreshIssue =
      issue;

    const availableCached =
      await readSpotifyLibrarySnapshot();

    return {
      snapshot:
        availableCached,
      refreshed:
        false,
      warning:
        availableCached
          ? `Using the last Spotify sync. ${issue.message}`
          : issue.message,
      issue,
    };
  }

  const connectionIsCurrent =
    await isSpotifyConnectionStillCurrent(
      connectionGuard,
    );

  let cached =
    cachedCandidate &&
    cachedCandidate.profile.id ===
      connectionGuard.profileId &&
    connectionIsCurrent
      ? cachedCandidate
      : null;

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

  if (
    cached &&
    isFresh &&
    await isSpotifyConnectionStillCurrent(
      connectionGuard,
    )
  ) {
    return {
      snapshot: cached,
      refreshed: false,
    };
  }

  if (
    cached &&
    await isSpotifyConnectionStillCurrent(
      connectionGuard,
    ) &&
    Date.now() -
      lastLibraryRefreshFailureAt <
      15 * 60 * 1000
  ) {
    return {
      snapshot: cached,
      refreshed: false,
      warning:
        "Using the last Spotify sync while Canal waits to retry the connection.",
      issue:
        lastLibraryRefreshIssue ??
        undefined,
    };
  }

  try {
    const refreshedSnapshot =
      await syncSpotifyLibrary();

    lastLibraryRefreshFailureAt =
      0;

    lastLibraryRefreshIssue =
      null;

    return {
      snapshot:
        refreshedSnapshot,
      refreshed: true,
    };
  } catch (error) {
    lastLibraryRefreshFailureAt =
      Date.now();

    const issue =
      classifyRecoveryIssue(
        error,
        {
          service:
            "spotify",
        },
      );

    lastLibraryRefreshIssue =
      issue;

    if (
      !(
        await isSpotifyConnectionStillCurrent(
          connectionGuard,
        )
      )
    ) {
      cached =
        null;
    }

    if (cached) {
      return {
        snapshot: cached,
        refreshed: false,
        warning:
          `Using the last Spotify sync because the latest listening data could not refresh. ${issue.message}`,
        issue,
      };
    }

    return {
      snapshot: null,
      refreshed: false,
      warning:
        issue.message,
      issue,
    };
  }
}

export async function syncSpotifyLibrary(): Promise<
  SpotifyLibrarySnapshot
> {
  const connectionGeneration =
    getSpotifyConnectionGeneration();

  if (
    libraryRefreshPromise &&
    libraryRefreshGeneration ===
      connectionGeneration
  ) {
    return libraryRefreshPromise;
  }

  const nextPromise =
    performSpotifyLibrarySync(
      connectionGeneration,
    ).finally(
      () => {
        if (
          libraryRefreshPromise ===
          nextPromise
        ) {
          libraryRefreshPromise =
            null;

          libraryRefreshGeneration =
            null;
        }
      },
    );

  libraryRefreshPromise =
    nextPromise;

  libraryRefreshGeneration =
    connectionGeneration;

  return nextPromise;
}

async function performSpotifyLibrarySync(
  expectedConnectionGeneration: number,
): Promise<
  SpotifyLibrarySnapshot
> {
  const {
    session:
      syncSession,
    connectionGuard,
  } =
    await requireGuardedSpotifyLibrarySession();

  if (
    expectedConnectionGeneration !==
    connectionGuard.connectionGeneration
  ) {
    throw new Error(
      "Spotify account changed while Canal was syncing. Sync the current account again.",
    );
  }

  await assertSpotifyConnectionGuardCurrent(
    connectionGuard,
  );

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
    throw profileResult.reason;
  }

  if (
    profileResult.value.id !==
    syncSession.profile.id
  ) {
    throw new Error(
      "Spotify account changed while Canal was syncing. Sync the current account again.",
    );
  }

  await assertSpotifyConnectionGuardCurrent(
    connectionGuard,
  );

  for (
    const result of [
      topArtistsResult,
      topTracksResult,
      recentResult,
      savedResult,
      playlistsResult,
    ]
  ) {
    if (
      result.status ===
      "rejected"
    ) {
      rethrowSpotifyAccessFailure(
        result.reason,
      );
    }
  }

  const libraryResults =
    [
      topArtistsResult,
      topTracksResult,
      recentResult,
      savedResult,
      playlistsResult,
    ];

  if (
    libraryResults.every(
      (result) =>
        result.status ===
        "rejected",
    )
  ) {
    const firstFailure =
      libraryResults.find(
        (result) =>
          result.status ===
          "rejected",
      );

    if (
      firstFailure?.status ===
      "rejected"
    ) {
      throw firstFailure.reason;
    }
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
      rethrowSpotifyAccessFailure(
        error,
      );

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
    rethrowSpotifyAccessFailure(
      error,
    );

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
      rethrowSpotifyAccessFailure(
        error,
      );

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
    {
      expectedConnectionGeneration:
        expectedConnectionGeneration,
      connectionGuard,
    },
  );

  lastLibraryRefreshFailureAt =
    0;

  lastLibraryRefreshIssue =
    null;

  return snapshot;
}

export async function exportSpotifyTastePlaylist(
  snapshot: SpotifyLibrarySnapshot,
): Promise<SpotifyPlaylistExportResult> {
  const {
    session,
    connectionGuard,
  } =
    await requireGuardedSpotifyPlaylistExportSession();

  if (
    session.profile.id !==
    snapshot.profile.id
  ) {
    throw new Error(
      "This Spotify snapshot belongs to a different account. Sync the current account before exporting.",
    );
  }

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
    },
    {
      connectionGuard,
    },
    );

  await addSpotifyItemsToPlaylist(
    playlist.id,
    trackUris,
    {
      connectionGuard,
    },
  );

  return {
    playlist,
    trackCount:
      trackUris.length,
  };
}
