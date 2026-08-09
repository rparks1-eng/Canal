import type {
  GeneratedSceneResult,
  SceneStudioDraft,
} from "./scene-studio";

import {
  generateCreativeSceneName,
} from "./creative-names";

function displayLabel(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .replace(
        /[-_]+/gu,
        " ",
      );

  return normalized
    ? normalized.replace(
        /\b\p{L}/gu,
        (character) =>
          character.toLocaleUpperCase(),
      )
    : "Personal";
}

function createManualSceneId(): string {
  return [
    "manual-scene",
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 9),
  ].join("-");
}

function preserveChosenTrackSignals(
  current: GeneratedSceneResult,
): GeneratedTrackSignal[] {
  const signalsById = new Map(
    scrubGeneratedSignals(current.trackSignals).map((signal) => [
      signal.track.id,
      signal,
    ]),
  );

  return current.scene.tracks.map((track) =>
    signalsById.get(track.id) ?? {
      track: {
        id: track.id,
        name: track.title,
        uri: track.spotifyUri ?? `spotify:track:${track.id}`,
        duration_ms: track.durationMs,
        artists: [{
          id: track.artist,
          name: track.artist,
          uri: `spotify:artist:${track.artist}`,
        }],
        ...(track.imageUrl
          ? {
              album: {
                id: `${track.id}-album`,
                name: track.title,
                uri: `spotify:album:${track.id}`,
                images: [{ url: track.imageUrl }],
              },
            }
          : {}),
      },
      sources: [],
      score: 100,
      intensity: track.intensity ?? 50,
      genres: [],
    },
  );
}

/**
 * Starts a provider-neutral Scene shell from choices the listener made in
 * Studio. It deliberately contains no provider tracks, links, or inferred
 * taste data; tracks enter only through a later explicit user selection.
 */
export function createUserDirectedScenePreview(
  draft: SceneStudioDraft,
  options: {
    id?: string;
    createdAt?: string;
  } = {},
): GeneratedSceneResult {
  const id =
    options.id?.trim() ||
    createManualSceneId();
  const createdAt =
    options.createdAt ??
    new Date().toISOString();
  const activity =
    displayLabel(
      draft.activity,
    );
  const name =
    draft.name.trim() ||
    generateCreativeSceneName(
      {
        activity: draft.activity,
        moods: draft.moods,
        energy: draft.energy,
        arc: draft.arc,
        genres: draft.preferredGenres,
      },
      { seed: id },
    );

  return {
    id,
    draft: {
      ...draft,
      moods: [
        ...draft.moods,
      ],
      preferredGenres: [
        ...draft.preferredGenres,
      ],
    },
    scene: {
      id,
      name,
      activity,
      duration:
        `${draft.durationMinutes} minutes`,
      emotions:
        draft.moods
          .map(
            displayLabel,
          )
          .join(", "),
      genres:
        draft.preferredGenres
          .join(", "),
      energy:
        draft.energy,
      familiarity:
        draft.familiarity,
      artists:
        "",
      artistSelections:
        "",
      songRequest:
        draft.notes.trim(),
      avoid:
        draft.allowExplicit
          ? ""
          : "Explicit tracks",
      collaborators: [],
      tracks: [],
      visibility:
        "private",
      createdAt,
      updatedAt:
        createdAt,
      libraryType:
        "created",
    },
    trackSignals: [],
    rationale: [
      "You choose every track in this Scene; Canal does not generate a provider mix.",
    ],
    sourceBreakdown: {
      top: 0,
      saved: 0,
      recent: 0,
      playlist: 0,
      discovery: 0,
    },
    estimatedDurationMinutes: 0,
    createdAt,
  };
}
