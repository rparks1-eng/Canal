import type {
  MusicCatalogTrack,
  MusicProviderGenreEvidence,
  MusicProviderId,
} from "./music-provider-model";

import {
  musicCatalogTrackToSceneTrack,
} from "./combined-music-library";

import {
  musicProviders,
} from "./music-services";

import {
  spotifyMusicProvider,
} from "./music-providers/spotify";

import type {
  SpotifyTrack,
} from "./spotify-api";

import type {
  SpotifyLibrarySnapshot,
} from "./spotify-library";

import type {
  SceneStudioDraft,
} from "./scene-studio";

function spotifyTrackFromCatalogTrack(
  track: MusicCatalogTrack,
): SpotifyTrack | null {
  if (track.reference.providerId !== "spotify") {
    return null;
  }

  const trackId = track.reference.itemId.trim();

  if (!trackId || !track.name.trim() || track.artists.length === 0) {
    return null;
  }

  return {
    id: trackId,
    name: track.name.trim(),
    uri: track.reference.uri ?? `spotify:track:${trackId}`,
    duration_ms: track.durationMs,
    explicit: track.explicit,
    artists: track.artists.map((artist, index) => ({
      id: artist.artistId ?? `${trackId}-artist-${index}`,
      name: artist.name,
      uri: "",
    })),
    ...(track.album
      ? {
          album: {
            id: track.album.albumId ?? `${trackId}-album`,
            name: track.album.name ?? "",
            uri: "",
            ...(track.album.imageUrl
              ? { imageUrl: track.album.imageUrl }
              : {}),
          },
        }
      : {}),
    ...(track.reference.webUrl
      ? {
          external_urls: {
            spotify: track.reference.webUrl,
          },
        }
      : {}),
  };
}

export async function addUserSelectedGenreCatalogTracks(
  draft: SceneStudioDraft,
  snapshot: SpotifyLibrarySnapshot,
): Promise<SpotifyLibrarySnapshot> {
  if (
    draft.preferredGenres.length === 0 ||
    Object.values(snapshot.trackGenres).some((genres) => genres.length > 0)
  ) {
    return snapshot;
  }

  const genreResults = await Promise.all(
    draft.preferredGenres.map(async (genre) => ({
      genre,
      tracks: await spotifyMusicProvider.searchCatalog({
        query: `genre:"${genre}"`,
        limit: 10,
      }),
    })),
  );

  return mergeUserSelectedGenreCatalogTracks(snapshot, genreResults);
}

export function mergeUserSelectedGenreCatalogTracks(
  snapshot: SpotifyLibrarySnapshot,
  genreResults: readonly {
    genre: string;
    tracks: readonly MusicCatalogTrack[];
  }[],
): SpotifyLibrarySnapshot {
  const discoveryById = new Map(
    snapshot.discoveryTracks.map((track) => [track.id, track]),
  );
  const trackGenres = {
    ...snapshot.trackGenres,
  };

  for (const result of genreResults) {
    for (const catalogTrack of result.tracks) {
      const track = spotifyTrackFromCatalogTrack(catalogTrack);

      if (!track) {
        continue;
      }

      discoveryById.set(track.id, track);
      trackGenres[track.id] = Array.from(new Set([
        ...(trackGenres[track.id] ?? []),
        result.genre,
      ]));
    }
  }

  return {
    ...snapshot,
    discoveryTracks: Array.from(discoveryById.values()),
    trackGenres,
  };
}

function normalizedTrackIdentity(track: SpotifyTrack): string {
  return `${track.name.trim().toLowerCase()}::${track.artists[0]?.name.trim().toLowerCase() ?? ""}`;
}

function mergeProviderGenreEvidence(
  current: readonly MusicProviderGenreEvidence[],
  provider: MusicProviderId,
  genres: readonly string[],
): MusicProviderGenreEvidence[] {
  const values = new Map<MusicProviderId, Map<string, string>>();
  for (const evidence of [...current, { provider, genres }]) {
    if (evidence.provider !== "apple-music" && evidence.provider !== "spotify") continue;
    const providerValues = values.get(evidence.provider) ?? new Map<string, string>();
    for (const candidate of evidence.genres) {
      const genre = candidate.replace(/\s+/gu, " ").trim();
      if (!genre || genre.length > 80 || /[\u0000-\u001F\u007F]/u.test(genre)) continue;
      const key = genre.normalize("NFKC").toLocaleLowerCase("en-US");
      if (!providerValues.has(key) && providerValues.size < 12) providerValues.set(key, genre);
    }
    if (providerValues.size > 0) values.set(evidence.provider, providerValues);
  }
  return (["apple-music", "spotify"] as const).flatMap((providerId) => {
    const providerValues = values.get(providerId);
    return providerValues?.size
      ? [{ provider: providerId, genres: [...providerValues.values()] }]
      : [];
  });
}

function normalizedGenre(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLowerCase();
}

function catalogGenresForSelection(
  track: MusicCatalogTrack,
  requestedGenre: string,
): string[] {
  const genres = (track.genres ?? []).map((genre) => genre.trim()).filter(Boolean);
  if (track.reference.providerId === "spotify") {
    return Array.from(new Set([...genres, requestedGenre]));
  }
  const requested = normalizedGenre(requestedGenre);
  if (!requested) return [];
  const matches = genres.some((genre) => {
    const candidate = normalizedGenre(genre);
    return candidate === requested || candidate.includes(requested) || requested.includes(candidate);
  });
  return matches ? genres : [];
}

export async function addUserSelectedGenreCatalogTracksFromProviders(
  draft: SceneStudioDraft,
  snapshot: SpotifyLibrarySnapshot,
  providerIds: readonly MusicProviderId[],
): Promise<SpotifyLibrarySnapshot> {
  if (draft.preferredGenres.length === 0 || providerIds.length === 0) {
    return snapshot;
  }

  const requests = providerIds.flatMap((providerId) =>
    draft.preferredGenres.map(async (genre) => ({
      providerId,
      genre,
      tracks: await musicProviders.require(providerId, "catalog-search").searchCatalog({
        query: providerId === "spotify" ? `genre:"${genre}"` : genre,
        limit: 10,
      }),
    })),
  );
  const settled = await Promise.allSettled(requests);
  const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (results.length === 0) return snapshot;

  const discoveryTracks = [...snapshot.discoveryTracks];
  const trackGenres = { ...snapshot.trackGenres };
  const inputWithEvidence = snapshot as SpotifyLibrarySnapshot & {
    trackGenreEvidence?: Record<string, MusicProviderGenreEvidence[]>;
  };
  const trackGenreEvidence = { ...(inputWithEvidence.trackGenreEvidence ?? {}) };
  const knownByIdentity = new Map<string, SpotifyTrack>();
  for (const track of [
    ...snapshot.topTracks,
    ...snapshot.recentTracks,
    ...snapshot.savedTracks,
    ...snapshot.playlistTracks,
    ...snapshot.discoveryTracks,
  ]) {
    knownByIdentity.set(normalizedTrackIdentity(track), track);
  }

  for (const result of results) {
    for (const catalogTrack of result.tracks) {
      const matchedGenres = catalogGenresForSelection(catalogTrack, result.genre);
      if (matchedGenres.length === 0) continue;
      const converted = musicCatalogTrackToSceneTrack(catalogTrack);
      if (!converted) continue;
      const identity = normalizedTrackIdentity(converted);
      const existing = knownByIdentity.get(identity);
      const target = existing ?? converted;
      if (!existing) {
        knownByIdentity.set(identity, converted);
        discoveryTracks.push(converted);
      }
      trackGenres[target.id] = Array.from(new Set([
        ...(trackGenres[target.id] ?? []),
        ...matchedGenres,
      ]));
      trackGenreEvidence[target.id] = mergeProviderGenreEvidence(
        trackGenreEvidence[target.id] ?? [],
        result.providerId,
        matchedGenres,
      );
    }
  }

  return {
    ...snapshot,
    discoveryTracks,
    trackGenres,
    trackGenreEvidence,
  } as SpotifyLibrarySnapshot & {
    trackGenreEvidence: Record<string, MusicProviderGenreEvidence[]>;
  };
}
