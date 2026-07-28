import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  addSpotifyItemsToPlaylist,
  createSpotifyPlaylist,
} from "./spotify-api";

import type {
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "./spotify-api";

import type {
  SpotifyLibrarySnapshot,
} from "./spotify-library";

import {
  upsertScene,
} from "./scenes";

import type {
  SceneTrack,
  StoredScene,
} from "./scenes";

export const SCENE_STUDIO_DRAFT_STORAGE_KEY =
  "@canal/scene-studio-draft";

export const SCENE_STUDIO_PREVIEW_STORAGE_KEY =
  "@canal/scene-studio-preview";

export const SCENE_ACTIVITY_OPTIONS = [
  {
    value: "focus",
    label: "Focus",
    description:
      "Concentration, studying, writing, or deep work.",
  },
  {
    value: "workout",
    label: "Workout",
    description:
      "Lifting, running, training, or high-energy movement.",
  },
  {
    value: "commute",
    label: "Commute",
    description:
      "A balanced soundtrack for traveling.",
  },
  {
    value: "unwind",
    label: "Unwind",
    description:
      "Slower music for decompressing and relaxing.",
  },
  {
    value: "party",
    label: "Party",
    description:
      "Recognizable, energetic tracks for a social setting.",
  },
  {
    value: "sleep",
    label: "Sleep",
    description:
      "A soft, low-intensity sequence for winding down.",
  },
  {
    value: "social",
    label: "Social",
    description:
      "Background music for friends, dinner, or conversation.",
  },
  {
    value: "explore",
    label: "Explore",
    description:
      "A more varied route through your existing music taste.",
  },
] as const;

export const SCENE_MOOD_OPTIONS = [
  {
    value: "calm",
    label: "Calm",
  },
  {
    value: "energized",
    label: "Energized",
  },
  {
    value: "confident",
    label: "Confident",
  },
  {
    value: "happy",
    label: "Happy",
  },
  {
    value: "reflective",
    label: "Reflective",
  },
  {
    value: "romantic",
    label: "Romantic",
  },
  {
    value: "moody",
    label: "Moody",
  },
  {
    value: "adventurous",
    label: "Adventurous",
  },
] as const;

export const SCENE_ENERGY_OPTIONS = [
  {
    value: "low",
    label: "Low",
    description:
      "Soft and controlled.",
  },
  {
    value: "medium",
    label: "Medium",
    description:
      "Balanced and flexible.",
  },
  {
    value: "high",
    label: "High",
    description:
      "Louder and more intense.",
  },
] as const;

export const SCENE_FAMILIARITY_OPTIONS = [
  {
    value: "familiar",
    label: "Familiar",
    description:
      "Prioritize your strongest favorites.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description:
      "Mix favorites with less obvious choices.",
  },
  {
    value: "discovery",
    label: "Discovery",
    description:
      "Diversify within your imported Spotify library.",
  },
] as const;

export const SCENE_ARC_OPTIONS = [
  {
    value: "steady",
    label: "Steady",
    description:
      "Keep the intensity relatively consistent.",
  },
  {
    value: "build",
    label: "Build",
    description:
      "Begin more gently and rise over time.",
  },
  {
    value: "waves",
    label: "Waves",
    description:
      "Alternate between stronger and lighter moments.",
  },
] as const;

export const SCENE_GENRE_OPTIONS = [
  "Pop",
  "Hip hop",
  "R&B",
  "Rock",
  "Indie",
  "Electronic",
  "Dance",
  "Afrobeats",
  "Latin",
  "Jazz",
  "Classical",
  "Ambient",
] as const;

export type SceneActivity =
  (typeof SCENE_ACTIVITY_OPTIONS)[number]["value"];

export type SceneMood =
  (typeof SCENE_MOOD_OPTIONS)[number]["value"];

export type SceneEnergy =
  (typeof SCENE_ENERGY_OPTIONS)[number]["value"];

export type SceneFamiliarity =
  (typeof SCENE_FAMILIARITY_OPTIONS)[number]["value"];

export type SceneArc =
  (typeof SCENE_ARC_OPTIONS)[number]["value"];

export type SceneStudioDraft = {
  name: string;
  activity: SceneActivity;
  moods: SceneMood[];
  preferredGenres: string[];
  durationMinutes: number;
  energy: SceneEnergy;
  familiarity: SceneFamiliarity;
  arc: SceneArc;
  includeRecent: boolean;
  allowExplicit: boolean;
  notes: string;
};

export type SceneTrackSource =
  | "top"
  | "saved"
  | "recent"
  | "playlist"
  | "discovery";

export type GeneratedTrackSignal = {
  track: SpotifyTrack;
  sources: SceneTrackSource[];
  score: number;
  intensity: number;
  genres: string[];
};

export type GeneratedSceneSourceBreakdown = {
  top: number;
  saved: number;
  recent: number;
  playlist: number;
  discovery: number;
};

export type GeneratedSceneResult = {
  id: string;
  draft: SceneStudioDraft;
  scene: StoredScene;
  trackSignals: GeneratedTrackSignal[];
  rationale: string[];
  sourceBreakdown: GeneratedSceneSourceBreakdown;
  estimatedDurationMinutes: number;
  createdAt: string;
};

export type SceneSpotifyExportResult = {
  playlist: SpotifyPlaylist;
  trackCount: number;
};

type InternalCandidate = {
  track: SpotifyTrack;
  sources: Set<SceneTrackSource>;
  sourceRanks: Partial<
    Record<SceneTrackSource, number>
  >;
  genres: string[];
  score: number;
  intensity: number;
};

export const DEFAULT_SCENE_STUDIO_DRAFT: SceneStudioDraft = {
  name: "",
  activity: "focus",
  moods: ["calm"],
  preferredGenres: [],
  durationMinutes: 35,
  energy: "medium",
  familiarity: "balanced",
  arc: "build",
  includeRecent: true,
  allowExplicit: false,
  notes: "",
};

const ACTIVITY_GENRE_KEYWORDS: Record<
  SceneActivity,
  string[]
> = {
  focus: [
    "ambient",
    "classical",
    "instrumental",
    "lo-fi",
    "lofi",
    "jazz",
    "soundtrack",
    "piano",
    "study",
    "chill",
  ],

  workout: [
    "hip hop",
    "rap",
    "dance",
    "edm",
    "house",
    "techno",
    "rock",
    "metal",
    "punk",
    "trap",
    "pop",
  ],

  commute: [
    "pop",
    "hip hop",
    "rap",
    "rock",
    "indie",
    "r&b",
    "soul",
    "alternative",
    "electronic",
  ],

  unwind: [
    "ambient",
    "chill",
    "acoustic",
    "soul",
    "jazz",
    "r&b",
    "folk",
    "neo soul",
    "classical",
    "indie",
  ],

  party: [
    "dance",
    "pop",
    "hip hop",
    "rap",
    "house",
    "edm",
    "reggaeton",
    "afrobeats",
    "funk",
    "disco",
    "latin",
  ],

  sleep: [
    "ambient",
    "sleep",
    "piano",
    "classical",
    "meditation",
    "acoustic",
    "soundtrack",
    "chill",
  ],

  social: [
    "soul",
    "r&b",
    "pop",
    "indie",
    "jazz",
    "funk",
    "afrobeats",
    "latin",
    "acoustic",
  ],

  explore: [
    "alternative",
    "experimental",
    "indie",
    "world",
    "electronic",
    "jazz",
    "fusion",
    "art pop",
  ],
};

const MOOD_GENRE_KEYWORDS: Record<
  SceneMood,
  string[]
> = {
  calm: [
    "ambient",
    "chill",
    "acoustic",
    "classical",
    "jazz",
    "soul",
    "piano",
    "folk",
  ],

  energized: [
    "dance",
    "edm",
    "house",
    "hip hop",
    "rap",
    "rock",
    "metal",
    "punk",
    "pop",
  ],

  confident: [
    "hip hop",
    "rap",
    "trap",
    "r&b",
    "pop",
    "rock",
    "afrobeats",
  ],

  happy: [
    "pop",
    "dance",
    "funk",
    "disco",
    "afrobeats",
    "soul",
    "indie pop",
    "latin",
  ],

  reflective: [
    "indie",
    "folk",
    "singer-songwriter",
    "acoustic",
    "soul",
    "jazz",
    "ambient",
    "alternative",
  ],

  romantic: [
    "r&b",
    "soul",
    "jazz",
    "latin",
    "acoustic",
    "pop",
    "neo soul",
  ],

  moody: [
    "alternative",
    "dark pop",
    "indie",
    "trip hop",
    "ambient",
    "post-punk",
    "emo",
    "r&b",
  ],

  adventurous: [
    "experimental",
    "alternative",
    "electronic",
    "world",
    "fusion",
    "indie",
    "psychedelic",
  ],
};

const HIGH_ENERGY_GENRE_KEYWORDS = [
  "dance",
  "edm",
  "house",
  "techno",
  "hip hop",
  "rap",
  "trap",
  "rock",
  "metal",
  "punk",
  "drum and bass",
  "hardcore",
  "reggaeton",
];

const LOW_ENERGY_GENRE_KEYWORDS = [
  "ambient",
  "sleep",
  "meditation",
  "acoustic",
  "classical",
  "piano",
  "folk",
  "chill",
  "lo-fi",
  "lofi",
  "jazz",
];

function createSceneId(): string {
  return (
    "scene-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    Math.max(value, minimum),
    maximum,
  );
}

function normalizeText(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function includesKeyword(
  value: string,
  keywords: string[],
): boolean {
  const normalizedValue =
    normalizeText(value);

  return keywords.some(
    (keyword) =>
      normalizedValue.includes(
        normalizeText(keyword),
      ),
  );
}

function getActivityLabel(
  activity: SceneActivity,
): string {
  return (
    SCENE_ACTIVITY_OPTIONS.find(
      (option) =>
        option.value === activity,
    )?.label ?? "Scene"
  );
}

function getMoodLabel(
  mood: SceneMood,
): string {
  return (
    SCENE_MOOD_OPTIONS.find(
      (option) =>
        option.value === mood,
    )?.label ?? mood
  );
}

function getEnergyTarget(
  energy: SceneEnergy,
): number {
  if (energy === "low") {
    return 30;
  }

  if (energy === "high") {
    return 78;
  }

  return 55;
}

function getTrackDurationMs(
  track: SpotifyTrack,
): number {
  if (
    typeof track.duration_ms ===
      "number" &&
    track.duration_ms > 0
  ) {
    return track.duration_ms;
  }

  return 210_000;
}

function buildArtistGenreMap(
  artists: SpotifyArtist[],
): Map<string, string[]> {
  const map =
    new Map<string, string[]>();

  for (const artist of artists) {
    if (!artist.id) {
      continue;
    }

    map.set(
      artist.id,
      Array.isArray(artist.genres)
        ? artist.genres
        : [],
    );
  }

  return map;
}

function getTrackGenres(
  track: SpotifyTrack,
  artistGenreMap: Map<
    string,
    string[]
  >,
): string[] {
  const genres =
    new Set<string>();

  for (
    const artist of
      track.artists ?? []
  ) {
    const artistGenres =
      artistGenreMap.get(
        artist.id,
      ) ?? [];

    for (
      const genre of
        artistGenres
    ) {
      if (genre.trim()) {
        genres.add(
          genre.trim(),
        );
      }
    }
  }

  return Array.from(genres);
}

function estimateTrackIntensity(
  track: SpotifyTrack,
  genres: string[],
): number {
  let intensity =
    typeof track.popularity ===
    "number"
      ? track.popularity
      : 50;

  for (const genre of genres) {
    if (
      includesKeyword(
        genre,
        HIGH_ENERGY_GENRE_KEYWORDS,
      )
    ) {
      intensity += 8;
    }

    if (
      includesKeyword(
        genre,
        LOW_ENERGY_GENRE_KEYWORDS,
      )
    ) {
      intensity -= 9;
    }
  }

  const title =
    normalizeText(track.name);

  if (
    title.includes("remix") ||
    title.includes("club") ||
    title.includes("workout")
  ) {
    intensity += 7;
  }

  if (
    title.includes("acoustic") ||
    title.includes("piano") ||
    title.includes("sleep")
  ) {
    intensity -= 8;
  }

  return clamp(
    intensity,
    0,
    100,
  );
}

function getSourceBaseScore(
  source: SceneTrackSource,
  rank: number,
): number {
  if (source === "top") {
    return Math.max(
      8,
      42 - rank * 1.25,
    );
  }

  if (source === "saved") {
    return Math.max(
      7,
      30 - rank * 0.65,
    );
  }

  if (source === "playlist") {
    return Math.max(
      6,
      28 - rank * 0.45,
    );
  }

  if (source === "discovery") {
    return Math.max(
      4,
      18 - rank * 0.35,
    );
  }

  return Math.max(
    4,
    23 - rank * 0.7,
  );
}

function getSourceMultiplier(
  source: SceneTrackSource,
  familiarity: SceneFamiliarity,
): number {
  if (
    familiarity === "familiar"
  ) {
    if (source === "top") {
      return 1.45;
    }

    if (source === "saved") {
      return 1.2;
    }

    if (source === "playlist") {
      return 1.15;
    }

    if (source === "discovery") {
      return 0.35;
    }

    return 0.9;
  }

  if (
    familiarity === "discovery"
  ) {
    if (source === "top") {
      return 0.75;
    }

    if (source === "saved") {
      return 1.05;
    }

    if (source === "playlist") {
      return 0.95;
    }

    if (source === "discovery") {
      return 1.55;
    }

    return 1.1;
  }

  if (source === "top") {
    return 1.1;
  }

  if (source === "saved") {
    return 1.05;
  }

  if (source === "playlist") {
    return 1.05;
  }

  if (source === "discovery") {
    return 0.8;
  }

  return 1;
}

function getPrimaryArtistId(
  track: SpotifyTrack,
): string {
  return (
    track.artists?.[0]?.id ??
    track.id
  );
}

function getGenreMatchScore(
  genres: string[],
  draft: SceneStudioDraft,
): number {
  const activityKeywords =
    ACTIVITY_GENRE_KEYWORDS[
      draft.activity
    ];

  const moodKeywords =
    draft.moods.flatMap(
      (mood) =>
        MOOD_GENRE_KEYWORDS[mood],
    );

  let activityMatches = 0;
  let moodMatches = 0;
  let preferredMatches = 0;

  for (const genre of genres) {
    if (
      includesKeyword(
        genre,
        activityKeywords,
      )
    ) {
      activityMatches += 1;
    }

    if (
      includesKeyword(
        genre,
        moodKeywords,
      )
    ) {
      moodMatches += 1;
    }

    if (
      draft.preferredGenres.some(
        (preferredGenre) =>
          includesKeyword(
            genre,
            [preferredGenre],
          ) ||
          includesKeyword(
            preferredGenre,
            [genre],
          ),
      )
    ) {
      preferredMatches += 1;
    }
  }

  return (
    Math.min(
      activityMatches * 5,
      20,
    ) +
    Math.min(
      moodMatches * 3,
      15,
    ) +
    Math.min(
      preferredMatches * 9,
      36,
    )
  );
}

function scoreCandidate(
  candidate: InternalCandidate,
  draft: SceneStudioDraft,
): number {
  let score = 0;

  for (
    const source of
      candidate.sources
  ) {
    const rank =
      candidate.sourceRanks[
        source
      ] ?? 20;

    score +=
      getSourceBaseScore(
        source,
        rank,
      ) *
      getSourceMultiplier(
        source,
        draft.familiarity,
      );
  }

  const energyTarget =
    getEnergyTarget(
      draft.energy,
    );

  const energyDistance =
    Math.abs(
      candidate.intensity -
        energyTarget,
    );

  score += Math.max(
    -8,
    23 -
      energyDistance * 0.43,
  );

  score += getGenreMatchScore(
    candidate.genres,
    draft,
  );

  if (
    draft.familiarity ===
    "discovery"
  ) {
    const popularity =
      candidate.track.popularity ??
      50;

    score +=
      (100 - popularity) *
      0.12;

    if (
      candidate.sources.has(
        "top",
      ) &&
      candidate.sources.size === 1
    ) {
      score -= 7;
    }
  }

  if (
    draft.activity ===
      "sleep" &&
    candidate.intensity > 58
  ) {
    score -= 18;
  }

  if (
    draft.activity ===
      "workout" &&
    candidate.intensity < 45
  ) {
    score -= 15;
  }

  if (
    draft.activity ===
      "party" &&
    candidate.intensity < 52
  ) {
    score -= 10;
  }

  if (
    !draft.allowExplicit &&
    candidate.track.explicit
  ) {
    score -= 1000;
  }

  score += Math.random() * 3;

  return score;
}

function addCandidate(
  map: Map<
    string,
    InternalCandidate
  >,
  track: SpotifyTrack,
  source: SceneTrackSource,
  rank: number,
  artistGenreMap: Map<
    string,
    string[]
  >,
  trackGenreMap: Record<
    string,
    string[]
  >,
): void {
  if (
    !track ||
    !track.id ||
    !track.uri ||
    track.is_local
  ) {
    return;
  }

  const existing =
    map.get(track.id);

  if (existing) {
    existing.sources.add(
      source,
    );

    existing.sourceRanks[
      source
    ] = rank;

    return;
  }

  const genres =
    trackGenreMap[
      track.id
    ] ??
    getTrackGenres(
      track,
      artistGenreMap,
    );

  map.set(
    track.id,
    {
      track,
      sources:
        new Set([
          source,
        ]),
      sourceRanks: {
        [source]: rank,
      },
      genres,
      score: 0,
      intensity:
        estimateTrackIntensity(
          track,
          genres,
        ),
    },
  );
}

function buildCandidatePool(
  draft: SceneStudioDraft,
  snapshot: SpotifyLibrarySnapshot,
): InternalCandidate[] {
  const artistGenreMap =
    buildArtistGenreMap(
      snapshot.topArtists,
    );

  const candidateMap =
    new Map<
      string,
      InternalCandidate
    >();

  snapshot.topTracks.forEach(
    (track, index) => {
      addCandidate(
        candidateMap,
        track,
        "top",
        index + 1,
        artistGenreMap,
        snapshot.trackGenres,
      );
    },
  );

  snapshot.savedTracks.forEach(
    (track, index) => {
      addCandidate(
        candidateMap,
        track,
        "saved",
        index + 1,
        artistGenreMap,
        snapshot.trackGenres,
      );
    },
  );

  if (draft.includeRecent) {
    snapshot.recentTracks.forEach(
      (track, index) => {
        addCandidate(
          candidateMap,
          track,
          "recent",
          index + 1,
          artistGenreMap,
          snapshot.trackGenres,
        );
      },
    );
  }

  snapshot.playlistTracks.forEach(
    (track, index) => {
      addCandidate(
        candidateMap,
        track,
        "playlist",
        index + 1,
        artistGenreMap,
        snapshot.trackGenres,
      );
    },
  );

  snapshot.discoveryTracks.forEach(
    (track, index) => {
      addCandidate(
        candidateMap,
        track,
        "discovery",
        index + 1,
        artistGenreMap,
        snapshot.trackGenres,
      );
    },
  );

  const candidates =
    Array.from(
      candidateMap.values(),
    );

  for (
    const candidate of
      candidates
  ) {
    candidate.score =
      scoreCandidate(
        candidate,
        draft,
      );
  }

  return candidates
    .filter(
      (candidate) =>
        candidate.score >
        -500,
    )
    .sort(
      (first, second) =>
        second.score -
        first.score,
    );
}

function selectTracksForDuration(
  candidates: InternalCandidate[],
  draft: SceneStudioDraft,
): InternalCandidate[] {
  const targetDurationMs =
    draft.durationMinutes *
    60_000;

  const selected:
    InternalCandidate[] = [];

  const selectedIds =
    new Set<string>();

  const artistCounts =
    new Map<string, number>();

  let currentDurationMs = 0;

  const artistLimit =
    draft.familiarity ===
    "familiar"
      ? 3
      : 2;

  const attemptAdd = (
    candidate: InternalCandidate,
    ignoreArtistLimit: boolean,
  ): boolean => {
    if (
      selectedIds.has(
        candidate.track.id,
      )
    ) {
      return false;
    }

    const primaryArtistId =
      getPrimaryArtistId(
        candidate.track,
      );

    const currentArtistCount =
      artistCounts.get(
        primaryArtistId,
      ) ?? 0;

    if (
      !ignoreArtistLimit &&
      currentArtistCount >=
        artistLimit
    ) {
      return false;
    }

    const trackDurationMs =
      getTrackDurationMs(
        candidate.track,
      );

    const nextDurationMs =
      currentDurationMs +
      trackDurationMs;

    if (
      selected.length >= 3 &&
      nextDurationMs >
        targetDurationMs &&
      Math.abs(
        targetDurationMs -
          currentDurationMs,
      ) <=
        Math.abs(
          targetDurationMs -
            nextDurationMs,
        )
    ) {
      return false;
    }

    selected.push(candidate);

    selectedIds.add(
      candidate.track.id,
    );

    artistCounts.set(
      primaryArtistId,
      currentArtistCount + 1,
    );

    currentDurationMs =
      nextDurationMs;

    return true;
  };

  for (
    const candidate of
      candidates
  ) {
    attemptAdd(
      candidate,
      false,
    );

    if (
      currentDurationMs >=
        targetDurationMs &&
      selected.length >= 3
    ) {
      break;
    }
  }

  if (
    currentDurationMs <
    targetDurationMs
  ) {
    for (
      const candidate of
        candidates
    ) {
      attemptAdd(
        candidate,
        true,
      );

      if (
        currentDurationMs >=
          targetDurationMs &&
        selected.length >= 3
      ) {
        break;
      }
    }
  }

  return selected.slice(
    0,
    60,
  );
}

function sequenceSteady(
  tracks: InternalCandidate[],
): InternalCandidate[] {
  return [...tracks].sort(
    (first, second) => {
      const intensityDifference =
        Math.abs(
          first.intensity -
            55,
        ) -
        Math.abs(
          second.intensity -
            55,
        );

      if (
        intensityDifference !== 0
      ) {
        return intensityDifference;
      }

      return (
        second.score -
        first.score
      );
    },
  );
}

function sequenceBuild(
  tracks: InternalCandidate[],
): InternalCandidate[] {
  return [...tracks].sort(
    (first, second) => {
      if (
        first.intensity ===
        second.intensity
      ) {
        return (
          second.score -
          first.score
        );
      }

      return (
        first.intensity -
        second.intensity
      );
    },
  );
}

function sequenceWaves(
  tracks: InternalCandidate[],
): InternalCandidate[] {
  const sorted =
    [...tracks].sort(
      (first, second) =>
        first.intensity -
        second.intensity,
    );

  const result:
    InternalCandidate[] = [];

  let lowIndex = 0;
  let highIndex =
    sorted.length - 1;

  let takeHigh = false;

  while (
    lowIndex <= highIndex
  ) {
    if (takeHigh) {
      result.push(
        sorted[highIndex],
      );

      highIndex -= 1;
    } else {
      result.push(
        sorted[lowIndex],
      );

      lowIndex += 1;
    }

    takeHigh = !takeHigh;
  }

  return result;
}

function sequenceCandidates(
  tracks: InternalCandidate[],
  draft: SceneStudioDraft,
): InternalCandidate[] {
  if (
    draft.activity ===
      "sleep" ||
    draft.energy === "low"
  ) {
    return [...tracks].sort(
      (first, second) =>
        second.intensity -
        first.intensity,
    );
  }

  if (draft.arc === "build") {
    return sequenceBuild(
      tracks,
    );
  }

  if (draft.arc === "waves") {
    return sequenceWaves(
      tracks,
    );
  }

  return sequenceSteady(
    tracks,
  );
}

function getSourceBreakdown(
  signals: GeneratedTrackSignal[],
): GeneratedSceneSourceBreakdown {
  const breakdown:
    GeneratedSceneSourceBreakdown = {
    top: 0,
    saved: 0,
    recent: 0,
    playlist: 0,
    discovery: 0,
  };

  for (
    const signal of signals
  ) {
    for (
      const source of
        signal.sources
    ) {
      breakdown[source] += 1;
    }
  }

  return breakdown;
}

function getSelectedGenres(
  signals: GeneratedTrackSignal[],
  fallbackGenres: string[],
): string[] {
  const genreCounts =
    new Map<string, number>();

  for (
    const signal of
      signals
  ) {
    for (
      const genre of
        signal.genres
    ) {
      const normalized =
        genre.trim();

      if (!normalized) {
        continue;
      }

      genreCounts.set(
        normalized,
        (genreCounts.get(
          normalized,
        ) ?? 0) + 1,
      );
    }
  }

  const selected =
    Array.from(
      genreCounts.entries(),
    )
      .sort(
        (first, second) =>
          second[1] -
          first[1],
      )
      .map(
        ([genre]) =>
          genre,
      )
      .slice(0, 5);

  if (
    selected.length > 0
  ) {
    return selected;
  }

  return fallbackGenres
    .map(
      (genre) =>
        genre.trim(),
    )
    .filter(Boolean)
    .slice(0, 5);
}

function getSelectedArtists(
  signals: GeneratedTrackSignal[],
): string[] {
  const names =
    new Set<string>();

  for (
    const signal of
      signals
  ) {
    for (
      const artist of
        signal.track.artists ??
        []
    ) {
      if (artist.name.trim()) {
        names.add(
          artist.name.trim(),
        );
      }
    }
  }

  return Array.from(names)
    .slice(0, 8);
}

function buildSceneTrack(
  signal: GeneratedTrackSignal,
): SceneTrack {
  return {
    id:
      signal.track.id,

    title:
      signal.track.name,

    artist:
      signal.track.artists
        .map(
          (artist) =>
            artist.name,
        )
        .join(", "),

    source:
      signal.sources.join(
        "+",
      ),

    spotifyUri:
      signal.track.uri,

    spotifyUrl:
      signal.track
        .external_urls
        ?.spotify,

    durationMs:
      getTrackDurationMs(
        signal.track,
      ),

    intensity:
      signal.intensity,
  };
}

function estimateDurationMinutes(
  signals: GeneratedTrackSignal[],
): number {
  const durationMs =
    signals.reduce(
      (total, signal) =>
        total +
        getTrackDurationMs(
          signal.track,
        ),
      0,
    );

  return Math.max(
    1,
    Math.round(
      durationMs / 60_000,
    ),
  );
}

function buildDefaultSceneName(
  draft: SceneStudioDraft,
): string {
  const activity =
    getActivityLabel(
      draft.activity,
    );

  const mood =
    draft.moods.length > 0
      ? getMoodLabel(
          draft.moods[0],
        )
      : "";

  if (mood) {
    return `${mood} ${activity}`;
  }

  return `${activity} Scene`;
}

function buildRationale(
  draft: SceneStudioDraft,
  signals: GeneratedTrackSignal[],
  genres: string[],
): string[] {
  const rationale: string[] =
    [];

  rationale.push(
    `Built for ${getActivityLabel(
      draft.activity,
    ).toLowerCase()} with ${draft.energy} energy.`,
  );

  if (
    draft.moods.length > 0
  ) {
    rationale.push(
      `Mood direction: ${draft.moods
        .map(getMoodLabel)
        .join(", ")}.`,
    );
  }

  if (
    genres.length > 0
  ) {
    rationale.push(
      `The strongest matching genre signals were ${genres
        .slice(0, 4)
        .join(", ")}.`,
    );
  }

  if (
    draft.familiarity ===
    "familiar"
  ) {
    rationale.push(
      "The sequence prioritizes your strongest top-track and saved-track signals.",
    );
  } else if (
    draft.familiarity ===
    "discovery"
  ) {
    rationale.push(
      "The sequence increases artist variety and favors less obvious tracks already present in your imported library.",
    );
  } else {
    rationale.push(
      "The sequence balances familiar favorites with broader library signals.",
    );
  }

  if (draft.arc === "build") {
    rationale.push(
      "Tracks are ordered to rise in estimated intensity over time.",
    );
  } else if (
    draft.arc === "waves"
  ) {
    rationale.push(
      "Tracks alternate between lighter and stronger intensity.",
    );
  } else {
    rationale.push(
      "Tracks are ordered to keep the estimated intensity relatively steady.",
    );
  }

  if (
    !draft.allowExplicit
  ) {
    rationale.push(
      "Explicit tracks were excluded.",
    );
  }

  rationale.push(
    `${signals.length} tracks were selected for approximately ${estimateDurationMinutes(
      signals,
    )} minutes.`,
  );

  return rationale;
}

export async function writeSceneStudioDraft(
  draft: SceneStudioDraft,
): Promise<void> {
  await AsyncStorage.setItem(
    SCENE_STUDIO_DRAFT_STORAGE_KEY,
    JSON.stringify(draft),
  );
}

export async function clearSceneStudioDraft(): Promise<void> {
  await AsyncStorage.removeItem(
    SCENE_STUDIO_DRAFT_STORAGE_KEY,
  );
}

export async function readSceneStudioDraft(): Promise<
  SceneStudioDraft
> {
  const serialized =
    await AsyncStorage.getItem(
      SCENE_STUDIO_DRAFT_STORAGE_KEY,
    );

  if (!serialized) {
    return {
      ...DEFAULT_SCENE_STUDIO_DRAFT,
      moods: [
        ...DEFAULT_SCENE_STUDIO_DRAFT.moods,
      ],
      preferredGenres: [
        ...DEFAULT_SCENE_STUDIO_DRAFT.preferredGenres,
      ],
    };
  }

  try {
    const parsed =
      JSON.parse(serialized) as
        Partial<SceneStudioDraft>;

    return {
      ...DEFAULT_SCENE_STUDIO_DRAFT,
      ...parsed,

      moods:
        Array.isArray(
          parsed.moods,
        ) &&
        parsed.moods.length > 0
          ? parsed.moods
          : [
              ...DEFAULT_SCENE_STUDIO_DRAFT.moods,
            ],

      preferredGenres:
        Array.isArray(
          parsed.preferredGenres,
        )
          ? parsed.preferredGenres
              .filter(
                (
                  genre,
                ): genre is string =>
                  typeof genre ===
                    "string" &&
                  Boolean(
                    genre.trim(),
                  ),
              )
              .map(
                (genre) =>
                  genre.trim(),
              )
              .slice(0, 5)
          : [],
    };
  } catch {
    return {
      ...DEFAULT_SCENE_STUDIO_DRAFT,
      moods: [
        ...DEFAULT_SCENE_STUDIO_DRAFT.moods,
      ],
      preferredGenres: [
        ...DEFAULT_SCENE_STUDIO_DRAFT.preferredGenres,
      ],
    };
  }
}

export async function writeGeneratedScenePreview(
  result: GeneratedSceneResult,
): Promise<void> {
  await AsyncStorage.setItem(
    SCENE_STUDIO_PREVIEW_STORAGE_KEY,
    JSON.stringify(result),
  );
}

export async function readGeneratedScenePreview(): Promise<
  GeneratedSceneResult | null
> {
  const serialized =
    await AsyncStorage.getItem(
      SCENE_STUDIO_PREVIEW_STORAGE_KEY,
    );

  if (!serialized) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(serialized) as
        GeneratedSceneResult;

    if (
      !parsed ||
      !parsed.scene ||
      !Array.isArray(
        parsed.trackSignals,
      )
    ) {
      return null;
    }

    return {
      ...parsed,

      draft: {
        ...DEFAULT_SCENE_STUDIO_DRAFT,
        ...parsed.draft,
        moods:
          Array.isArray(
            parsed.draft?.moods,
          )
            ? parsed.draft.moods
            : [
                ...DEFAULT_SCENE_STUDIO_DRAFT.moods,
              ],
        preferredGenres:
          Array.isArray(
            parsed.draft
              ?.preferredGenres,
          )
            ? parsed.draft.preferredGenres
            : [],
      },

      sourceBreakdown: {
        top:
          parsed.sourceBreakdown
            ?.top ??
          0,
        saved:
          parsed.sourceBreakdown
            ?.saved ??
          0,
        recent:
          parsed.sourceBreakdown
            ?.recent ??
          0,
        playlist:
          parsed.sourceBreakdown
            ?.playlist ??
          0,
        discovery:
          parsed.sourceBreakdown
            ?.discovery ??
          0,
      },
    };
  } catch {
    return null;
  }
}

export async function clearGeneratedScenePreview(): Promise<void> {
  await AsyncStorage.removeItem(
    SCENE_STUDIO_PREVIEW_STORAGE_KEY,
  );
}

export function generateSceneFromSpotify(
  draft: SceneStudioDraft,
  snapshot: SpotifyLibrarySnapshot,
): GeneratedSceneResult {
  const candidatePool =
    buildCandidatePool(
      draft,
      snapshot,
    );

  if (
    candidatePool.length === 0
  ) {
    throw new Error(
      "Canal could not find usable Spotify tracks. Sync Spotify again or allow explicit tracks.",
    );
  }

  const selected =
    selectTracksForDuration(
      candidatePool,
      draft,
    );

  if (
    selected.length === 0
  ) {
    throw new Error(
      "Canal could not select tracks for this Scene.",
    );
  }

  const sequenced =
    sequenceCandidates(
      selected,
      draft,
    );

  const signals:
    GeneratedTrackSignal[] =
    sequenced.map(
      (candidate) => ({
        track:
          candidate.track,

        sources:
          Array.from(
            candidate.sources,
          ),

        score:
          Math.round(
            candidate.score *
              10,
          ) / 10,

        intensity:
          Math.round(
            candidate.intensity,
          ),

        genres:
          candidate.genres,
      }),
    );

  const selectedGenres =
    Array.from(
      new Set([
        ...draft.preferredGenres,
        ...getSelectedGenres(
          signals,
          snapshot.topGenres.map(
            (genre) =>
              genre.name,
          ),
        ),
      ]),
    ).slice(0, 8);

  const selectedArtists =
    getSelectedArtists(
      signals,
    );

  const now =
    new Date().toISOString();

  const id =
    createSceneId();

  const sceneName =
    draft.name.trim() ||
    buildDefaultSceneName(
      draft,
    );

  const scene: StoredScene = {
    id,

    name:
      sceneName,

    activity:
      getActivityLabel(
        draft.activity,
      ),

    duration:
      `${draft.durationMinutes} minutes`,

    emotions:
      draft.moods
        .map(getMoodLabel)
        .join(", "),

    genres:
      selectedGenres.join(
        ", ",
      ),

    energy:
      draft.energy,

    familiarity:
      draft.familiarity,

    artists:
      selectedArtists.join(
        ", ",
      ),

    artistSelections:
      selectedArtists.join(
        ", ",
      ),

    songRequest:
      draft.notes.trim(),

    avoid:
      draft.allowExplicit
        ? ""
        : "Explicit tracks",

    collaborators: [],

    tracks:
      signals.map(
        buildSceneTrack,
      ),

    visibility:
      "private",

    createdAt:
      now,

    updatedAt:
      now,

    libraryType:
      "created",
  };

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
    scene,
    trackSignals:
      signals,
    rationale:
      buildRationale(
        draft,
        signals,
        selectedGenres,
      ),

    sourceBreakdown:
      getSourceBreakdown(
        signals,
      ),

    estimatedDurationMinutes:
      estimateDurationMinutes(
        signals,
      ),

    createdAt:
      now,
  };
}

export function removeTrackFromGeneratedScene(
  result: GeneratedSceneResult,
  trackId: string,
): GeneratedSceneResult {
  const remainingSignals =
    result.trackSignals.filter(
      (signal) =>
        signal.track.id !==
        trackId,
    );

  if (
    remainingSignals.length <
    3
  ) {
    throw new Error(
      "A Scene must keep at least three tracks.",
    );
  }

  const updatedAt =
    new Date().toISOString();

  const updatedScene: StoredScene = {
    ...result.scene,

    tracks:
      remainingSignals.map(
        buildSceneTrack,
      ),

    updatedAt,
  };

  return {
    ...result,

    scene:
      updatedScene,

    trackSignals:
      remainingSignals,

    sourceBreakdown:
      getSourceBreakdown(
        remainingSignals,
      ),

    estimatedDurationMinutes:
      estimateDurationMinutes(
        remainingSignals,
      ),

    rationale:
      buildRationale(
        result.draft,
        remainingSignals,
        result.scene.genres
          .split(",")
          .map(
            (genre) =>
              genre.trim(),
          )
          .filter(Boolean),
      ),
  };
}

export async function saveGeneratedSceneToLibrary(
  result: GeneratedSceneResult,
  visibility: "private" | "public" = "private",
): Promise<StoredScene> {
  const now =
    new Date().toISOString();

  const sceneToSave:
    StoredScene = {
    ...result.scene,

    visibility,

    updatedAt:
      now,

    libraryType:
      "created",
  };

  const savedScene =
    await upsertScene(
      sceneToSave,
    );

  return savedScene;
}

export async function exportGeneratedSceneToSpotify(
  result: GeneratedSceneResult,
): Promise<SceneSpotifyExportResult> {
  const uris =
    Array.from(
      new Set(
        result.trackSignals
          .map(
            (signal) =>
              signal.track.uri,
          )
          .filter(
            (uri) =>
              typeof uri ===
                "string" &&
              uri.startsWith(
                "spotify:track:",
              ),
          ),
      ),
    );

  if (
    uris.length === 0
  ) {
    throw new Error(
      "This Scene does not contain Spotify tracks that can be exported.",
    );
  }

  const playlist =
    await createSpotifyPlaylist({
      name:
        `Canal: ${result.scene.name}`,

      description:
        `A private Scene created in Canal for ${result.scene.activity.toLowerCase()}.`,

      isPublic:
        false,
    });

  await addSpotifyItemsToPlaylist(
    playlist.id,
    uris,
  );

  return {
    playlist,
    trackCount:
      uris.length,
  };
}
