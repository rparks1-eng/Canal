import type {
  SpotifyTrack,
} from "./spotify-api";

import type {
  GeneratedSceneResult,
} from "./scene-studio";

import type {
  StoredScene,
} from "./scenes";
import type {
  LiveStage,
} from "./live-stages";
import type { Snapshot } from "./snapshots";
import { loadAppleMusicCatalogArtwork } from "./apple-music";
import {
  loadGeniusArtworkFallback,
  readCachedGeniusArtwork,
} from "./genius-context-client";

const SPOTIFY_TRACK_ID =
  /^[A-Za-z0-9]+$/u;

const ARTWORK_CONCURRENCY =
  4;

const MAX_OEMBED_RESPONSE_CHARACTERS =
  16_384;

const liveStageArtworkCache = new Map<string, Promise<string | null>>();
const snapshotArtworkCache = new Map<string, Promise<string | null>>();
const orbitArtworkCache = new Map<string, Promise<string | null>>();
const MAX_SNAPSHOT_ARTWORK_CACHE_ENTRIES = 256;

type FetchLike = (
  input: string,
) => Promise<Pick<Response, "ok" | "text">>;

function safeSpotifyArtworkUrl(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2_048 ||
    /[\u0000-\u0020\\]/u.test(value)
  ) {
    return null;
  }

  return /^https:\/\/(?:i\.scdn\.co|image-cdn-(?:ak|fa)\.spotifycdn\.com)\//u.test(value)
    ? value
    : null;
}

export async function loadSpotifyArtworkUrl(
  trackId: string,
  fetcher: FetchLike,
): Promise<string | null> {
  if (!SPOTIFY_TRACK_ID.test(trackId)) {
    return null;
  }

  const spotifyUrl =
    `https://open.spotify.com/track/${trackId}`;
  const response = await fetcher(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`,
  );

  if (!response.ok) {
    return null;
  }

  const body = await response.text();

  if (body.length > MAX_OEMBED_RESPONSE_CHARACTERS) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as {
      thumbnail_url?: unknown;
    };

    return safeSpotifyArtworkUrl(parsed.thumbnail_url);
  } catch {
    return null;
  }
}

function trackWithArtwork(
  track: SpotifyTrack,
  imageUrl: string,
): SpotifyTrack {
  return {
    ...track,
    album: {
      id: track.album?.id ?? `${track.id}-album`,
      name: track.album?.name ?? "",
      uri: track.album?.uri ?? "",
      ...track.album,
      imageUrl,
      images: [{ url: imageUrl }],
    },
  };
}

function isGeniusArtworkUrl(value: string | undefined): boolean {
  return Boolean(value && /^https:\/\/(?:images|t2)\.genius\.com\//u.test(value));
}

export function isAppleArtworkUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "mzstatic.com" || host.endsWith(".mzstatic.com");
  } catch {
    return false;
  }
}

async function loadPreferredArtwork(input: {
  trackId: string;
  title: string;
  artist: string;
  existingUrl?: string;
  fetcher: FetchLike;
}): Promise<string | null> {
  if (isAppleArtworkUrl(input.existingUrl)) return input.existingUrl ?? null;
  const appleArtwork = await loadAppleMusicCatalogArtwork(input.title, input.artist);
  if (appleArtwork) return appleArtwork;

  if (input.existingUrl && !isGeniusArtworkUrl(input.existingUrl)) {
    return input.existingUrl;
  }

  const spotifyArtwork = await loadCachedSpotifyArtworkUrl(input.trackId, input.fetcher);
  if (spotifyArtwork) return spotifyArtwork;

  return input.existingUrl ?? readCachedGeniusArtwork(input.title, input.artist) ??
    loadGeniusArtworkFallback(input.title, input.artist);
}

function loadCachedSpotifyArtworkUrl(
  trackId: string,
  fetcher: FetchLike,
): Promise<string | null> {
  if (fetcher !== fetch) {
    return loadSpotifyArtworkUrl(trackId, fetcher);
  }

  let request = orbitArtworkCache.get(trackId);

  if (!request) {
    request = loadSpotifyArtworkUrl(trackId, fetcher);
    orbitArtworkCache.set(trackId, request);
  }

  return request;
}

export async function addSpotifyArtworkToTracks(
  tracks: readonly SpotifyTrack[],
  fetcher: FetchLike = fetch,
): Promise<SpotifyTrack[]> {
  return Promise.all(tracks.slice(0, 12).map(async (track) => {
    try {
      const currentArtwork = track.album?.imageUrl ?? track.album?.images?.[0]?.url;
      const imageUrl = await loadPreferredArtwork({
        trackId: track.id,
        title: track.name,
        artist: track.artists[0]?.name ?? "",
        ...(currentArtwork ? { existingUrl: currentArtwork } : {}),
        fetcher,
      });
      return imageUrl ? trackWithArtwork(track, imageUrl) : track;
    } catch {
      orbitArtworkCache.delete(track.id);
      return track;
    }
  }));
}

export async function addSpotifyArtworkToGeneratedScene(
  result: GeneratedSceneResult,
  fetcher: FetchLike = fetch,
): Promise<GeneratedSceneResult> {
  const signals = [...result.trackSignals];

  for (
    let offset = 0;
    offset < signals.length;
    offset += ARTWORK_CONCURRENCY
  ) {
    const batch = signals.slice(offset, offset + ARTWORK_CONCURRENCY);
    const updated = await Promise.all(
      batch.map(async (signal) => {
        try {
          const currentArtwork = signal.track.album?.imageUrl ?? signal.track.album?.images?.[0]?.url;
          const imageUrl = await loadPreferredArtwork({
            trackId: signal.track.id,
            title: signal.track.name,
            artist: signal.track.artists[0]?.name ?? "",
            ...(currentArtwork ? { existingUrl: currentArtwork } : {}),
            fetcher,
          });

          return imageUrl
            ? {
                ...signal,
                track: trackWithArtwork(signal.track, imageUrl),
              }
            : signal;
        } catch {
          return signal;
        }
      }),
    );

    updated.forEach((signal, index) => {
      signals[offset + index] = signal;
    });
  }

  return {
    ...result,
    trackSignals: signals,
    scene: {
      ...result.scene,
      tracks: result.scene.tracks.map((sceneTrack) => {
        const signal = signals.find(
          (candidate) => candidate.track.id === sceneTrack.id,
        );
        const imageUrl =
          signal?.track.album?.imageUrl ??
          signal?.track.album?.images?.[0]?.url;

        return imageUrl
          ? { ...sceneTrack, imageUrl }
          : sceneTrack;
      }),
    },
  };
}

export async function addSpotifyArtworkToSnapshot<T extends Snapshot>(
  snapshot: T,
  fetcher: FetchLike = fetch,
): Promise<T> {
  if (!snapshot.trackId || !snapshot.trackTitle || !snapshot.trackArtist) {
    return snapshot;
  }

  if (isAppleArtworkUrl(snapshot.trackImageUrl)) return snapshot;

  const appleArtwork = await loadAppleMusicCatalogArtwork(
    snapshot.trackTitle,
    snapshot.trackArtist,
  );
  if (appleArtwork) return { ...snapshot, trackImageUrl: appleArtwork };
  if (snapshot.trackImageUrl && !isGeniusArtworkUrl(snapshot.trackImageUrl)) return snapshot;

  let artworkRequest = snapshotArtworkCache.get(snapshot.trackId);
  if (!artworkRequest) {
    artworkRequest = loadSpotifyArtworkUrl(snapshot.trackId, fetcher);
    snapshotArtworkCache.set(snapshot.trackId, artworkRequest);

    if (snapshotArtworkCache.size > MAX_SNAPSHOT_ARTWORK_CACHE_ENTRIES) {
      const oldestKey = snapshotArtworkCache.keys().next().value;
      if (typeof oldestKey === "string") snapshotArtworkCache.delete(oldestKey);
    }
  }

  try {
    const trackImageUrl = await artworkRequest ?? snapshot.trackImageUrl ??
      readCachedGeniusArtwork(snapshot.trackTitle, snapshot.trackArtist) ??
      await loadGeniusArtworkFallback(snapshot.trackTitle, snapshot.trackArtist);
    return trackImageUrl ? { ...snapshot, trackImageUrl } : snapshot;
  } catch {
    snapshotArtworkCache.delete(snapshot.trackId);
    return snapshot;
  }
}

export async function addSpotifyArtworkToSnapshots<T extends Snapshot>(
  snapshots: readonly T[],
  fetcher: FetchLike = fetch,
): Promise<T[]> {
  const enriched: T[] = [];

  for (let offset = 0; offset < snapshots.length; offset += ARTWORK_CONCURRENCY) {
    enriched.push(
      ...(await Promise.all(
        snapshots
          .slice(offset, offset + ARTWORK_CONCURRENCY)
          .map((snapshot) => addSpotifyArtworkToSnapshot(snapshot, fetcher)),
      )),
    );
  }

  return enriched;
}

export async function addSpotifyArtworkToStoredScene(
  scene: StoredScene,
  fetcher: FetchLike = fetch,
): Promise<StoredScene> {
  const tracks = [...scene.tracks];

  for (
    let offset = 0;
    offset < tracks.length;
    offset += ARTWORK_CONCURRENCY
  ) {
    const batch = tracks.slice(offset, offset + ARTWORK_CONCURRENCY);
    const updated = await Promise.all(
      batch.map(async (track) => {
        try {
          const imageUrl = await loadPreferredArtwork({
            trackId: track.id,
            title: track.title,
            artist: track.artist,
            ...(track.imageUrl ? { existingUrl: track.imageUrl } : {}),
            fetcher,
          });

          return imageUrl
            ? { ...track, imageUrl }
            : track;
        } catch {
          return track;
        }
      }),
    );

    updated.forEach((track, index) => {
      tracks[offset + index] = track;
    });
  }

  return {
    ...scene,
    tracks,
  };
}

export async function addSpotifyArtworkToLiveStage(
  stage: LiveStage,
  trackIndexes: readonly number[],
  fetcher: FetchLike = fetch,
): Promise<LiveStage> {
  const tracks = [...stage.tracks];
  const indexes = Array.from(
    new Set(
      trackIndexes.filter(
        (index) => Number.isInteger(index) && index >= 0 && index < tracks.length,
      ),
    ),
  ).slice(0, 12);

  for (let offset = 0; offset < indexes.length; offset += ARTWORK_CONCURRENCY) {
    const batch = indexes.slice(offset, offset + ARTWORK_CONCURRENCY);
    const updated = await Promise.all(
      batch.map(async (index) => {
        const track = tracks[index];
        if (!track) return { index, track };

        try {
          if (isAppleArtworkUrl(track.imageUrl)) return { index, track };
          const appleArtwork = await loadAppleMusicCatalogArtwork(track.title, track.artist);
          if (appleArtwork) {
            return { index, track: { ...track, imageUrl: appleArtwork } };
          }
          if (track.imageUrl && !isGeniusArtworkUrl(track.imageUrl)) return { index, track };
          let artworkRequest = liveStageArtworkCache.get(track.id);
          if (!artworkRequest) {
            artworkRequest = loadSpotifyArtworkUrl(track.id, fetcher);
            liveStageArtworkCache.set(track.id, artworkRequest);
          }
          const imageUrl = await artworkRequest ?? track.imageUrl ??
            readCachedGeniusArtwork(track.title, track.artist) ??
            await loadGeniusArtworkFallback(track.title, track.artist);
          return { index, track: imageUrl ? { ...track, imageUrl } : track };
        } catch {
          return { index, track };
        }
      }),
    );

    updated.forEach(({ index, track }) => {
      if (track) tracks[index] = track;
    });
  }

  return { ...stage, tracks };
}
