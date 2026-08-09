import type {
  GeneratedSceneResult,
  GeneratedTrackSignal,
} from "./scene-studio";

import type {
  MusicCatalogTrack,
} from "./music-provider-model";

import type {
  SceneTrack,
} from "./scenes";

function calculateDurationMinutes(
  signals: GeneratedTrackSignal[],
): number {
  const duration =
    signals.reduce(
      (
        total,
        signal,
      ) =>
        total +
        (
          typeof signal.track
            .duration_ms ===
            "number"
            ? signal.track
                .duration_ms
            : 210_000
        ),
      0,
    );

  return Math.max(
    1,
    Math.round(
      duration /
        60_000,
    ),
  );
}

function calculateSourceBreakdown(
  signals: GeneratedTrackSignal[],
): GeneratedSceneResult["sourceBreakdown"] {
  return {
    top:
      signals.filter(
        (signal) =>
          signal.sources.includes(
            "top",
          ),
      ).length,

    saved:
      signals.filter(
        (signal) =>
          signal.sources.includes(
            "saved",
          ),
      ).length,

    recent:
      signals.filter(
        (signal) =>
          signal.sources.includes(
            "recent",
          ),
      ).length,

    playlist:
      signals.filter(
        (signal) =>
          signal.sources.includes(
            "playlist",
          ),
      ).length,

    discovery:
      signals.filter(
        (signal) =>
          signal.sources.includes(
            "discovery",
          ),
      ).length,
  };
}

function calculateArtists(
  signals: GeneratedTrackSignal[],
): string {
  return Array.from(
    new Set(
      signals.flatMap(
        (signal) =>
          signal.track.artists
            .map(
              (artist) =>
                artist.name.trim(),
            )
            .filter(
              Boolean,
            ),
      ),
    ),
  )
    .slice(
      0,
      12,
    )
    .join(
      ", ",
    );
}

function sceneTrackFromSignal(
  signal: GeneratedTrackSignal,
): SceneTrack {
  return {
    id: signal.track.id,
    title: signal.track.name,
    artist: signal.track.artists.map((artist) => artist.name).join(", "),
    source: signal.sources[0] ?? "generated",
    durationMs: signal.track.duration_ms,
    ...(signal.track.uri
      ? { spotifyUri: signal.track.uri }
      : {}),
    ...(signal.track.external_urls?.spotify
      ? { spotifyUrl: signal.track.external_urls.spotify }
      : {}),
  };
}

function rejectedIds(
  result: GeneratedSceneResult,
  additional: readonly string[] = [],
): string[] {
  return Array.from(new Set([
    ...(result.rejectedTrackIds ?? []),
    ...additional,
  ]));
}

function rebuildGeneratedScene(
  result: GeneratedSceneResult,
  signals: GeneratedTrackSignal[],
): GeneratedSceneResult {
  const artists = calculateArtists(signals);
  const existingTrackById = new Map(
    result.scene.tracks.map((track) => [track.id, track]),
  );
  const tracks = signals.map(
    (signal) =>
      existingTrackById.get(signal.track.id) ?? sceneTrackFromSignal(signal),
  );

  return {
    ...result,
    scene: {
      ...result.scene,
      // The saved Scene must exactly mirror the editable playlist. Keeping
      // unrepresented tracks here resurrects removed/swapped songs on save.
      tracks,
      artists: artists || result.scene.artists,
      artistSelections: artists || result.scene.artistSelections,
      updatedAt: new Date().toISOString(),
    },
    trackSignals: signals,
    sourceBreakdown: calculateSourceBreakdown(signals),
    estimatedDurationMinutes: calculateDurationMinutes(signals),
  };
}

export function refillGeneratedSceneToDuration(
  result: GeneratedSceneResult,
  candidates: GeneratedSceneResult,
): GeneratedSceneResult {
  const targetMs = Math.max(1, result.draft.durationMinutes) * 60_000;
  const nextSignals = [...result.trackSignals];
  const present = new Set(nextSignals.map((signal) => signal.track.id));
  let durationMs = nextSignals.reduce(
    (total, signal) => total + (signal.track.duration_ms ?? 210_000),
    0,
  );

  for (const candidate of candidates.trackSignals) {
    if (durationMs >= targetMs) break;
    if (present.has(candidate.track.id)) continue;
    present.add(candidate.track.id);
    nextSignals.push(candidate);
    durationMs += candidate.track.duration_ms ?? 210_000;
  }

  return rebuildGeneratedScene(result, nextSignals);
}

export function regenerateGeneratedSceneEditor(
  current: GeneratedSceneResult,
  generated: GeneratedSceneResult,
): GeneratedSceneResult {
  return {
    ...generated,
    id: current.id,
    scene: {
      ...generated.scene,
      id: current.scene.id,
      visibility: "private",
      createdAt: current.scene.createdAt,
      updatedAt: new Date().toISOString(),
    },
    rejectedTrackIds: rejectedIds(
      current,
      [],
    ),
    createdAt: current.createdAt,
  };
}

export function replaceTrackInGeneratedSceneEditor(
  result: GeneratedSceneResult,
  trackId: string,
  candidates: GeneratedSceneResult,
): GeneratedSceneResult {
  const index = result.trackSignals.findIndex(
    (signal) => signal.track.id === trackId,
  );
  const existing = new Set(result.trackSignals.map((signal) => signal.track.id));
  const replacement = candidates.trackSignals.find(
    (signal) => !existing.has(signal.track.id),
  );

  if (index < 0 || !replacement) {
    throw new Error("Canal could not find a different replacement track.");
  }

  const signals = [...result.trackSignals];
  signals[index] = replacement;

  return {
    ...rebuildGeneratedScene(result, signals),
    rejectedTrackIds: rejectedIds(result, [trackId]),
  };
}

export function musicCatalogTrackSceneId(
  track: MusicCatalogTrack,
): string {
  return track.reference
    .providerId ===
    "spotify"
    ? track.reference
        .itemId
    : `${track.reference.providerId}:${track.reference.itemId}`;
}

function musicCatalogTrackToGeneratedTrack(
  track: MusicCatalogTrack,
): GeneratedTrackSignal["track"] {
  const trackId =
    musicCatalogTrackSceneId(
      track,
    );

  return {
    id:
      trackId,
    name:
      track.name,
    uri:
      track.reference
        .uri ??
      "",
    duration_ms:
      track.durationMs,
    explicit:
      track.explicit,
    artists:
      track.artists.map(
        (
          artist,
          index,
        ) => ({
          id:
            artist.artistId ??
            `${trackId}-artist-${index}`,
          name:
            artist.name,
          uri:
            "",
        }),
      ),
    ...(track.album
      ? {
          album: {
            id:
              track.album
                .albumId ??
              `${trackId}-album`,
            name:
              track.album
                .name ??
              "",
            uri:
              "",
            ...(track.album.imageUrl
              ? {
                  images: [{
                    url: track.album.imageUrl,
                    height: 300,
                    width: 300,
                  }],
                }
              : {}),
          },
        }
      : {}),
    ...(track.reference
      .providerId ===
      "spotify" &&
    track.reference.webUrl
      ? {
          external_urls: {
            spotify:
              track.reference
                .webUrl,
          },
        }
      : {}),
  };
}

function musicCatalogTrackToSceneTrack(
  track: MusicCatalogTrack,
): SceneTrack {
  return {
    id:
      musicCatalogTrackSceneId(
        track,
      ),
    title:
      track.name,
    artist:
      track.artists
        .map(
          (artist) =>
            artist.name,
        )
        .filter(
          Boolean,
        )
        .join(
          ", ",
        ),
    source:
      `${track.reference.providerId}-search`,
    durationMs:
      track.durationMs,
    ...(track.reference
      .providerId ===
      "spotify"
      ? {
          ...(track.reference
            .uri
            ? {
                spotifyUri:
                  track.reference
                    .uri,
              }
            : {}),
          ...(track.reference
            .webUrl
            ? {
                spotifyUrl:
                  track.reference
                    .webUrl,
              }
            : {}),
        }
      : {}),
  };
}

export function addMusicTrackToGeneratedScene(
  result: GeneratedSceneResult,
  track: MusicCatalogTrack,
): GeneratedSceneResult {
  const trackId =
    musicCatalogTrackSceneId(
      track,
    );

  if (
    result.trackSignals.some(
      (signal) =>
        signal.track.id ===
        trackId,
    )
  ) {
    return result;
  }

  const signal: GeneratedTrackSignal = {
    track:
      musicCatalogTrackToGeneratedTrack(
        track,
      ),

    sources:
      [],

    score:
      100,

    intensity:
      50,

    genres:
      [],
  };

  const nextSignals = [
    ...result.trackSignals,
    signal,
  ];

  const nextTracks = [
    ...result.scene.tracks,
    musicCatalogTrackToSceneTrack(
      track,
    ),
  ];

  const rationale =
    result.rationale.includes(
      "Includes tracks you added directly from music search.",
    )
      ? result.rationale
      : [
          ...result.rationale,

          "Includes tracks you added directly from music search.",
        ];

  const updatedAt =
    new Date().toISOString();

  return {
    ...result,

    scene: {
      ...result.scene,

      tracks:
        nextTracks,

      artists:
        calculateArtists(
          nextSignals,
        ),

      artistSelections:
        calculateArtists(
          nextSignals,
        ),

      updatedAt,
    },

    trackSignals:
      nextSignals,

    rationale,

    sourceBreakdown:
      calculateSourceBreakdown(
        nextSignals,
      ),

    estimatedDurationMinutes:
      calculateDurationMinutes(
        nextSignals,
      ),
  };
}

export function removeTrackFromGeneratedSceneEditor(
  result: GeneratedSceneResult,
  trackId: string,
): GeneratedSceneResult {
  if (
    result.trackSignals.length <=
    1
  ) {
    throw new Error(
      "A Scene must keep at least one track.",
    );
  }

  const nextSignals =
    result.trackSignals.filter(
      (signal) =>
        signal.track.id !==
        trackId,
    );

  const nextTracks =
    result.scene.tracks.filter(
      (track) =>
        track.id !==
        trackId,
    );

  if (
    nextSignals.length ===
    result.trackSignals.length
  ) {
    return result;
  }

  const updatedAt =
    new Date().toISOString();

  return {
    ...result,

    scene: {
      ...result.scene,

      tracks:
        nextTracks,

      artists:
        calculateArtists(
          nextSignals,
        ),

      artistSelections:
        calculateArtists(
          nextSignals,
        ),

      updatedAt,
    },

    trackSignals:
      nextSignals,

    sourceBreakdown:
      calculateSourceBreakdown(
        nextSignals,
      ),

    estimatedDurationMinutes:
      calculateDurationMinutes(
        nextSignals,
      ),
    rejectedTrackIds: rejectedIds(result, [trackId]),
  };
}

export function rejectTrackFromGeneratedSceneEditor(
  result: GeneratedSceneResult,
  trackId: string,
): GeneratedSceneResult {
  return removeTrackFromGeneratedSceneEditor(
    result,
    trackId,
  );
}

export function reorderTrackInGeneratedSceneEditor(
  result: GeneratedSceneResult,
  trackId: string,
  direction: "up" | "down",
): GeneratedSceneResult {
  const currentIndex =
    result.trackSignals.findIndex(
      (signal) =>
        signal.track.id === trackId,
    );
  const nextIndex =
    direction === "up"
      ? currentIndex - 1
      : currentIndex + 1;

  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= result.trackSignals.length
  ) {
    return result;
  }

  const nextSignals = [
    ...result.trackSignals,
  ];
  const [movedSignal] =
    nextSignals.splice(currentIndex, 1);

  nextSignals.splice(nextIndex, 0, movedSignal);

  const trackById = new Map(
    result.scene.tracks.map(
      (track) => [track.id, track],
    ),
  );
  const orderedTracks = nextSignals
    .map((signal) => trackById.get(signal.track.id))
    .filter((track): track is SceneTrack => Boolean(track));
  return {
    ...result,
    scene: {
      ...result.scene,
      tracks: orderedTracks,
      updatedAt: new Date().toISOString(),
    },
    trackSignals: nextSignals,
  };
}
