import type {
  MusicCatalogTrack,
} from "./music-provider-model";

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
