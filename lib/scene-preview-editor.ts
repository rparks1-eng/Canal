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
  };
}
