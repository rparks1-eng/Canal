import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Linking,
} from "react-native";

import {
  CanalAppleMusic,
  isCanalAppleMusicAvailable,
} from "../modules/canal-apple-music";

import type {
  CanalAppleMusicLibrary,
  CanalAppleMusicStatus,
  CanalAppleMusicTrack,
} from "../modules/canal-apple-music";

import {
  assertCanalAccountSessionGuardCurrent,
  captureCanalAccountSessionGuard,
} from "./canal-auth";

import type {
  CanalAccountSessionGuard,
} from "./canal-auth";

import type {
  MusicCatalogTrack,
  MusicLibrarySnapshot,
} from "./music-provider-model";

import {
  STORAGE_KEYS,
} from "./storage-keys";

import {
  normalizeAppleMusicConnectionError,
} from "./apple-music-errors";

const APPLE_MUSIC_LIBRARY_VERSION = 1;
const APPLE_MUSIC_LIBRARY_SONG_LIMIT = 5_000;
const APPLE_MUSIC_LIBRARY_PLAYLIST_LIMIT = 1_000;
const APPLE_MUSIC_LIBRARY_ALBUM_LIMIT = 2_000;
const APPLE_MUSIC_LIBRARY_ARTIST_LIMIT = 2_000;
const APPLE_MUSIC_PLAYLIST_SCAN_LIMIT = 200;
const APPLE_MUSIC_ARTWORK_CACHE_LIMIT = 256;

const appleMusicArtworkCache = new Map<string, Promise<string | null>>();

type PersistedAppleMusicLibrary = {
  version: typeof APPLE_MUSIC_LIBRARY_VERSION;
  ownerId: string;
  sessionGeneration: string;
  snapshot: MusicLibrarySnapshot;
};

let appleMusicStorageTail: Promise<void> =
  Promise.resolve();

function runAppleMusicStorageOperation<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const previous =
    appleMusicStorageTail;
  let release = () => {};

  appleMusicStorageTail =
    new Promise<void>((resolve) => {
      release = resolve;
    });

  return previous
    .then(operation)
    .finally(release);
}

export function isAppleMusicNativeAvailable(): boolean {
  return isCanalAppleMusicAvailable();
}

function catalogIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLowerCase();
}

/**
 * Resolves Apple Music artwork without persisting catalog responses. Apple is
 * Canal's primary artwork source, while the bounded in-memory cache prevents
 * repeated catalog requests as the same track appears across app surfaces.
 */
export async function loadAppleMusicCatalogArtwork(
  title: string,
  artist: string,
): Promise<string | null> {
  const cleanTitle = title.trim();
  const cleanArtist = artist.trim();
  if (!cleanTitle || !cleanArtist || !isCanalAppleMusicAvailable()) return null;

  const cacheKey = `${catalogIdentity(cleanTitle)}::${catalogIdentity(cleanArtist)}`;
  let request = appleMusicArtworkCache.get(cacheKey);
  if (!request) {
    request = CanalAppleMusic.searchCatalog(`${cleanTitle} ${cleanArtist}`, 5)
      .then((matches) => {
        const titleKey = catalogIdentity(cleanTitle);
        const artistKey = catalogIdentity(cleanArtist);
        const exact = matches.find((match) =>
          catalogIdentity(match.name) === titleKey &&
          catalogIdentity(match.artistName) === artistKey,
        );
        const titleMatch = exact ?? matches.find((match) =>
          catalogIdentity(match.name) === titleKey,
        );
        const artworkUrl = titleMatch?.artworkUrl?.trim();
        return artworkUrl && /^https:\/\//u.test(artworkUrl) ? artworkUrl : null;
      })
      .catch(() => null);
    appleMusicArtworkCache.set(cacheKey, request);

    if (appleMusicArtworkCache.size > APPLE_MUSIC_ARTWORK_CACHE_LIMIT) {
      const oldestKey = appleMusicArtworkCache.keys().next().value;
      if (typeof oldestKey === "string") appleMusicArtworkCache.delete(oldestKey);
    }
  }
  const artworkUrl = await request;
  if (!artworkUrl && appleMusicArtworkCache.get(cacheKey) === request) {
    appleMusicArtworkCache.delete(cacheKey);
  }
  return artworkUrl;
}

export async function readAppleMusicStatus(): Promise<CanalAppleMusicStatus> {
  if (!isCanalAppleMusicAvailable()) {
    return {
      authorizationStatus: "unavailable",
      canPlayCatalogContent: false,
      hasCloudLibraryEnabled: false,
    };
  }

  try {
    return await CanalAppleMusic.getStatus();
  } catch (error) {
    throw normalizeAppleMusicConnectionError(error);
  }
}

export async function openAppleMusicAccountSetup(): Promise<void> {
  try {
    await Linking.openURL("music://");
  } catch {
    await Linking.openURL("https://music.apple.com/");
  }
}

export async function connectAppleMusic(): Promise<MusicLibrarySnapshot> {
  try {
    appleMusicArtworkCache.clear();
    const guard =
      await captureCanalAccountSessionGuard();
    const status =
      await CanalAppleMusic.requestAuthorization();

    await assertCanalAccountSessionGuardCurrent(guard);

    if (status.authorizationStatus !== "authorized") {
      throw new Error(
        status.authorizationStatus === "denied"
          ? "Apple Music access is off. Enable Media & Apple Music for Canal in iPhone Settings."
          : "Apple Music authorization was not completed.",
      );
    }

    return await syncAppleMusicLibraryForGuard(guard);
  } catch (error) {
    throw normalizeAppleMusicConnectionError(error);
  }
}

export async function syncAppleMusicLibrary(): Promise<MusicLibrarySnapshot> {
  try {
    appleMusicArtworkCache.clear();
    const guard =
      await captureCanalAccountSessionGuard();
    const status =
      await CanalAppleMusic.getStatus();

    await assertCanalAccountSessionGuardCurrent(guard);

    if (status.authorizationStatus !== "authorized") {
      throw new Error(
        "Connect Apple Music before syncing its library.",
      );
    }

    return await syncAppleMusicLibraryForGuard(guard);
  } catch (error) {
    throw normalizeAppleMusicConnectionError(error);
  }
}

async function syncAppleMusicLibraryForGuard(
  guard: CanalAccountSessionGuard,
): Promise<MusicLibrarySnapshot> {
  const library =
    await CanalAppleMusic.readLibrary(
      APPLE_MUSIC_LIBRARY_SONG_LIMIT,
      APPLE_MUSIC_LIBRARY_PLAYLIST_LIMIT,
    );

  await assertCanalAccountSessionGuardCurrent(guard);

  const snapshot =
    normalizeAppleMusicLibrary(library, guard.userId);

  await persistAppleMusicLibrary(guard, snapshot);

  return snapshot;
}

export async function readAppleMusicLibrarySnapshot(): Promise<MusicLibrarySnapshot | null> {
  return runAppleMusicStorageOperation(async () => {
    const guard =
      await captureCanalAccountSessionGuard();
    const serialized =
      await AsyncStorage.getItem(
        STORAGE_KEYS.appleMusicLibrarySnapshot,
      );

    if (!serialized) {
      return null;
    }

    try {
      const parsed =
        JSON.parse(serialized) as Partial<PersistedAppleMusicLibrary>;

      if (
        parsed.version !== APPLE_MUSIC_LIBRARY_VERSION ||
        parsed.ownerId !== guard.userId ||
        parsed.sessionGeneration !== guard.sessionGeneration ||
        !parsed.snapshot ||
        parsed.snapshot.providerId !== "apple-music"
      ) {
        await AsyncStorage.removeItem(
          STORAGE_KEYS.appleMusicLibrarySnapshot,
        );
        return null;
      }

      await assertCanalAccountSessionGuardCurrent(guard);
      return parsed.snapshot;
    } catch {
      await AsyncStorage.removeItem(
        STORAGE_KEYS.appleMusicLibrarySnapshot,
      );
      return null;
    }
  });
}

export async function disconnectAppleMusic(): Promise<void> {
  appleMusicArtworkCache.clear();
  const guard =
    await captureCanalAccountSessionGuard();

  return clearAppleMusicCacheForAccountGuard(guard);
}

export async function clearAppleMusicCacheForAccountGuard(
  guard: CanalAccountSessionGuard,
  options: {
    assertCurrent?: () => Promise<void>;
  } = {},
): Promise<void> {
  const assertCurrent =
    options.assertCurrent ??
    (() => assertCanalAccountSessionGuardCurrent(guard));

  await runAppleMusicStorageOperation(async () => {
    await assertCurrent();
    const key =
      STORAGE_KEYS.appleMusicLibrarySnapshot;
    const serialized =
      await AsyncStorage.getItem(key);

    if (serialized) {
      try {
        const parsed =
          JSON.parse(serialized) as Partial<PersistedAppleMusicLibrary>;

        if (
          parsed.ownerId === guard.userId &&
          parsed.sessionGeneration === guard.sessionGeneration
        ) {
          await AsyncStorage.removeItem(key);
        }
      } catch {
        await AsyncStorage.removeItem(key);
      }
    }

    await assertCurrent();
  });
}

async function persistAppleMusicLibrary(
  guard: CanalAccountSessionGuard,
  snapshot: MusicLibrarySnapshot,
): Promise<void> {
  await runAppleMusicStorageOperation(async () => {
    await assertCanalAccountSessionGuardCurrent(guard);

    const key =
      STORAGE_KEYS.appleMusicLibrarySnapshot;
    const previous =
      await AsyncStorage.getItem(key);
    const serialized =
      JSON.stringify({
        version: APPLE_MUSIC_LIBRARY_VERSION,
        ownerId: guard.userId,
        sessionGeneration: guard.sessionGeneration,
        snapshot,
      } satisfies PersistedAppleMusicLibrary);

    await AsyncStorage.setItem(key, serialized);

    try {
      await assertCanalAccountSessionGuardCurrent(guard);
    } catch (error) {
      if (await AsyncStorage.getItem(key) === serialized) {
        if (previous === null) {
          await AsyncStorage.removeItem(key);
        } else {
          await AsyncStorage.setItem(key, previous);
        }
      }

      throw error;
    }
  });
}

export function normalizeAppleMusicTrack(
  track: CanalAppleMusicTrack,
): MusicCatalogTrack {
  return {
    reference: {
      providerId: "apple-music",
      itemId: track.id,
      ...(track.url ? { webUrl: track.url } : {}),
      name: track.name,
      artistNames: [track.artistName],
    },
    name: track.name,
    durationMs: Math.max(0, Math.trunc(track.durationMs)),
    explicit: track.explicit,
    artists: [
      {
        name: track.artistName,
      },
    ],
    album: {
      ...(track.albumName ? { name: track.albumName } : {}),
      ...(track.artworkUrl ? { imageUrl: track.artworkUrl } : {}),
    },
    genres: track.genres,
    ...(track.isrc ? { isrc: track.isrc } : {}),
    ...(track.libraryAddedAt ? { libraryAddedAt: track.libraryAddedAt } : {}),
    ...(track.lastPlayedAt ? { lastPlayedAt: track.lastPlayedAt } : {}),
    ...(typeof track.playCount === "number" ? { playCount: track.playCount } : {}),
    ...(typeof track.isFavorite === "boolean" ? { isFavorite: track.isFavorite } : {}),
  };
}

function normalizeAppleMusicLibrary(
  library: CanalAppleMusicLibrary,
  ownerId: string,
): MusicLibrarySnapshot {
  const savedTracks =
    library.songs.map(normalizeAppleMusicTrack);
  const playlistTracks =
    (library.playlistTracks ?? []).map(normalizeAppleMusicTrack);
  const recentTracks =
    (library.recentSongs ?? []).map(normalizeAppleMusicTrack);
  const genreCounts =
    new Map<string, number>();
  const artistCounts =
    new Map<string, number>();
  const trackGenres: Record<string, readonly string[]> = {};

  const knownSongs = Array.from(
    new Map(
      [...library.songs, ...(library.playlistTracks ?? [])]
        .map((song) => [song.id, song]),
    ).values(),
  );

  for (const song of knownSongs) {
    artistCounts.set(
      song.artistName,
      (artistCounts.get(song.artistName) ?? 0) + 1,
    );
    trackGenres[song.id] = song.genres;

    for (const genre of song.genres) {
      const normalized = genre.trim();
      if (normalized) {
        genreCounts.set(
          normalized,
          (genreCounts.get(normalized) ?? 0) + 1,
        );
      }
    }
  }

  for (const album of library.albums ?? []) {
    for (const genre of album.genres) {
      const normalized = genre.trim();
      if (normalized) genreCounts.set(normalized, (genreCounts.get(normalized) ?? 0) + 1);
    }
  }

  const importedArtists = (library.artists ?? [])
    .filter((artist) => artist.id.trim() && artist.name.trim())
    .map((artist) => ({
      reference: {
        providerId: "apple-music" as const,
        artistId: artist.id,
      },
      name: artist.name,
      genres: artist.genres,
      ...(artist.artworkUrl ? { imageUrl: artist.artworkUrl } : {}),
      ...(typeof artist.isFavorite === "boolean" ? { isFavorite: artist.isFavorite } : {}),
    }));

  return {
    providerId: "apple-music",
    syncedAt: new Date().toISOString(),
    account: {
      accountId: ownerId,
      displayName: "Apple Music",
    },
    topArtists: (importedArtists.length > 0 ? importedArtists : Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([name]) => ({
        reference: {
          providerId: "apple-music" as const,
          artistId: name.toLowerCase(),
        },
        name,
        genres: [],
      }))).slice(0, 50),
    topTracks: savedTracks.slice(0, 50),
    recentTracks,
    savedTracks,
    playlistTracks,
    discoveryTracks: [],
    playlists: library.playlists.map((playlist) => ({
      reference: {
        providerId: "apple-music" as const,
        playlistId: playlist.id,
        ...(playlist.url ? { webUrl: playlist.url } : {}),
      },
      name: playlist.name,
      trackCount: playlist.trackCount,
    })),
    albums: (library.albums ?? []).map((album) => ({
      reference: {
        providerId: "apple-music" as const,
        albumId: album.id,
        ...(album.url ? { webUrl: album.url } : {}),
      },
      name: album.name,
      artistName: album.artistName,
      ...(album.artworkUrl ? { artworkUrl: album.artworkUrl } : {}),
      genres: album.genres,
      trackCount: album.trackCount,
      ...(album.releaseDate ? { releaseDate: album.releaseDate } : {}),
      ...(typeof album.isFavorite === "boolean" ? { isFavorite: album.isFavorite } : {}),
    })),
    topGenres: Array.from(genreCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 20),
    trackGenres,
    warnings: [
      ...(library.songsTruncated ? [`Apple Music has more than ${APPLE_MUSIC_LIBRARY_SONG_LIMIT.toLocaleString()} saved songs; Canal imported a bounded library window.`] : []),
      ...(library.playlistsTruncated ? [`Apple Music has more than ${APPLE_MUSIC_LIBRARY_PLAYLIST_LIMIT.toLocaleString()} playlists; Canal imported a bounded library window.`] : []),
      ...(library.playlistTracksTruncated ? [`Canal imported a bounded playlist-track window from up to ${APPLE_MUSIC_PLAYLIST_SCAN_LIMIT.toLocaleString()} Apple Music playlists.`] : []),
      ...(library.albumsTruncated ? [`Apple Music has more than ${APPLE_MUSIC_LIBRARY_ALBUM_LIMIT.toLocaleString()} albums; Canal imported a bounded library window.`] : []),
      ...(library.artistsTruncated ? [`Apple Music has more than ${APPLE_MUSIC_LIBRARY_ARTIST_LIMIT.toLocaleString()} artists; Canal imported a bounded library window.`] : []),
      "Apple Music recently played is bounded and is not a complete listening history.",
    ],
  };
}
