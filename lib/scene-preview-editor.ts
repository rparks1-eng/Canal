import type {
  GeneratedSceneResult,
  GeneratedTrackSignal,
} from "./scene-studio";

import type {
  SpotifySceneSearchTrack,
} from "./spotify-scene-tools";

import {
  spotifySearchTrackToSceneTrack,
} from "./spotify-scene-tools";

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

export function addSpotifyTrackToGeneratedScene(
  result: GeneratedSceneResult,
  track: SpotifySceneSearchTrack,
): GeneratedSceneResult {
  if (
    result.trackSignals.some(
      (signal) =>
        signal.track.id ===
        track.id,
    )
  ) {
    return result;
  }

  const signal: GeneratedTrackSignal = {
    track:
      track as unknown as GeneratedTrackSignal["track"],

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
    spotifySearchTrackToSceneTrack(
      track,
    ),
  ];

  const rationale =
    result.rationale.includes(
      "Includes tracks you added directly from Spotify search.",
    )
      ? result.rationale
      : [
          ...result.rationale,

          "Includes tracks you added directly from Spotify search.",
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
