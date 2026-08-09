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

const SPOTIFY_TRACK_ID =
  /^[A-Za-z0-9]+$/u;

const ARTWORK_CONCURRENCY =
  4;

const MAX_OEMBED_RESPONSE_CHARACTERS =
  16_384;

const liveStageArtworkCache = new Map<string, Promise<string | null>>();
const snapshotArtworkCache = new Map<string, Promise<string | null>>();
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
    },
  };
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
        if (
          signal.track.album?.imageUrl ||
          signal.track.album?.images?.[0]?.url
        ) {
          return signal;
        }

        try {
          const imageUrl = await loadSpotifyArtworkUrl(
            signal.track.id,
            fetcher,
          );

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
  if (snapshot.trackImageUrl || !snapshot.trackId) {
    return snapshot;
  }

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
    const trackImageUrl = await artworkRequest;
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
        if (track.imageUrl) {
          return track;
        }

        try {
          const imageUrl = await loadSpotifyArtworkUrl(track.id, fetcher);

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
        if (!track || track.imageUrl) return { index, track };

        try {
          let artworkRequest = liveStageArtworkCache.get(track.id);
          if (!artworkRequest) {
            artworkRequest = loadSpotifyArtworkUrl(track.id, fetcher);
            liveStageArtworkCache.set(track.id, artworkRequest);
          }
          const imageUrl = await artworkRequest;
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
