import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  addSpotifyItemsToPlaylist,
  createSpotifyPlaylist,
  getAllSpotifyPlaylistTracks,
  getAllSpotifyPlaylists,
  getAllSpotifySavedTracks,
  getSpotifyRecentlyPlayed,
  getSpotifyTopArtists,
  getSpotifyTopTracks,
  SpotifyApiError,
} from "./spotify-api";

import type {
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "./spotify-api";

import type {
  SpotifyCacheScope,
  SpotifyConnectionGuard,
  SpotifyProfile,
} from "./spotify-auth";

import {
  assertSpotifyCacheScopeCurrent,
  assertSpotifyConnectionGuardCurrent,
  captureSpotifyCacheScope,
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

import {
  STORAGE_KEYS,
} from "./storage-keys";

export const SPOTIFY_LIBRARY_STORAGE_KEY =
  STORAGE_KEYS.spotifyLibrarySnapshot;

export const SPOTIFY_LIBRARY_IMPORT_CHECKPOINT_STORAGE_KEY =
  STORAGE_KEYS.spotifyLibraryImportCheckpoint;

const SPOTIFY_LIBRARY_ENVELOPE_VERSION =
  2;

const SPOTIFY_LIBRARY_IMPORT_CHECKPOINT_VERSION =
  1;

const PLAYLIST_IMPORT_CONCURRENCY =
  2;

const MAX_STORED_SPOTIFY_TEXT_LENGTH =
  500;

const MAX_STORED_SPOTIFY_GENRE_COUNT =
  24;

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

export type SpotifyLibraryImportSourceStatus = {
  state:
    | "pending"
    | "importing"
    | "complete"
    | "partial"
    | "failed";
  importedCount: number;
  totalCount?: number;
  message?: string;
};

export type SpotifySkippedPlaylist = {
  playlistId: string;
  name: string;
  reason:
    | "followed-playlist"
    | "inaccessible";
};

export type SpotifyLibraryImportStatus = {
  state:
    | "complete"
    | "incomplete";
  resumed: boolean;
  savedTracks:
    SpotifyLibraryImportSourceStatus;
  playlists:
    SpotifyLibraryImportSourceStatus;
  playlistTracks:
    SpotifyLibraryImportSourceStatus;
  skippedPlaylists:
    SpotifySkippedPlaylist[];
};

export type SpotifyLibraryImportProgress = {
  phase:
    | "saved-tracks"
    | "playlists"
    | "playlist-items"
    | "complete";
  status: SpotifyLibraryImportStatus;
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
  importStatus?:
    SpotifyLibraryImportStatus;
};

type SpotifyLibraryImportCheckpoint = {
  version: number;
  ownerId: string;
  sessionGeneration: string;
  spotifyAccountGeneration: number;
  profileId: string;
  createdAt: string;
  savedTrackOffset: number;
  playlistOffset: number;
  savedTracks: SpotifyTrack[];
  playlists: SpotifyPlaylist[];
  playlistTracks: SpotifyTrack[];
  playlistTrackOffsets: Record<
    string,
    number
  >;
  completedPlaylistIds: string[];
  retryAfterUntil?: number;
  status: SpotifyLibraryImportStatus;
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

export type SpotifyLibraryOperationOptions = {
  operationCommitGuard?:
    () => boolean;
  onProgress?: (
    progress: SpotifyLibraryImportProgress,
  ) => void;
};

const DEFAULT_LIBRARY_MAX_AGE_MS =
  24 * 60 * 60 * 1000;

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

let libraryRefreshCooldownUntil =
  0;

let libraryRefreshCooldownGeneration:
  number | null =
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

class SpotifyLibraryCooldownError extends Error {
  status = 429;
  retryAfterSeconds: number;
  reason?: string;

  constructor(
    retryAfterSeconds: number,
    issue: RecoveryIssue,
  ) {
    super(issue.message);

    this.name =
      "SpotifyLibraryCooldownError";

    this.retryAfterSeconds =
      retryAfterSeconds;

    this.reason =
      issue.title ===
        "Spotify quota reached"
        ? "QUOTA_EXCEEDED"
        : undefined;
  }
}

export class SpotifyLibraryImportIncompleteError extends Error {
  status?: number;
  retryAfterSeconds?: number;
  reason?: string;
  importStatus: SpotifyLibraryImportStatus;

  constructor(
    importStatus: SpotifyLibraryImportStatus,
    cause: unknown,
  ) {
    super(
      "Spotify import is incomplete. Resume it when the current connection is ready.",
    );

    this.name =
      "SpotifyLibraryImportIncompleteError";
    this.importStatus =
      importStatus;

    if (
      cause instanceof SpotifyApiError
    ) {
      this.status = cause.status;
      this.retryAfterSeconds =
        cause.retryAfterSeconds;
      this.reason = cause.reason;
    }
  }
}

function clearLibraryRefreshIssue(): void {
  lastLibraryRefreshFailureAt =
    0;

  lastLibraryRefreshIssue =
    null;

  libraryRefreshCooldownUntil =
    0;

  libraryRefreshCooldownGeneration =
    null;
}

function resetLibraryRefreshIssueForGeneration(
  connectionGeneration: number,
): void {
  if (
    libraryRefreshCooldownGeneration !==
      null &&
    libraryRefreshCooldownGeneration !==
      connectionGeneration
  ) {
    clearLibraryRefreshIssue();
  }
}

function rememberLibraryRefreshIssue(
  issue: RecoveryIssue,
  connectionGeneration: number,
): void {
  const now =
    Date.now();

  lastLibraryRefreshFailureAt =
    now;

  lastLibraryRefreshIssue =
    issue;

  libraryRefreshCooldownGeneration =
    connectionGeneration;

  libraryRefreshCooldownUntil =
    now +
    (
      issue.kind ===
        "rate-limited"
        ? issue.retryAfterMs ??
          15 *
            60 *
            1000
        : 15 *
          60 *
          1000
    );
}

function readLibraryRefreshCooldown(
  connectionGeneration: number,
): {
  issue: RecoveryIssue;
  error:
    SpotifyLibraryCooldownError;
} | null {
  resetLibraryRefreshIssueForGeneration(
    connectionGeneration,
  );

  if (
    !lastLibraryRefreshIssue ||
    lastLibraryRefreshIssue.kind !==
      "rate-limited" ||
    libraryRefreshCooldownGeneration !==
      connectionGeneration ||
    libraryRefreshCooldownUntil <=
      Date.now()
  ) {
    if (
      libraryRefreshCooldownUntil <=
        Date.now() &&
      libraryRefreshCooldownGeneration ===
        connectionGeneration
    ) {
      clearLibraryRefreshIssue();
    }

    return null;
  }

  const retryAfterSeconds =
    Math.max(
      1,
      Math.ceil(
        (
          libraryRefreshCooldownUntil -
          Date.now()
        ) /
          1000,
      ),
    );

  return {
    issue:
      lastLibraryRefreshIssue,
    error:
      new SpotifyLibraryCooldownError(
        retryAfterSeconds,
        lastLibraryRefreshIssue,
      ),
  };
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

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStoredText(
  value: unknown,
  maximumLength = MAX_STORED_SPOTIFY_TEXT_LENGTH,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim();

  return normalized
    ? normalized.slice(
        0,
        maximumLength,
      )
    : null;
}

function readSpotifyIdentifier(
  value: unknown,
): string | null {
  const identifier =
    readStoredText(
      value,
      128,
    );

  return identifier &&
    /^[A-Za-z0-9_-]+$/u.test(
      identifier,
    )
    ? identifier
    : null;
}

function canonicalSpotifyUri(
  kind:
    | "album"
    | "artist"
    | "playlist"
    | "track",
  identifier: string,
): string {
  return `spotify:${kind}:${identifier}`;
}

function projectSpotifyArtist(
  value: unknown,
): SpotifyArtist | null {
  const candidate =
    asRecord(value);
  const id =
    readSpotifyIdentifier(
      candidate?.id,
    );
  const name =
    readStoredText(
      candidate?.name,
    );

  if (!id || !name) {
    return null;
  }

  const genres = Array.isArray(
    candidate?.genres,
  )
    ? Array.from(
        new Set(
          candidate.genres
            .map((genre) =>
              readStoredText(
                genre,
                100,
              ),
            )
            .filter(
              (genre): genre is string =>
                Boolean(genre),
            ),
        ),
      ).slice(
        0,
        MAX_STORED_SPOTIFY_GENRE_COUNT,
      )
    : [];

  return {
    id,
    name,
    uri:
      canonicalSpotifyUri(
        "artist",
        id,
      ),
    ...(genres.length > 0
      ? { genres }
      : {}),
  };
}

function projectSpotifyArtists(
  values: readonly unknown[],
): SpotifyArtist[] {
  const artistsById =
    new Map<
      string,
      SpotifyArtist
    >();

  for (const value of values) {
    const artist =
      projectSpotifyArtist(value);

    if (
      artist &&
      !artistsById.has(artist.id)
    ) {
      artistsById.set(
        artist.id,
        artist,
      );
    }
  }

  return Array.from(
    artistsById.values(),
  );
}

function projectSpotifyTrack(
  value: unknown,
): SpotifyTrack | null {
  const candidate =
    asRecord(value);
  const id =
    readSpotifyIdentifier(
      candidate?.id,
    );
  const name =
    readStoredText(
      candidate?.name,
    );
  const artists =
    projectSpotifyArtists(
      Array.isArray(candidate?.artists)
        ? candidate.artists
        : [],
    );

  if (
    !id ||
    !name
  ) {
    return null;
  }

  const albumCandidate =
    asRecord(candidate?.album);
  const albumId =
    readSpotifyIdentifier(
      albumCandidate?.id,
    );
  const albumName =
    readStoredText(
      albumCandidate?.name,
    );
  const duration =
    candidate?.duration_ms;

  return {
    id,
    name,
    uri:
      canonicalSpotifyUri(
        "track",
        id,
      ),
    ...(typeof duration === "number" &&
    Number.isSafeInteger(duration) &&
    duration > 0
      ? {
          duration_ms: duration,
        }
      : {}),
    ...(typeof candidate?.explicit === "boolean"
      ? {
          explicit: candidate.explicit,
        }
      : {}),
    artists,
    ...(albumId && albumName
      ? {
          album: {
            id: albumId,
            name: albumName,
            uri:
              canonicalSpotifyUri(
                "album",
                albumId,
              ),
          },
        }
      : {}),
  };
}

function deduplicateTracks(
  tracks: readonly unknown[],
): SpotifyTrack[] {
  const tracksById =
    new Map<
      string,
      SpotifyTrack
    >();

  for (const value of tracks) {
    const track =
      projectSpotifyTrack(value);

    if (
      track &&
      !tracksById.has(track.id)
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

function projectSpotifyPlaylist(
  value: unknown,
): SpotifyPlaylist | null {
  const candidate =
    asRecord(value);
  const id =
    readSpotifyIdentifier(
      candidate?.id,
    );
  const name =
    readStoredText(
      candidate?.name,
    );

  if (!id || !name) {
    return null;
  }

  const ownerCandidate =
    asRecord(candidate?.owner);
  const ownerId =
    readSpotifyIdentifier(
      ownerCandidate?.id,
    );
  const ownerName =
    readStoredText(
      ownerCandidate?.display_name,
    );
  const itemsCandidate =
    asRecord(candidate?.items);
  const tracksCandidate =
    asRecord(candidate?.tracks);
  const itemCount =
    itemsCandidate?.total;
  const trackCount =
    tracksCandidate?.total;

  return {
    id,
    name,
    uri:
      canonicalSpotifyUri(
        "playlist",
        id,
      ),
    ...(typeof candidate?.public === "boolean"
      ? {
          public: candidate.public,
        }
      : {}),
    ...(typeof candidate?.collaborative === "boolean"
      ? {
          collaborative:
            candidate.collaborative,
        }
      : {}),
    ...(ownerId
      ? {
          owner: {
            id: ownerId,
            ...(ownerName
              ? {
                  display_name:
                    ownerName,
                }
              : {}),
            uri:
              canonicalSpotifyUri(
                "artist",
                ownerId,
              ),
          },
        }
      : {}),
    ...(typeof itemCount === "number" &&
    Number.isSafeInteger(itemCount) &&
    itemCount >= 0
      ? {
          items: {
            total: itemCount,
          },
        }
      : {}),
    ...(typeof trackCount === "number" &&
    Number.isSafeInteger(trackCount) &&
    trackCount >= 0
      ? {
          tracks: {
            total: trackCount,
          },
        }
      : {}),
  };
}

function deduplicatePlaylists(
  playlists: readonly unknown[],
): SpotifyPlaylist[] {
  const playlistsById =
    new Map<
      string,
      SpotifyPlaylist
    >();

  for (const value of playlists) {
    const playlist =
      projectSpotifyPlaylist(value);

    if (
      playlist &&
      !playlistsById.has(playlist.id)
    ) {
      playlistsById.set(
        playlist.id,
        playlist,
      );
    }
  }

  return Array.from(
    playlistsById.values(),
  );
}

function projectSpotifyProfile(
  value: unknown,
): SpotifyProfile | null {
  const candidate =
    asRecord(value);
  const id =
    readSpotifyIdentifier(
      candidate?.id,
    );

  if (!id) {
    return null;
  }

  return {
    id,
    display_name:
      readStoredText(
        candidate?.display_name,
      ),
  };
}

function createImportSourceStatus(): SpotifyLibraryImportSourceStatus {
  return {
    state: "pending",
    importedCount: 0,
  };
}

function createImportStatus(
  resumed = false,
): SpotifyLibraryImportStatus {
  return {
    state: "incomplete",
    resumed,
    savedTracks:
      createImportSourceStatus(),
    playlists:
      createImportSourceStatus(),
    playlistTracks:
      createImportSourceStatus(),
    skippedPlaylists: [],
  };
}

function normalizeImportSourceStatus(
  value: unknown,
): SpotifyLibraryImportSourceStatus | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<SpotifyLibraryImportSourceStatus>;
  const state =
    candidate.state;
  const importedCount =
    candidate.importedCount;
  const message =
    candidate.message === undefined
      ? undefined
      : readStoredText(
          candidate.message,
        );

  if (
    ![
      "pending",
      "importing",
      "complete",
      "partial",
      "failed",
    ].includes(
      state ?? "",
    ) ||
    !Number.isSafeInteger(
      importedCount,
    ) ||
    importedCount === undefined ||
    importedCount < 0 ||
    (
      candidate.totalCount !== undefined &&
      (!Number.isSafeInteger(candidate.totalCount) ||
        candidate.totalCount < 0)
    ) ||
    (
      candidate.message !== undefined &&
      !message
    )
  ) {
    return null;
  }

  return {
    state: state as SpotifyLibraryImportSourceStatus["state"],
    importedCount,
    ...(candidate.totalCount !== undefined
      ? {
          totalCount:
            candidate.totalCount,
        }
      : {}),
    ...(message
      ? {
          message,
        }
      : {}),
  };
}

function normalizeImportStatus(
  value: unknown,
): SpotifyLibraryImportStatus | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<SpotifyLibraryImportStatus>;

  const savedTracks =
    normalizeImportSourceStatus(
      candidate.savedTracks,
    );
  const playlists =
    normalizeImportSourceStatus(
      candidate.playlists,
    );
  const playlistTracks =
    normalizeImportSourceStatus(
      candidate.playlistTracks,
    );

  if (
    (candidate.state !== "complete" &&
      candidate.state !== "incomplete") ||
    typeof candidate.resumed !== "boolean" ||
    !savedTracks ||
    !playlists ||
    !playlistTracks ||
    !Array.isArray(candidate.skippedPlaylists)
  ) {
    return null;
  }

  const skippedPlaylists =
    candidate.skippedPlaylists.map(
      (item): SpotifySkippedPlaylist | null => {
        const skipped =
          asRecord(item);
        const playlistId =
          readSpotifyIdentifier(
            skipped?.playlistId,
          );
        const name =
          readStoredText(
            skipped?.name,
          );
        const reason =
          skipped?.reason;

        return playlistId &&
          name &&
          (
            reason === "followed-playlist" ||
            reason === "inaccessible"
          )
          ? {
              playlistId,
              name,
              reason,
            }
          : null;
      },
    );

  if (
    skippedPlaylists.some(
      (playlist) =>
        playlist === null,
    )
  ) {
    return null;
  }

  return {
    state: candidate.state,
    resumed: candidate.resumed,
    savedTracks,
    playlists,
    playlistTracks,
    skippedPlaylists:
      skippedPlaylists as SpotifySkippedPlaylist[],
  };
}

function safeImportMessage(
  error: unknown,
): string {
  if (
    error instanceof SpotifyApiError &&
    error.status === 429
  ) {
    return "Spotify asked Canal to pause this import. Resume after the retry window.";
  }

  if (
    error instanceof SpotifyApiError &&
    error.status === 403
  ) {
    return "Spotify did not allow Canal to read this playlist.";
  }

  return "Canal could not finish this source. Your completed progress is ready to resume.";
}

function retryAfterUntilForError(
  error: unknown,
): number | undefined {
  if (
    !(
      error instanceof SpotifyApiError &&
      error.status === 429 &&
      typeof error.retryAfterSeconds === "number" &&
      Number.isFinite(
        error.retryAfterSeconds,
      ) &&
      error.retryAfterSeconds > 0
    )
  ) {
    return undefined;
  }

  const retryAfterUntil =
    Date.now() +
    Math.ceil(
      error.retryAfterSeconds * 1000,
    );

  return Number.isSafeInteger(
    retryAfterUntil,
  )
    ? retryAfterUntil
    : undefined;
}

function throwIfImportRetryWindowActive(
  checkpoint: SpotifyLibraryImportCheckpoint,
): void {
  if (
    checkpoint.retryAfterUntil === undefined
  ) {
    return;
  }

  const retryAfterSeconds =
    Math.max(
      0,
      Math.ceil(
        (
          checkpoint.retryAfterUntil -
          Date.now()
        ) /
          1000,
      ),
    );

  if (retryAfterSeconds === 0) {
    delete checkpoint.retryAfterUntil;

    return;
  }

  throw new SpotifyLibraryImportIncompleteError(
    checkpoint.status,
    new SpotifyApiError(
      "Spotify asked Canal to pause this import.",
      429,
      retryAfterSeconds,
    ),
  );
}

function isPlaylistItemAccessAllowed(
  playlist: SpotifyPlaylist,
  profileId: string,
): boolean {
  return (
    playlist.owner?.id === profileId ||
    playlist.collaborative === true
  );
}

function importStatusIsComplete(
  status: SpotifyLibraryImportStatus,
): boolean {
  return (
    status.savedTracks.state === "complete" &&
    status.playlists.state === "complete" &&
    status.playlistTracks.state === "complete"
  );
}

function checkpointStorageKey(
  cacheScope: SpotifyCacheScope,
): string {
  return [
    SPOTIFY_LIBRARY_IMPORT_CHECKPOINT_STORAGE_KEY,
    encodeURIComponent(
      cacheScope.ownerId,
    ),
    encodeURIComponent(
      cacheScope.sessionGeneration,
    ),
    encodeURIComponent(
      cacheScope.spotifyProfileId,
    ),
    cacheScope.spotifyAccountGeneration,
  ].join(":");
}

function createImportCheckpoint(
  cacheScope: SpotifyCacheScope,
): SpotifyLibraryImportCheckpoint {
  return {
    version:
      SPOTIFY_LIBRARY_IMPORT_CHECKPOINT_VERSION,
    ownerId: cacheScope.ownerId,
    sessionGeneration:
      cacheScope.sessionGeneration,
    spotifyAccountGeneration:
      cacheScope.spotifyAccountGeneration,
    profileId:
      cacheScope.spotifyProfileId,
    createdAt:
      new Date().toISOString(),
    savedTrackOffset: 0,
    playlistOffset: 0,
    savedTracks: [],
    playlists: [],
    playlistTracks: [],
    playlistTrackOffsets: {},
    completedPlaylistIds: [],
    status:
      createImportStatus(),
  };
}

function checkpointMatchesScope(
  checkpoint: SpotifyLibraryImportCheckpoint,
  cacheScope: SpotifyCacheScope,
): boolean {
  return (
    checkpoint.ownerId ===
      cacheScope.ownerId &&
    checkpoint.sessionGeneration ===
      cacheScope.sessionGeneration &&
    checkpoint.spotifyAccountGeneration ===
      cacheScope.spotifyAccountGeneration &&
    checkpoint.profileId ===
      cacheScope.spotifyProfileId
  );
}

function normalizeImportCheckpoint(
  value: unknown,
): SpotifyLibraryImportCheckpoint | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<SpotifyLibraryImportCheckpoint>;
  const status =
    normalizeImportStatus(
      candidate.status,
    );

  if (
    candidate.version !==
      SPOTIFY_LIBRARY_IMPORT_CHECKPOINT_VERSION ||
    typeof candidate.ownerId !== "string" ||
    !candidate.ownerId ||
    typeof candidate.sessionGeneration !== "string" ||
    !candidate.sessionGeneration ||
    typeof candidate.profileId !== "string" ||
    !candidate.profileId ||
    !Number.isSafeInteger(candidate.spotifyAccountGeneration) ||
    !Number.isSafeInteger(candidate.savedTrackOffset) ||
    !Number.isSafeInteger(candidate.playlistOffset) ||
    candidate.savedTrackOffset === undefined ||
    candidate.playlistOffset === undefined ||
    candidate.savedTrackOffset < 0 ||
    candidate.playlistOffset < 0 ||
    !Array.isArray(candidate.savedTracks) ||
    !Array.isArray(candidate.playlists) ||
    !Array.isArray(candidate.playlistTracks) ||
    !Array.isArray(candidate.completedPlaylistIds) ||
    !candidate.playlistTrackOffsets ||
    typeof candidate.playlistTrackOffsets !== "object" ||
    typeof candidate.createdAt !== "string" ||
    (
      candidate.retryAfterUntil !== undefined &&
      (!Number.isSafeInteger(
        candidate.retryAfterUntil,
      ) ||
        candidate.retryAfterUntil < 0)
    ) ||
    !status
  ) {
    return null;
  }

  const playlistTrackOffsets =
    Object.entries(
      candidate.playlistTrackOffsets,
    ).reduce<
      Record<string, number>
    >(
      (result, [playlistId, offset]) => {
        if (
          Number.isSafeInteger(offset) &&
          offset >= 0
        ) {
          result[playlistId] = offset;
        }

        return result;
      },
      {},
    );

  if (
    Object.keys(playlistTrackOffsets).length !==
    Object.keys(candidate.playlistTrackOffsets).length
  ) {
    return null;
  }

  return {
    version:
      SPOTIFY_LIBRARY_IMPORT_CHECKPOINT_VERSION,
    ownerId: candidate.ownerId,
    sessionGeneration:
      candidate.sessionGeneration,
    spotifyAccountGeneration:
      candidate.spotifyAccountGeneration!,
    profileId: candidate.profileId,
    createdAt: candidate.createdAt,
    savedTrackOffset:
      candidate.savedTrackOffset,
    playlistOffset:
      candidate.playlistOffset,
    savedTracks:
      deduplicateTracks(
        candidate.savedTracks,
      ),
    playlists:
      deduplicatePlaylists(
        candidate.playlists,
      ),
    playlistTracks:
      deduplicateTracks(
        candidate.playlistTracks,
      ),
    playlistTrackOffsets,
    completedPlaylistIds:
      Array.from(
        new Set(
          candidate.completedPlaylistIds.filter(
            (
              playlistId,
            ): playlistId is string =>
              Boolean(
                readSpotifyIdentifier(
                  playlistId,
                ),
              ),
          ),
        ),
      ),
    ...(candidate.retryAfterUntil !== undefined
      ? {
          retryAfterUntil:
            candidate.retryAfterUntil,
        }
      : {}),
    status,
  };
}

async function assertLibraryImportCurrent(
  connectionGuard: SpotifyConnectionGuard,
  cacheScope: SpotifyCacheScope,
  options: SpotifyLibraryOperationOptions,
): Promise<void> {
  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed while Canal was importing your library. Resume with the current account.",
    );
  }

  await assertSpotifyConnectionGuardCurrent(
    connectionGuard,
  );

  await assertSpotifyCacheScopeCurrent(
    cacheScope,
  );

  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed while Canal was importing your library. Resume with the current account.",
    );
  }
}

function publishLibraryImportProgress(
  checkpoint: SpotifyLibraryImportCheckpoint,
  phase: SpotifyLibraryImportProgress["phase"],
  options: SpotifyLibraryOperationOptions,
): void {
  options.onProgress?.({
    phase,
    // Callers must receive a new value for each checkpoint so React
    // can render every meaningful page/source transition rather than bailing
    // out on a reused status reference.
    status: {
      ...checkpoint.status,
      savedTracks: {
        ...checkpoint.status.savedTracks,
      },
      playlists: {
        ...checkpoint.status.playlists,
      },
      playlistTracks: {
        ...checkpoint.status.playlistTracks,
      },
      skippedPlaylists: [
        ...checkpoint.status.skippedPlaylists,
      ],
    },
  });
}

async function writeSpotifyLibraryImportCheckpoint(
  checkpoint: SpotifyLibraryImportCheckpoint,
  connectionGuard: SpotifyConnectionGuard,
  cacheScope: SpotifyCacheScope,
  options: SpotifyLibraryOperationOptions,
): Promise<void> {
  await runLibraryCacheOperation(
    async () => {
      await assertLibraryImportCurrent(
        connectionGuard,
        cacheScope,
        options,
      );

      const key =
        checkpointStorageKey(
          cacheScope,
        );
      const serialized =
        JSON.stringify(
          checkpoint,
        );
      const previousValue =
        await AsyncStorage.getItem(key);

      await assertLibraryImportCurrent(
        connectionGuard,
        cacheScope,
        options,
      );

      await AsyncStorage.setItem(
        key,
        serialized,
      );

      try {
        await assertLibraryImportCurrent(
          connectionGuard,
          cacheScope,
          options,
        );
      } catch (error) {
        const currentValue =
          await AsyncStorage.getItem(key);

        if (
          currentValue === serialized
        ) {
          if (previousValue === null) {
            await AsyncStorage.removeItem(key);
          } else {
            await AsyncStorage.setItem(
              key,
              previousValue,
            );
          }
        }

        throw error;
      }
    },
  );
}

async function loadSpotifyLibraryImportCheckpoint(
  connectionGuard: SpotifyConnectionGuard,
  cacheScope: SpotifyCacheScope,
  options: SpotifyLibraryOperationOptions,
): Promise<SpotifyLibraryImportCheckpoint | null> {
  return runLibraryCacheOperation(
    async () => {
      await assertLibraryImportCurrent(
        connectionGuard,
        cacheScope,
        options,
      );

      const serialized =
        await AsyncStorage.getItem(
          checkpointStorageKey(
            cacheScope,
          ),
        );

      await assertLibraryImportCurrent(
        connectionGuard,
        cacheScope,
        options,
      );

      if (!serialized) {
        return null;
      }

      try {
        const checkpoint =
          normalizeImportCheckpoint(
            JSON.parse(serialized),
          );

        return checkpoint &&
          checkpointMatchesScope(
            checkpoint,
            cacheScope,
          )
          ? checkpoint
          : null;
      } catch {
        return null;
      }
    },
  );
}

async function removeSpotifyLibraryImportCheckpoint(
  connectionGuard: SpotifyConnectionGuard,
  cacheScope: SpotifyCacheScope,
  options: SpotifyLibraryOperationOptions,
): Promise<void> {
  await runLibraryCacheOperation(
    async () => {
      await assertLibraryImportCurrent(
        connectionGuard,
        cacheScope,
        options,
      );

      await AsyncStorage.removeItem(
        checkpointStorageKey(
          cacheScope,
        ),
      );

      await assertLibraryImportCurrent(
        connectionGuard,
        cacheScope,
        options,
      );
    },
  );
}

export async function readSpotifyLibraryImportStatus(): Promise<
  SpotifyLibraryImportStatus | null
> {
  const {
    connectionGuard,
  } =
    await requireGuardedSpotifyLibrarySession();
  const cacheScope =
    await captureSpotifyCacheScope();

  const checkpoint =
    await loadSpotifyLibraryImportCheckpoint(
      connectionGuard,
      cacheScope,
      {},
    );

  return checkpoint?.status ??
    null;
}

async function writeSpotifyLibrarySnapshot(
  snapshot: SpotifyLibrarySnapshot,
  options: {
    expectedConnectionGeneration?: number;
    connectionGuard?:
      SpotifyConnectionGuard;
    operationCommitGuard?:
      () => boolean;
  } = {},
): Promise<void> {
  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed while Canal was syncing. Sync the current account again.",
    );
  }

  const guardedSession =
    await readGuardedSpotifySession();
  const persistedSnapshot =
    normalizeSpotifyLibrarySnapshot(
      snapshot,
    );

  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed while Canal was syncing. Sync the current account again.",
    );
  }

  const connectionGuard =
    options.connectionGuard ??
    guardedSession?.connectionGuard;

  const ownershipChanged =
    !guardedSession ||
    !persistedSnapshot ||
    !connectionGuard ||
    guardedSession.session.profile.id !==
      persistedSnapshot.profile.id ||
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
          snapshot:
            persistedSnapshot,
        } satisfies PersistedSpotifyLibraryEnvelope
      : persistedSnapshot;

  const serialized =
    JSON.stringify(
      storedValue,
    );

  const previousValue =
    await AsyncStorage.getItem(
      SPOTIFY_LIBRARY_STORAGE_KEY,
    );

  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed while Canal was syncing. Sync the current account again.",
    );
  }

  await AsyncStorage.setItem(
    SPOTIFY_LIBRARY_STORAGE_KEY,
    serialized,
  );

  try {
    if (
      options.operationCommitGuard &&
      !options.operationCommitGuard()
    ) {
      throw new Error(
        "Spotify connection changed while Canal was syncing. Sync the current account again.",
      );
    }

    await assertSpotifyConnectionGuardCurrent(
      connectionGuard,
    );

    if (
      options.operationCommitGuard &&
      !options.operationCommitGuard()
    ) {
      throw new Error(
        "Spotify connection changed while Canal was syncing. Sync the current account again.",
      );
    }
  } catch (error) {
    const currentValue =
      await AsyncStorage.getItem(
        SPOTIFY_LIBRARY_STORAGE_KEY,
      );

    if (
      currentValue ===
        serialized
    ) {
      if (previousValue === null) {
        await AsyncStorage.removeItem(
          SPOTIFY_LIBRARY_STORAGE_KEY,
        );
      } else {
        await AsyncStorage.setItem(
          SPOTIFY_LIBRARY_STORAGE_KEY,
          previousValue,
        );
      }
    }

    throw error;
  }
}

export async function saveSpotifyLibrarySnapshot(
  snapshot: SpotifyLibrarySnapshot,
  options: {
    expectedConnectionGeneration?: number;
    connectionGuard?:
      SpotifyConnectionGuard;
    operationCommitGuard?:
      () => boolean;
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

function projectTopGenres(
  value: unknown,
): SpotifyGenreSignal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((genre): SpotifyGenreSignal | null => {
      const candidate =
        asRecord(genre);
      const name =
        readStoredText(
          candidate?.name,
          100,
        );
      const count =
        candidate?.count;

      return name &&
        typeof count === "number" &&
        Number.isSafeInteger(count) &&
        count >= 0
        ? {
            name,
            count,
          }
        : null;
    })
    .filter(
      (genre): genre is SpotifyGenreSignal =>
        genre !== null,
    )
    .slice(0, 12);
}

function projectTrackGenres(
  value: unknown,
): Record<string, string[]> {
  const candidate =
    asRecord(value);

  if (!candidate) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(candidate)
      .flatMap(
        ([trackId, genres]) => {
          const id =
            readSpotifyIdentifier(trackId);

          if (!id || !Array.isArray(genres)) {
            return [];
          }

          const safeGenres =
            Array.from(
              new Set(
                genres
                  .map((genre) =>
                    readStoredText(
                      genre,
                      100,
                    ),
                  )
                  .filter(
                    (genre): genre is string =>
                      Boolean(genre),
                  ),
              ),
            ).slice(
              0,
              MAX_STORED_SPOTIFY_GENRE_COUNT,
            );

          return safeGenres.length > 0
            ? [[id, safeGenres] as const]
            : [];
        },
      ),
  );
}

function normalizeSpotifyLibrarySnapshot(
  value: unknown,
): SpotifyLibrarySnapshot | null {
  const parsed =
    asRecord(value);
  const profile =
    projectSpotifyProfile(
      parsed?.profile,
    );
  const syncedAt =
    readStoredText(
      parsed?.syncedAt,
      64,
    );

  if (!profile || !syncedAt) {
    return null;
  }

  return {
    syncedAt,
    profile,
    topArtists:
      projectSpotifyArtists(
        Array.isArray(parsed?.topArtists)
          ? parsed.topArtists
          : [],
      ),
    topTracks:
      deduplicateTracks(
        Array.isArray(parsed?.topTracks)
          ? parsed.topTracks
          : [],
      ),
    recentTracks:
      deduplicateTracks(
        Array.isArray(parsed?.recentTracks)
          ? parsed.recentTracks
          : [],
      ),
    savedTracks:
      deduplicateTracks(
        Array.isArray(parsed?.savedTracks)
          ? parsed.savedTracks
          : [],
      ),
    playlistTracks:
      deduplicateTracks(
        Array.isArray(parsed?.playlistTracks)
          ? parsed.playlistTracks
          : [],
      ),
    discoveryTracks:
      deduplicateTracks(
        Array.isArray(parsed?.discoveryTracks)
          ? parsed.discoveryTracks
          : [],
      ),
    playlists:
      deduplicatePlaylists(
        Array.isArray(parsed?.playlists)
          ? parsed.playlists
          : [],
      ),
    topGenres:
      projectTopGenres(
        parsed?.topGenres,
      ),
    trackGenres:
      projectTrackGenres(
        parsed?.trackGenres,
      ),
    warnings:
      Array.isArray(parsed?.warnings)
        ? parsed.warnings
            .map((warning) =>
              readStoredText(
                warning,
              ),
            )
            .filter(
              (warning): warning is string =>
                Boolean(warning),
            )
        : [],
    importStatus:
      normalizeImportStatus(
        parsed?.importStatus,
      ) ??
      // Older snapshots were produced by the bounded taste sync. They remain
      // readable offline, but must never be presented as a completed
      // full-library import or suppress the next guarded import.
      createImportStatus(),
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
  const startingConnectionGeneration =
    getSpotifyConnectionGeneration();

  resetLibraryRefreshIssueForGeneration(
    startingConnectionGeneration,
  );

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

    rememberLibraryRefreshIssue(
      issue,
      getSpotifyConnectionGeneration(),
    );

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

  resetLibraryRefreshIssueForGeneration(
    connectionGuard.connectionGeneration,
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
    cached.importStatus &&
    importStatusIsComplete(
      cached.importStatus,
    ) &&
    await isSpotifyConnectionStillCurrent(
      connectionGuard,
    )
  ) {
    return {
      snapshot: cached,
      refreshed: false,
    };
  }

  const activeCooldown =
    readLibraryRefreshCooldown(
      connectionGuard.connectionGeneration,
    );

  if (
    activeCooldown &&
    await isSpotifyConnectionStillCurrent(
      connectionGuard,
    )
  ) {
    return {
      snapshot:
        cached,
      refreshed:
        false,
      warning:
        cached
          ? "Using the last Spotify sync while Canal respects Spotify’s retry window."
          : activeCooldown
              .issue.message,
      issue:
        activeCooldown.issue,
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

    clearLibraryRefreshIssue();

    return {
      snapshot:
        refreshedSnapshot,
      refreshed: true,
    };
  } catch (error) {
    const issue =
      classifyRecoveryIssue(
        error,
        {
          service:
            "spotify",
        },
      );

    if (
      getSpotifyConnectionGeneration() ===
      connectionGuard.connectionGeneration
    ) {
      rememberLibraryRefreshIssue(
        issue,
        connectionGuard.connectionGeneration,
      );
    }

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

export async function syncSpotifyLibrary(
  options:
    SpotifyLibraryOperationOptions = {},
): Promise<
  SpotifyLibrarySnapshot
> {
  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed while Canal was syncing. Sync the current account again.",
    );
  }

  const connectionGeneration =
    getSpotifyConnectionGeneration();

  const activeCooldown =
    readLibraryRefreshCooldown(
      connectionGeneration,
    );

  if (activeCooldown) {
    throw activeCooldown.error;
  }

  if (
    !options.operationCommitGuard &&
    libraryRefreshPromise &&
    libraryRefreshGeneration ===
      connectionGeneration
  ) {
    return libraryRefreshPromise;
  }

  const nextPromise =
    performSpotifyLibraryFullSync(
      connectionGeneration,
      options,
    )
      .catch(
        (error: unknown) => {
          if (
            options.operationCommitGuard &&
            !options.operationCommitGuard()
          ) {
            throw error;
          }

          const issue =
            classifyRecoveryIssue(
              error,
              {
                service:
                  "spotify",
              },
            );

          if (
            issue.kind ===
              "rate-limited" &&
            getSpotifyConnectionGeneration() ===
              connectionGeneration
          ) {
            rememberLibraryRefreshIssue(
              issue,
              connectionGeneration,
            );
          }

          throw error;
        },
      )
      .finally(() => {
        if (
          libraryRefreshPromise ===
          nextPromise
        ) {
          libraryRefreshPromise =
            null;

          libraryRefreshGeneration =
            null;
        }
      });

  if (
    !options.operationCommitGuard
  ) {
    libraryRefreshPromise =
      nextPromise;

    libraryRefreshGeneration =
      connectionGeneration;
  }

  return nextPromise;
}

async function checkpointImportProgress(
  checkpoint: SpotifyLibraryImportCheckpoint,
  phase: SpotifyLibraryImportProgress["phase"],
  connectionGuard: SpotifyConnectionGuard,
  cacheScope: SpotifyCacheScope,
  options: SpotifyLibraryOperationOptions,
): Promise<void> {
  checkpoint.status.state = "incomplete";

  await writeSpotifyLibraryImportCheckpoint(
    checkpoint,
    connectionGuard,
    cacheScope,
    options,
  );

  publishLibraryImportProgress(
    checkpoint,
    phase,
    options,
  );
}

async function markImportSourceFailed(
  checkpoint: SpotifyLibraryImportCheckpoint,
  source:
    | "savedTracks"
    | "playlists"
    | "playlistTracks",
  phase: SpotifyLibraryImportProgress["phase"],
  error: unknown,
  connectionGuard: SpotifyConnectionGuard,
  cacheScope: SpotifyCacheScope,
  options: SpotifyLibraryOperationOptions,
): Promise<never> {
  const retryAfterUntil =
    retryAfterUntilForError(error);

  if (retryAfterUntil !== undefined) {
    checkpoint.retryAfterUntil =
      retryAfterUntil;
  } else {
    delete checkpoint.retryAfterUntil;
  }

  checkpoint.status[source] = {
    ...checkpoint.status[source],
    state:
      error instanceof SpotifyApiError &&
      error.status === 429
        ? "partial"
        : "failed",
    message:
      safeImportMessage(error),
  };

  await checkpointImportProgress(
    checkpoint,
    phase,
    connectionGuard,
    cacheScope,
    options,
  );

  throw new SpotifyLibraryImportIncompleteError(
    checkpoint.status,
    error,
  );
}

async function runWithBoundedConcurrency<Item>(
  items: Item[],
  concurrency: number,
  worker: (
    item: Item,
  ) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  let firstFailure: unknown =
    null;

  const takeNext =
    async (): Promise<void> => {
      while (
        firstFailure === null &&
        nextIndex < items.length
      ) {
        const index = nextIndex;
        nextIndex += 1;

        try {
          await worker(items[index]);
        } catch (error) {
          firstFailure = error;
          throw error;
        }
      }
    };

  await Promise.allSettled(
    Array.from(
      {
        length: Math.min(
          concurrency,
          items.length,
        ),
      },
      takeNext,
    ),
  );

  if (firstFailure !== null) {
    throw firstFailure;
  }
}

async function performSpotifyLibraryFullSync(
  expectedConnectionGeneration: number,
  options: SpotifyLibraryOperationOptions = {},
): Promise<SpotifyLibrarySnapshot> {
  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed while Canal was importing your library. Resume with the current account.",
    );
  }

  const {
    session: syncSession,
    connectionGuard,
  } =
    await requireGuardedSpotifyLibrarySession();
  const cacheScope =
    await captureSpotifyCacheScope();

  if (
    cacheScope.spotifyProfileId !==
      connectionGuard.profileId ||
    cacheScope.spotifyAccountGeneration !==
      connectionGuard.canalAccountGeneration
  ) {
    throw new Error(
      "Spotify account changed while Canal was importing your library. Resume with the current account.",
    );
  }

  if (
    expectedConnectionGeneration !==
    connectionGuard.connectionGeneration
  ) {
    throw new Error(
      "Spotify account changed while Canal was importing your library. Resume with the current account.",
    );
  }

  await assertLibraryImportCurrent(
    connectionGuard,
    cacheScope,
    options,
  );

  const checkpoint =
    (
      await loadSpotifyLibraryImportCheckpoint(
        connectionGuard,
        cacheScope,
        options,
      )
    ) ??
    createImportCheckpoint(
      cacheScope,
    );

  checkpoint.status.resumed =
    checkpoint.savedTrackOffset > 0 ||
    checkpoint.playlistOffset > 0 ||
    checkpoint.completedPlaylistIds.length > 0;

  throwIfImportRetryWindowActive(
    checkpoint,
  );

  const metadataResults =
    Promise.allSettled([
    getSpotifyTopArtists(
      20,
      {
        connectionGuard,
        operationCommitGuard:
          options.operationCommitGuard,
      },
    ),
    getSpotifyTopTracks(
      20,
      {
        connectionGuard,
        operationCommitGuard:
          options.operationCommitGuard,
      },
    ),
    getSpotifyRecentlyPlayed(
      20,
      {
        connectionGuard,
        operationCommitGuard:
          options.operationCommitGuard,
      },
    ),
    ]);

  await assertLibraryImportCurrent(
    connectionGuard,
    cacheScope,
    options,
  );

  if (
    checkpoint.status.savedTracks.state !==
    "complete"
  ) {
    checkpoint.status.savedTracks = {
      ...checkpoint.status.savedTracks,
      state: "importing",
    };

    await checkpointImportProgress(
      checkpoint,
      "saved-tracks",
      connectionGuard,
      cacheScope,
      options,
    );

    try {
      await getAllSpotifySavedTracks({
        offset:
          checkpoint.savedTrackOffset,
        collectItems: false,
        connectionGuard,
        operationCommitGuard:
          options.operationCommitGuard,
        onPage: async (page) => {
          checkpoint.savedTracks =
            deduplicateTracks([
              ...checkpoint.savedTracks,
              ...page.items.map(
                (item) =>
                  item.track,
              ),
            ]);
          checkpoint.savedTrackOffset =
            page.offset +
            page.items.length;
          checkpoint.status.savedTracks = {
            state:
              page.next
                ? "importing"
                : "complete",
            importedCount:
              checkpoint.savedTracks.length,
            ...(page.total !== undefined
              ? {
                  totalCount:
                    page.total,
                }
              : {}),
          };

          await checkpointImportProgress(
            checkpoint,
            "saved-tracks",
            connectionGuard,
            cacheScope,
            options,
          );
        },
      });

      checkpoint.status.savedTracks = {
        ...checkpoint.status.savedTracks,
        state: "complete",
        importedCount:
          checkpoint.savedTracks.length,
      };
      await checkpointImportProgress(
        checkpoint,
        "saved-tracks",
        connectionGuard,
        cacheScope,
        options,
      );
    } catch (error) {
      await markImportSourceFailed(
        checkpoint,
        "savedTracks",
        "saved-tracks",
        error,
        connectionGuard,
        cacheScope,
        options,
      );
    }
  }

  if (
    checkpoint.status.playlists.state !==
    "complete"
  ) {
    checkpoint.status.playlists = {
      ...checkpoint.status.playlists,
      state: "importing",
    };
    await checkpointImportProgress(
      checkpoint,
      "playlists",
      connectionGuard,
      cacheScope,
      options,
    );

    try {
      await getAllSpotifyPlaylists({
        offset:
          checkpoint.playlistOffset,
        collectItems: false,
        connectionGuard,
        operationCommitGuard:
          options.operationCommitGuard,
        onPage: async (page) => {
          const playlistsById =
            new Map(
              checkpoint.playlists.map(
                (playlist) => [
                  playlist.id,
                  playlist,
                ] as const,
              ),
            );

          for (
            const playlist of page.items
          ) {
            const persistedPlaylist =
              projectSpotifyPlaylist(
                playlist,
              );

            if (persistedPlaylist) {
              playlistsById.set(
                persistedPlaylist.id,
                persistedPlaylist,
              );
            }
          }

          checkpoint.playlists =
            Array.from(
              playlistsById.values(),
            );
          checkpoint.playlistOffset =
            page.offset +
            page.items.length;
          checkpoint.status.playlists = {
            state:
              page.next
                ? "importing"
                : "complete",
            importedCount:
              checkpoint.playlists.length,
            ...(page.total !== undefined
              ? {
                  totalCount:
                    page.total,
                }
              : {}),
          };

          await checkpointImportProgress(
            checkpoint,
            "playlists",
            connectionGuard,
            cacheScope,
            options,
          );
        },
      });

      checkpoint.status.playlists = {
        ...checkpoint.status.playlists,
        state: "complete",
        importedCount:
          checkpoint.playlists.length,
      };
      await checkpointImportProgress(
        checkpoint,
        "playlists",
        connectionGuard,
        cacheScope,
        options,
      );
    } catch (error) {
      await markImportSourceFailed(
        checkpoint,
        "playlists",
        "playlists",
        error,
        connectionGuard,
        cacheScope,
        options,
      );
    }
  }

  if (
    checkpoint.status.playlistTracks.state !==
    "complete"
  ) {
    checkpoint.status.playlistTracks = {
      ...checkpoint.status.playlistTracks,
      state: "importing",
      totalCount:
        checkpoint.playlists.reduce(
          (total, playlist) =>
            total +
            (playlist.items?.total ??
              playlist.tracks?.total ??
              0),
          0,
        ),
    };
    await checkpointImportProgress(
      checkpoint,
      "playlist-items",
      connectionGuard,
      cacheScope,
      options,
    );

    try {
      const remainingPlaylists =
        checkpoint.playlists.filter(
          (playlist) =>
            Boolean(playlist.id) &&
            !checkpoint.completedPlaylistIds.includes(
              playlist.id,
            ),
        );

      await runWithBoundedConcurrency(
        remainingPlaylists,
        PLAYLIST_IMPORT_CONCURRENCY,
        async (playlist) => {
          if (
            !isPlaylistItemAccessAllowed(
              playlist,
              connectionGuard.profileId,
            )
          ) {
            checkpoint.completedPlaylistIds.push(
              playlist.id,
            );
            checkpoint.status.skippedPlaylists.push({
              playlistId: playlist.id,
              name:
                readStoredText(
                  playlist.name,
                ) ??
                "Spotify playlist",
              reason: "followed-playlist",
            });
            checkpoint.status.playlistTracks = {
              ...checkpoint.status.playlistTracks,
              importedCount:
                checkpoint.playlistTracks.length,
            };
            await checkpointImportProgress(
              checkpoint,
              "playlist-items",
              connectionGuard,
              cacheScope,
              options,
            );

            return;
          }

          try {
            await getAllSpotifyPlaylistTracks(
              playlist.id,
              {
                offset:
                  checkpoint.playlistTrackOffsets[
                    playlist.id
                  ] ?? 0,
                collectItems: false,
                connectionGuard,
                operationCommitGuard:
                  options.operationCommitGuard,
                onPage: async (page) => {
                  checkpoint.playlistTracks =
                    deduplicateTracks([
                      ...checkpoint.playlistTracks,
                      ...page.items
                        .map(
                          (item) =>
                            item.track ??
                            item.item ??
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
                        ),
                    ]);
                  checkpoint.playlistTrackOffsets[
                    playlist.id
                  ] =
                    page.offset +
                    page.items.length;
                  checkpoint.status.playlistTracks = {
                    ...checkpoint.status.playlistTracks,
                    state: "importing",
                    importedCount:
                      checkpoint.playlistTracks.length,
                  };
                  await checkpointImportProgress(
                    checkpoint,
                    "playlist-items",
                    connectionGuard,
                    cacheScope,
                    options,
                  );
                },
              },
            );
            checkpoint.completedPlaylistIds.push(
              playlist.id,
            );
            checkpoint.status.playlistTracks = {
              ...checkpoint.status.playlistTracks,
              importedCount:
                checkpoint.playlistTracks.length,
            };
            await checkpointImportProgress(
              checkpoint,
              "playlist-items",
              connectionGuard,
              cacheScope,
              options,
            );
          } catch (error) {
            if (
              error instanceof SpotifyApiError &&
              (
                error.status === 403 ||
                error.status === 404
              )
            ) {
              checkpoint.completedPlaylistIds.push(
                playlist.id,
              );
              checkpoint.status.skippedPlaylists.push({
                playlistId: playlist.id,
                name:
                  readStoredText(
                    playlist.name,
                  ) ??
                  "Spotify playlist",
                reason: "inaccessible",
              });
              await checkpointImportProgress(
                checkpoint,
                "playlist-items",
                connectionGuard,
                cacheScope,
                options,
              );

              return;
            }

            throw error;
          }
        },
      );

      checkpoint.completedPlaylistIds =
        Array.from(
          new Set(
            checkpoint.completedPlaylistIds,
          ),
        );
      checkpoint.status.playlistTracks = {
        ...checkpoint.status.playlistTracks,
        state: "complete",
        importedCount:
          checkpoint.playlistTracks.length,
      };
      await checkpointImportProgress(
        checkpoint,
        "playlist-items",
        connectionGuard,
        cacheScope,
        options,
      );
    } catch (error) {
      await markImportSourceFailed(
        checkpoint,
        "playlistTracks",
        "playlist-items",
        error,
        connectionGuard,
        cacheScope,
        options,
      );
    }
  }

  if (
    !importStatusIsComplete(
      checkpoint.status,
    )
  ) {
    throw new SpotifyLibraryImportIncompleteError(
      checkpoint.status,
      new Error(
        "Spotify import is incomplete.",
      ),
    );
  }

  await assertLibraryImportCurrent(
    connectionGuard,
    cacheScope,
    options,
  );

  const [
    topArtistsResult,
    topTracksResult,
    recentResult,
  ] = await metadataResults;

  const warnings: string[] = [];
  const topArtists =
    topArtistsResult.status === "fulfilled"
      ? projectSpotifyArtists(
          topArtistsResult.value.items,
        )
      : [];
  const topTracks =
    topTracksResult.status === "fulfilled"
      ? deduplicateTracks(
          topTracksResult.value.items,
        )
      : [];
  const recentTracks =
    recentResult.status === "fulfilled"
      ? deduplicateTracks(
          recentResult.value.items.map(
            (item) => item.track,
          ),
        )
      : [];
  const profile =
    projectSpotifyProfile(
      syncSession.profile,
    );

  if (!profile) {
    throw new Error(
      "Spotify returned an invalid profile for this import.",
    );
  }

  if (topArtistsResult.status === "rejected") {
    warnings.push(
      "Top artists could not be refreshed.",
    );
  }

  if (topTracksResult.status === "rejected") {
    warnings.push(
      "Top tracks could not be refreshed.",
    );
  }

  if (recentResult.status === "rejected") {
    warnings.push(
      "Recently played tracks could not be refreshed.",
    );
  }

  if (
    checkpoint.status.skippedPlaylists.length > 0
  ) {
    warnings.push(
      `${checkpoint.status.skippedPlaylists.length} playlist${
        checkpoint.status.skippedPlaylists.length === 1
          ? " was"
          : "s were"
      } skipped because Spotify does not allow Canal to read its items.`,
    );
  }

  const userLibraryTracks =
    deduplicateTracks([
      ...topTracks,
      ...checkpoint.savedTracks,
      ...recentTracks,
      ...checkpoint.playlistTracks,
    ]);
  const artistsById =
    new Map(
      topArtists.map(
        (artist) => [
          artist.id,
          artist,
        ] as const,
      ),
    );
  const trackGenres: Record<string, string[]> = {};

  for (
    const track of userLibraryTracks
  ) {
    trackGenres[track.id] =
      Array.from(
        new Set(
          track.artists.flatMap(
            (artist) =>
              artistsById.get(
                artist.id,
              )?.genres ?? [],
          ),
        ),
      );
  }

  checkpoint.status.state = "complete";
  const snapshot: SpotifyLibrarySnapshot = {
    syncedAt:
      new Date().toISOString(),
    profile,
    topArtists,
    topTracks:
      deduplicateTracks(topTracks),
    recentTracks:
      deduplicateTracks(recentTracks),
    savedTracks:
      checkpoint.savedTracks,
    playlistTracks:
      checkpoint.playlistTracks,
    discoveryTracks: [],
    playlists:
      checkpoint.playlists,
    topGenres:
      buildTopGenres(topArtists),
    trackGenres,
    warnings,
    importStatus:
      checkpoint.status,
  };

  await saveSpotifyLibrarySnapshot(
    snapshot,
    {
      expectedConnectionGeneration,
      connectionGuard,
      operationCommitGuard:
        options.operationCommitGuard,
    },
  );

  await removeSpotifyLibraryImportCheckpoint(
    connectionGuard,
    cacheScope,
    options,
  );
  clearLibraryRefreshIssue();
  publishLibraryImportProgress(
    checkpoint,
    "complete",
    options,
  );

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
