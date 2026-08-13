import type {
  MusicCatalogTrack,
  MusicLibrarySnapshot,
  MusicProviderGenreEvidence,
  MusicProviderId,
} from "./music-provider-model";

import type {
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "./spotify-api";

import type {
  SpotifyLibrarySnapshot,
} from "./spotify-library";

import {
  readSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "./spotify-library";

import {
  readAppleMusicLibrarySnapshot,
  syncAppleMusicLibrary,
} from "./apple-music";

import {
  assertCanalAccountSessionGuardCurrent,
  captureCanalAccountSessionGuard,
} from "./canal-auth";
import { musicProviders } from "./music-services";

export type CanalProviderSceneTrack = SpotifyTrack & {
  canalProviderId: MusicProviderId;
  canalProviderTrackId: string;
  canalProviderUrl?: string;
};

export type SceneMusicLibrarySnapshot = SpotifyLibrarySnapshot & {
  trackGenreEvidence: Record<string, MusicProviderGenreEvidence[]>;
};

export type CombinedSceneMusicLibrary = {
  snapshot: SceneMusicLibrarySnapshot;
  providerIds: readonly MusicProviderId[];
  readyProviderIds: readonly MusicProviderId[];
  genreCatalog: readonly string[];
};

const discoveryCatalogCache = new Map<string, Promise<{
  tracks: CanalProviderSceneTrack[];
  genres: Record<string, string[]>;
  evidence: Record<string, MusicProviderGenreEvidence[]>;
}>>();
const MAX_DISCOVERY_CACHE_ENTRIES = 16;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLowerCase();
}

function trackIdentity(track: SpotifyTrack): string {
  return `${identity(track.name)}::${identity(track.artists[0]?.name ?? "")}`;
}

function catalogTrackIdentity(track: MusicCatalogTrack): string {
  return `${identity(track.name)}::${identity(track.artists[0]?.name ?? "")}`;
}

export function getCanalTrackProvider(track: SpotifyTrack): MusicProviderId {
  return (track as Partial<CanalProviderSceneTrack>).canalProviderId === "apple-music"
    ? "apple-music"
    : "spotify";
}

export function getCanalTrackProviderId(track: SpotifyTrack): string {
  return (track as Partial<CanalProviderSceneTrack>).canalProviderTrackId?.trim() || track.id;
}

export function getCanalTrackProviderUrl(track: SpotifyTrack): string | undefined {
  const providerUrl = (track as Partial<CanalProviderSceneTrack>).canalProviderUrl;
  return clean(providerUrl) || clean(track.external_urls?.spotify) || undefined;
}

export function musicCatalogTrackToSceneTrack(track: MusicCatalogTrack): CanalProviderSceneTrack | null {
  const providerTrackId = clean(track.reference.itemId);
  const name = clean(track.name);
  const artistName = clean(track.artists[0]?.name);

  if (!providerTrackId || !name || !artistName) return null;

  const providerId = track.reference.providerId;
  const id = providerId === "spotify"
    ? providerTrackId
    : `apple-music:${providerTrackId}`;
  const artistId = clean(track.artists[0]?.artistId) || `${id}:artist`;
  const albumId = clean(track.album?.albumId) || `${id}:album`;
  const providerUrl = clean(track.reference.webUrl) || undefined;

  return {
    id,
    name,
    uri: providerId === "spotify"
      ? clean(track.reference.uri) || `spotify:track:${providerTrackId}`
      : `apple-music:song:${providerTrackId}`,
    duration_ms: Math.max(0, Math.trunc(track.durationMs || 0)),
    explicit: track.explicit === true,
    artists: track.artists.map((artist, index) => ({
      id: clean(artist.artistId) || `${artistId}:${index}`,
      name: clean(artist.name) || artistName,
      uri: providerId === "spotify"
        ? `spotify:artist:${clean(artist.artistId) || artistId}`
        : `apple-music:artist:${clean(artist.artistId) || artistId}`,
    })),
    album: {
      id: albumId,
      name: clean(track.album?.name),
      uri: providerId === "spotify"
        ? `spotify:album:${albumId}`
        : `apple-music:album:${albumId}`,
      ...(clean(track.album?.imageUrl) ? { imageUrl: clean(track.album?.imageUrl) } : {}),
    },
    ...(providerId === "spotify" && providerUrl
      ? { external_urls: { spotify: providerUrl } }
      : {}),
    canalProviderId: providerId,
    canalProviderTrackId: providerTrackId,
    ...(providerUrl ? { canalProviderUrl: providerUrl } : {}),
  };
}

function markSpotifyTrack(track: SpotifyTrack): CanalProviderSceneTrack {
  return {
    ...track,
    canalProviderId: "spotify",
    canalProviderTrackId: track.id,
    ...(clean(track.external_urls?.spotify)
      ? { canalProviderUrl: clean(track.external_urls?.spotify) }
      : {}),
  };
}

function appleArtists(snapshot: MusicLibrarySnapshot): SpotifyArtist[] {
  return snapshot.topArtists.map((artist) => ({
    id: `apple-music:${artist.reference.artistId}`,
    name: artist.name,
    uri: `apple-music:artist:${artist.reference.artistId}`,
    genres: [...artist.genres],
    ...(artist.imageUrl ? { images: [{ url: artist.imageUrl }] } : {}),
  }));
}

function applePlaylists(snapshot: MusicLibrarySnapshot): SpotifyPlaylist[] {
  return snapshot.playlists.map((playlist) => ({
    id: `apple-music:${playlist.reference.playlistId}`,
    name: playlist.name,
    uri: `apple-music:playlist:${playlist.reference.playlistId}`,
    tracks: { total: playlist.trackCount },
    ...(playlist.reference.webUrl
      ? { external_urls: { spotify: playlist.reference.webUrl } }
      : {}),
  }));
}

function uniqueGenres(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const genre = clean(value);
    const key = identity(genre);
    if (!genre || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(genre);
  }
  return result;
}

export function combineSceneMusicLibraries(
  spotify: SpotifyLibrarySnapshot | null,
  apple: MusicLibrarySnapshot | null,
): CombinedSceneMusicLibrary | null {
  if (!spotify && !apple) return null;

  const providerIds: MusicProviderId[] = [
    ...(spotify ? ["spotify" as const] : []),
    ...(apple ? ["apple-music" as const] : []),
  ];
  const trackGenres: Record<string, string[]> = {};
  const trackGenreEvidence: Record<string, MusicProviderGenreEvidence[]> = {};
  const identityToId = new Map<string, string>();

  const spotifyTracks = new Map<string, CanalProviderSceneTrack>();
  const addSpotifyTracks = (tracks: readonly SpotifyTrack[]) => tracks.map((track) => {
    const marked = markSpotifyTrack(track);
    spotifyTracks.set(marked.id, marked);
    identityToId.set(trackIdentity(marked), marked.id);
    trackGenres[marked.id] = uniqueGenres(spotify?.trackGenres[track.id] ?? []);
    if (trackGenres[marked.id]?.length) {
      trackGenreEvidence[marked.id] = [{
        provider: "spotify",
        genres: trackGenres[marked.id] ?? [],
      }];
    }
    return marked;
  });

  const topTracks = addSpotifyTracks(spotify?.topTracks ?? []);
  const recentTracks = addSpotifyTracks(spotify?.recentTracks ?? []);
  const savedTracks = addSpotifyTracks(spotify?.savedTracks ?? []);
  const playlistTracks = addSpotifyTracks(spotify?.playlistTracks ?? []);
  const discoveryTracks = addSpotifyTracks(spotify?.discoveryTracks ?? []);
  const allTrackCollections = [
    topTracks,
    recentTracks,
    savedTracks,
    playlistTracks,
    discoveryTracks,
  ];

  const applyAppleArtwork = (trackId: string, imageUrl: string): void => {
    for (const collection of allTrackCollections) {
      for (let index = 0; index < collection.length; index += 1) {
        const track = collection[index];
        if (track?.id !== trackId) continue;
        collection[index] = {
          ...track,
          album: {
            id: track.album?.id ?? `${track.id}:album`,
            name: track.album?.name ?? "",
            uri: track.album?.uri ?? "",
            ...track.album,
            imageUrl,
            images: [{ url: imageUrl }],
          },
        };
      }
    }
  };

  const addAppleTracks = (
    target: SpotifyTrack[],
    tracks: readonly MusicCatalogTrack[],
  ): void => {
    for (const catalogTrack of tracks) {
      const genres = uniqueGenres([
        ...(catalogTrack.genres ?? []),
        ...(apple?.trackGenres[catalogTrack.reference.itemId] ?? []),
      ]);
      const duplicateId = identityToId.get(catalogTrackIdentity(catalogTrack));
      if (duplicateId) {
        trackGenres[duplicateId] = uniqueGenres([
          ...(trackGenres[duplicateId] ?? []),
          ...genres,
        ]);
        trackGenreEvidence[duplicateId] = [
          ...(trackGenreEvidence[duplicateId] ?? []).filter((item) => item.provider !== "apple-music"),
          ...(genres.length ? [{ provider: "apple-music" as const, genres }] : []),
        ];
        const appleArtwork = clean(catalogTrack.album?.imageUrl);
        if (appleArtwork) applyAppleArtwork(duplicateId, appleArtwork);
        if (!target.some((track) => track.id === duplicateId)) {
          const existing = allTrackCollections
            .flatMap((collection) => collection)
            .find((track) => track.id === duplicateId);
          if (existing) target.push(existing);
        }
        continue;
      }
      const converted = musicCatalogTrackToSceneTrack(catalogTrack);
      if (!converted) continue;
      identityToId.set(trackIdentity(converted), converted.id);
      trackGenres[converted.id] = genres;
      if (genres.length) {
        trackGenreEvidence[converted.id] = [{ provider: "apple-music", genres }];
      }
      target.push(converted);
    }
  };

  if (apple) {
    addAppleTracks(topTracks, apple.topTracks);
    addAppleTracks(recentTracks, apple.recentTracks);
    addAppleTracks(savedTracks, apple.savedTracks);
    addAppleTracks(playlistTracks, apple.playlistTracks);
    addAppleTracks(discoveryTracks, apple.discoveryTracks);
  }

  const genreCounts = new Map<string, { name: string; count: number }>();
  for (const genre of [
    ...(spotify?.topGenres ?? []),
    ...(apple?.topGenres ?? []),
  ]) {
    const name = clean(genre.name);
    const key = identity(name);
    if (!key) continue;
    const current = genreCounts.get(key);
    genreCounts.set(key, {
      name: current?.name ?? name,
      count: (current?.count ?? 0) + Math.max(0, Math.trunc(genre.count)),
    });
  }

  const topGenres = [...genreCounts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  const genreCatalog = uniqueGenres([
    ...topGenres.map((genre) => genre.name),
    ...Object.values(trackGenres).flat(),
    ...(apple?.topArtists.flatMap((artist) => artist.genres) ?? []),
    ...(apple?.albums?.flatMap((album) => album.genres) ?? []),
  ]);

  const profile = spotify?.profile ?? {
    id: apple?.account.accountId ?? "apple-music",
    display_name: apple?.account.displayName ?? "Apple Music listener",
    email: "",
    country: "",
    images: [],
  };

  return {
    providerIds,
    readyProviderIds: [
      // An interrupted Spotify import still contains a valid, account-scoped
      // partial library (top/recent tracks and every completed import page).
      // Keep it usable for Scene generation while the next sync resumes the
      // remaining pages; Apple Music can supplement it when both are present.
      ...(spotify ? ["spotify" as const] : []),
      ...(apple ? ["apple-music" as const] : []),
    ],
    genreCatalog,
    snapshot: {
      syncedAt: [spotify?.syncedAt, apple?.syncedAt].filter(Boolean).sort().at(-1) ?? new Date(0).toISOString(),
      profile,
      topArtists: [
        ...(spotify?.topArtists ?? []),
        ...(apple ? appleArtists(apple) : []),
      ],
      topTracks,
      recentTracks,
      savedTracks,
      playlistTracks,
      discoveryTracks,
      playlists: [
        ...(spotify?.playlists ?? []),
        ...(apple ? applePlaylists(apple) : []),
      ],
      topGenres,
      trackGenres,
      trackGenreEvidence,
      warnings: [
        ...(spotify?.warnings ?? []),
        ...(apple?.warnings ?? []),
      ],
      ...(spotify?.importStatus
        ? { importStatus: spotify.importStatus }
        : {}),
    },
  };
}

export async function readCombinedSceneMusicLibrary(): Promise<CombinedSceneMusicLibrary | null> {
  const guard = await captureCanalAccountSessionGuard();
  const [spotifyResult, appleResult] = await Promise.allSettled([
    readSpotifyLibrarySnapshot(),
    readAppleMusicLibrarySnapshot(),
  ]);

  await assertCanalAccountSessionGuardCurrent(guard);

  return combineSceneMusicLibraries(
    spotifyResult.status === "fulfilled" ? spotifyResult.value : null,
    appleResult.status === "fulfilled" ? appleResult.value : null,
  );
}

export async function syncCombinedSceneMusicLibrary(
  providerIds: readonly MusicProviderId[],
): Promise<CombinedSceneMusicLibrary | null> {
  const guard = await captureCanalAccountSessionGuard();
  const requested = new Set(providerIds);
  const [spotifyResult, appleResult] = await Promise.allSettled([
    requested.has("spotify") ? syncSpotifyLibrary() : readSpotifyLibrarySnapshot(),
    requested.has("apple-music") ? syncAppleMusicLibrary() : readAppleMusicLibrarySnapshot(),
  ]);

  await assertCanalAccountSessionGuardCurrent(guard);

  const combined = combineSceneMusicLibraries(
    spotifyResult.status === "fulfilled" ? spotifyResult.value : null,
    appleResult.status === "fulfilled" ? appleResult.value : null,
  );

  if (!combined && (spotifyResult.status === "rejected" || appleResult.status === "rejected")) {
    throw spotifyResult.status === "rejected" ? spotifyResult.reason : appleResult.status === "rejected" ? appleResult.reason : new Error("Music library sync failed.");
  }

  return combined;
}

/**
 * Adds a small account-fenced catalog discovery window from every connected
 * provider. This is cached in memory so Home focus does not repeatedly hit
 * Apple Music or Spotify, while explicit library refresh can use new data
 * after the app process/cache changes.
 */
export async function addCombinedCatalogDiscovery(
  library: CombinedSceneMusicLibrary,
): Promise<CombinedSceneMusicLibrary> {
  if (library.readyProviderIds.length === 0) return library;
  const guard = await captureCanalAccountSessionGuard();
  const genres = library.genreCatalog.slice(0, 2);
  const queries = genres.length > 0 ? genres : ["new music"];
  const cacheKey = [
    guard.userId,
    guard.sessionGeneration,
    ...library.readyProviderIds,
    ...queries.map(identity),
  ].join(":");
  let request = discoveryCatalogCache.get(cacheKey);
  if (!request) {
    request = (async () => {
      const results = await Promise.allSettled(
        library.readyProviderIds.flatMap((providerId) =>
          queries.map((genre) =>
            musicProviders.require(providerId, "catalog-search").searchCatalog({
              query: providerId === "spotify" && genre !== "new music"
                ? `genre:"${genre}"`
                : genre,
              limit: 6,
            }),
          ),
        ),
      );
      await assertCanalAccountSessionGuardCurrent(guard);
      const byIdentity = new Map<string, {
        track: CanalProviderSceneTrack;
        evidence: Map<MusicProviderId, string[]>;
      }>();
      for (const catalogTrack of results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [])) {
        const track = musicCatalogTrackToSceneTrack(catalogTrack);
        if (!track) continue;
        const key = trackIdentity(track);
        if (!key) continue;
        const current = byIdentity.get(key);
        const genreMap = current?.evidence ?? new Map<MusicProviderId, string[]>();
        genreMap.set(catalogTrack.reference.providerId, uniqueGenres([
          ...(genreMap.get(catalogTrack.reference.providerId) ?? []),
          ...(catalogTrack.genres ?? []),
        ]).slice(0, 12));
        byIdentity.set(key, {
          track: !current || catalogTrack.reference.providerId === "apple-music"
            ? track
            : current.track,
          evidence: genreMap,
        });
      }
      const tracksByProvider = new Map<MusicProviderId, CanalProviderSceneTrack[]>([
        ["apple-music", []],
        ["spotify", []],
      ]);
      for (const { track } of byIdentity.values()) {
        tracksByProvider.get(getCanalTrackProvider(track))?.push(track);
      }
      const tracks: CanalProviderSceneTrack[] = [];
      const providerOrder = library.readyProviderIds.includes("apple-music")
        ? (["apple-music", "spotify"] as const)
        : (["spotify", "apple-music"] as const);
      for (let index = 0; tracks.length < 12; index += 1) {
        let appended = false;
        for (const providerId of providerOrder) {
          const track = tracksByProvider.get(providerId)?.[index];
          if (!track) continue;
          tracks.push(track);
          appended = true;
          if (tracks.length === 12) break;
        }
        if (!appended) break;
      }
      const genres: Record<string, string[]> = {};
      const evidence: Record<string, MusicProviderGenreEvidence[]> = {};
      for (const track of tracks) {
        const item = byIdentity.get(trackIdentity(track));
        if (!item) continue;
        evidence[track.id] = (["apple-music", "spotify"] as const).flatMap((provider) => {
          const values = item.evidence.get(provider) ?? [];
          return values.length ? [{ provider, genres: values }] : [];
        });
        genres[track.id] = uniqueGenres(evidence[track.id]?.flatMap((item) => item.genres) ?? []);
      }
      return { tracks, genres, evidence };
    })().catch((error) => {
      discoveryCatalogCache.delete(cacheKey);
      throw error;
    });
    discoveryCatalogCache.set(cacheKey, request);
    if (discoveryCatalogCache.size > MAX_DISCOVERY_CACHE_ENTRIES) {
      const oldest = discoveryCatalogCache.keys().next().value;
      if (typeof oldest === "string") discoveryCatalogCache.delete(oldest);
    }
  }
  const discovered = await request;
  await assertCanalAccountSessionGuardCurrent(guard);
  const existingIdentity = new Set([
    ...library.snapshot.topTracks,
    ...library.snapshot.recentTracks,
    ...library.snapshot.savedTracks,
    ...library.snapshot.playlistTracks,
    ...library.snapshot.discoveryTracks,
  ].map(trackIdentity));
  const additions = discovered.tracks.filter((track) => !existingIdentity.has(trackIdentity(track)));
  return additions.length === 0 ? library : {
    ...library,
    snapshot: {
      ...library.snapshot,
      discoveryTracks: [...additions, ...library.snapshot.discoveryTracks],
      trackGenres: {
        ...library.snapshot.trackGenres,
        ...Object.fromEntries(additions.map((track) => [track.id, discovered.genres[track.id] ?? []])),
      },
      trackGenreEvidence: {
        ...library.snapshot.trackGenreEvidence,
        ...Object.fromEntries(additions.map((track) => [track.id, discovered.evidence[track.id] ?? []])),
      },
    },
  };
}
