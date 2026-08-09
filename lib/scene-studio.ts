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

import {
  generateCreativeSceneName,
} from "./creative-names";

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
    palette: "living-verdant",
    description:
      "Concentration, studying, writing, or deep work.",
  },
  {
    value: "workout",
    label: "Workout",
    palette: "living-ember",
    description:
      "Lifting, running, training, or high-energy movement.",
  },
  {
    value: "commute",
    label: "Commute",
    palette: "living-cobalt",
    description:
      "A balanced soundtrack for traveling.",
  },
  {
    value: "unwind",
    label: "Unwind",
    palette: "living-tide",
    description:
      "Slower music for decompressing and relaxing.",
  },
  {
    value: "party",
    label: "Party",
    palette: "living-ember",
    description:
      "Recognizable, energetic tracks for a social setting.",
  },
  {
    value: "sleep",
    label: "Sleep",
    palette: "living-tide",
    description:
      "A soft, low-intensity sequence for winding down.",
  },
  {
    value: "social",
    label: "Social",
    palette: "living-rose",
    description:
      "Background music for friends, dinner, or conversation.",
  },
  {
    value: "explore",
    label: "Explore",
    palette: "living-violet",
    description:
      "A more varied route through your existing music taste.",
  },
  {
    value: "morning",
    label: "Start the day",
    palette: "living-solar",
    description: "A bright reset for waking up and getting moving.",
  },
  {
    value: "cook",
    label: "Cook",
    palette: "living-copper",
    description: "A warm, rhythmic backdrop for the kitchen.",
  },
  {
    value: "create",
    label: "Create",
    palette: "living-violet",
    description: "Imaginative music for making, drawing, or brainstorming.",
  },
  {
    value: "date",
    label: "Date night",
    palette: "living-rose",
    description: "Close, warm music for a shared evening.",
  },
  {
    value: "outdoors",
    label: "Get outside",
    palette: "living-verdant",
    description: "Open-air energy for walking, hiking, or a day outside.",
  },
  {
    value: "reading",
    label: "Read",
    palette: "living-silver",
    description: "Detailed but unobtrusive music for reading.",
  },
  {
    value: "gaming",
    label: "Gaming",
    palette: "living-cobalt",
    description: "Immersive momentum for playing or competing.",
  },
  {
    value: "recovery",
    label: "Stretch & recover",
    palette: "living-tide",
    description: "Gentle pacing for stretching, cooling down, or healing.",
  },
] as const;

export const SCENE_MOOD_OPTIONS = [
  {
    value: "warm",
    label: "Warm",
    palette: "living-copper",
  },
  {
    value: "social",
    label: "Outgoing",
    palette: "living-rose",
  },
  {
    value: "calm",
    label: "Calm",
    palette: "living-tide",
  },
  {
    value: "clear",
    label: "Clear-headed",
    palette: "living-tide",
  },
  {
    value: "energized",
    label: "Energized",
    palette: "living-ember",
  },
  {
    value: "confident",
    label: "Confident",
    palette: "living-cobalt",
  },
  {
    value: "happy",
    label: "Joyful",
    palette: "living-solar",
  },
  {
    value: "reflective",
    label: "Reflective",
    palette: "living-silver",
  },
  {
    value: "romantic",
    label: "Romantic",
    palette: "living-rose",
  },
  {
    value: "moody",
    label: "Brooding",
    palette: "living-midnight",
  },
  {
    value: "adventurous",
    label: "Adventurous",
    palette: "living-violet",
  },
  {
    value: "euphoric",
    label: "Euphoric",
    palette: "living-solar",
  },
  {
    value: "dreamy",
    label: "Dreamy",
    palette: "living-violet",
  },
  {
    value: "intimate",
    label: "Intimate",
    palette: "living-rose",
  },
  {
    value: "nostalgic",
    label: "Nostalgic",
    palette: "living-copper",
  },
  {
    value: "grounded",
    label: "Grounded",
    palette: "living-verdant",
  },
  {
    value: "playful",
    label: "Playful",
    palette: "living-solar",
  },
  {
    value: "restless",
    label: "Restless",
    palette: "living-ember",
  },
  { value: "serene", label: "Serene", palette: "living-tide" },
  { value: "hopeful", label: "Hopeful", palette: "living-solar" },
  { value: "bittersweet", label: "Bittersweet", palette: "living-silver" },
  { value: "cozy", label: "Cozy", palette: "living-copper" },
  { value: "fierce", label: "Fierce", palette: "living-ember" },
  { value: "curious", label: "Curious", palette: "living-violet" },
  { value: "sensual", label: "Sensual", palette: "living-rose" },
  { value: "celebratory", label: "Celebratory", palette: "living-solar" },
  { value: "rebellious", label: "Rebellious", palette: "living-midnight" },
  { value: "focused", label: "Locked in", palette: "living-verdant" },
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
  "Indie pop",
  "Dream pop",
  "Synth-pop",
  "Art pop",
  "Hip hop",
  "Alternative hip hop",
  "Trap",
  "Lo-fi hip hop",
  "R&B",
  "Alternative R&B",
  "Neo-soul",
  "Quiet storm",
  "Rock",
  "Alternative rock",
  "Indie rock",
  "Classic rock",
  "Psychedelic rock",
  "Post-punk",
  "Punk",
  "Emo",
  "Metal",
  "Indie",
  "Folk",
  "Singer-songwriter",
  "Americana",
  "Electronic",
  "Electronica",
  "House",
  "Deep house",
  "Techno",
  "Drum and bass",
  "UK garage",
  "Dance",
  "Disco",
  "Afrobeats",
  "Afropop",
  "Amapiano",
  "Latin",
  "Reggaeton",
  "Salsa",
  "Bachata",
  "Bossa nova",
  "Jazz",
  "Vocal jazz",
  "Jazz fusion",
  "Classical",
  "Modern classical",
  "Chamber music",
  "Ambient",
  "Drone",
  "New age",
  "Chillout",
  "Soul",
  "Psychedelic soul",
  "Gospel",
  "Funk",
  "Country",
  "Bluegrass",
  "Reggae",
  "Dancehall",
  "Dub",
  "Ska",
  "Grime",
  "Shoegaze",
  "Trip hop",
  "Downtempo",
  "Industrial",
  "Soundtrack",
  "Musical theatre",
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
  allowAdjacentGenres: boolean;
  durationMinutes: number;
  energy: SceneEnergy;
  familiarity: SceneFamiliarity;
  familiarityLevel: number;
  arc: SceneArc;
  includeRecent: boolean;
  allowExplicit: boolean;
  avoidRecentSceneTracks?: boolean;
  smoothTransitions?: boolean;
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
  genreMatch?: GeneratedTrackGenreMatch;
};

export type SceneGenreFamily =
  | "pop"
  | "hip-hop"
  | "r&b"
  | "rock"
  | "indie"
  | "electronic"
  | "dance"
  | "afrobeats"
  | "latin"
  | "jazz"
  | "classical"
  | "ambient"
  | "country"
  | "reggae";

export type GeneratedTrackGenreMatch = {
  confidence: "high" | "low" | "unscoped";
  detectedFamilies: SceneGenreFamily[];
  matchedFamilies: SceneGenreFamily[];
  whyMatched: string;
};

export type GeneratedSceneSelectionStatus = {
  underfilled: boolean;
  requestedDurationMinutes: number;
  selectedDurationMinutes: number;
  action: "none" | "shorten-duration" | "broaden-genres-or-shorten-duration";
  message: string;
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
  selectionStatus?: GeneratedSceneSelectionStatus;
  rejectedTrackIds?: string[];
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
  moods: [],
  preferredGenres: [],
  allowAdjacentGenres: false,
  durationMinutes: 35,
  energy: "medium",
  familiarity: "balanced",
  familiarityLevel: 50,
  arc: "build",
  includeRecent: true,
  allowExplicit: false,
  avoidRecentSceneTracks: true,
  smoothTransitions: true,
  notes: "",
};

/**
 * Creates a detached default value for the scoped Studio repository. The
 * repository deliberately does not read or migrate the former singleton keys.
 */
export function createSceneStudioDraft(): SceneStudioDraft {
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
  morning: ["pop", "soul", "indie pop", "funk", "acoustic", "disco"],
  cook: ["soul", "funk", "jazz", "folk", "r&b", "latin", "disco"],
  create: ["alternative", "art pop", "ambient", "electronic", "indie", "experimental"],
  date: ["r&b", "neo soul", "soul", "jazz", "slow jam", "latin", "acoustic"],
  outdoors: ["folk", "indie", "acoustic", "americana", "roots", "alternative"],
  reading: ["classical", "ambient", "piano", "jazz", "instrumental", "lo-fi"],
  gaming: ["electronic", "soundtrack", "hip hop", "rock", "drum and bass", "synthwave"],
  recovery: ["ambient", "chill", "acoustic", "neo soul", "piano", "downtempo"],
};

const MOOD_GENRE_KEYWORDS: Record<
  SceneMood,
  string[]
> = {
  warm: [
    "soul",
    "r&b",
    "acoustic",
    "jazz",
    "folk",
    "neo soul",
  ],

  social: [
    "pop",
    "funk",
    "disco",
    "r&b",
    "afrobeats",
    "dance",
  ],
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

  clear: [
    "ambient",
    "acoustic",
    "classical",
    "indie pop",
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

  euphoric: [
    "dance",
    "house",
    "electronic",
    "pop",
    "trance",
    "disco",
  ],

  dreamy: [
    "dream pop",
    "ambient",
    "shoegaze",
    "indie",
    "psychedelic",
    "chill",
  ],

  intimate: [
    "acoustic",
    "soul",
    "r&b",
    "singer-songwriter",
    "jazz",
    "folk",
  ],

  nostalgic: [
    "soul",
    "old school",
    "classic rock",
    "disco",
    "retro",
    "synthwave",
  ],

  grounded: [
    "folk",
    "acoustic",
    "soul",
    "jazz",
    "ambient",
    "roots",
  ],

  playful: [
    "pop",
    "funk",
    "dance",
    "indie pop",
    "disco",
    "afrobeats",
  ],

  restless: [
    "punk",
    "electronic",
    "rock",
    "drum and bass",
    "industrial",
    "alternative",
  ],
  serene: ["ambient", "classical", "piano", "chill", "acoustic", "meditation"],
  hopeful: ["pop", "soul", "gospel", "indie pop", "folk", "dance"],
  bittersweet: ["indie", "singer-songwriter", "soul", "folk", "alternative", "piano"],
  cozy: ["soul", "folk", "acoustic", "jazz", "neo soul", "soft rock"],
  fierce: ["rock", "metal", "punk", "hip hop", "rap", "electronic"],
  curious: ["experimental", "art pop", "jazz", "electronic", "alternative", "world"],
  sensual: ["r&b", "neo soul", "slow jam", "jazz", "latin", "trip hop"],
  celebratory: ["dance", "pop", "disco", "funk", "afrobeats", "latin"],
  rebellious: ["punk", "rock", "trap", "industrial", "post-punk", "hip hop"],
  focused: ["ambient", "instrumental", "lo-fi", "classical", "piano", "minimal"],
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

export function sceneFamiliarityFromLevel(
  value: number,
): SceneFamiliarity {
  const level = clamp(
    Number.isFinite(value)
      ? value
      : 50,
    0,
    100,
  );

  if (level <= 33) {
    return "familiar";
  }

  if (level >= 67) {
    return "discovery";
  }

  return "balanced";
}

export function getSceneFamiliarityLevel(
  draft: Pick<
    SceneStudioDraft,
    | "familiarity"
    | "familiarityLevel"
  >,
): number {
  if (
    Number.isFinite(
      draft.familiarityLevel,
    )
  ) {
    return Math.round(
      clamp(
        draft.familiarityLevel,
        0,
        100,
      ),
    );
  }

  if (draft.familiarity === "familiar") {
    return 0;
  }

  if (draft.familiarity === "discovery") {
    return 100;
  }

  return 50;
}

function normalizeText(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

const SCENE_DIRECTION_STOP_WORDS = new Set([
  "and", "for", "from", "have", "leave", "music", "that", "the",
  "this", "to", "with", "without",
]);

/** Uses the optional Direct Canal note as a bounded candidate-ranking signal. */
export function scoreSceneDirectionText(
  notes: string,
  searchableTrackText: string,
): number {
  const normalizedTrack = ` ${normalizeText(searchableTrackText)} `;
  if (!notes.trim() || normalizedTrack.trim().length === 0) return 0;

  let score = 0;
  for (const clause of notes.split(/[,.;\n]+/u)) {
    const normalizedClause = normalizeText(clause);
    if (!normalizedClause) continue;

    const excluded = /^(?:no|avoid|without)\s+/u.test(normalizedClause);
    const words = normalizedClause
      .replace(/^(?:no|avoid|without)\s+/u, "")
      .split(" ")
      .filter((word) => word.length >= 3 && !SCENE_DIRECTION_STOP_WORDS.has(word))
      .slice(0, 8);
    const matches = words.filter((word) => normalizedTrack.includes(` ${word} `)).length;
    score += excluded ? matches * -48 : Math.min(matches * 9, 27);
  }

  return score;
}

const GENRE_FAMILY_PATTERNS: readonly (
  readonly [SceneGenreFamily, readonly string[]]
)[] = [
  ["hip-hop", ["hip hop", "rap", "trap", "grime"]],
  ["r&b", ["r and b", "rnb", "rhythm and blues", "neo soul", "soul", "quiet storm", "gospel"]],
  ["rock", ["rock", "metal", "punk", "emo", "shoegaze", "industrial"]],
  ["pop", ["pop", "musical theatre"]],
  ["indie", ["indie", "alternative", "folk", "singer songwriter", "shoegaze"]],
  ["electronic", ["electronic", "electronica", "edm", "house", "techno", "drum and bass", "uk garage", "trip hop"]],
  ["dance", ["dance", "disco", "funk"]],
  ["afrobeats", ["afrobeats", "afrobeat", "afropop", "amapiano"]],
  ["latin", ["latin", "reggaeton", "salsa", "bachata", "bossa nova"]],
  ["jazz", ["jazz"]],
  ["classical", ["classical", "orchestra", "chamber", "soundtrack"]],
  ["ambient", ["ambient", "chill", "lo fi", "lofi", "sleep", "meditation", "drone", "new age", "downtempo"]],
  ["country", ["country", "americana", "bluegrass", "honky tonk"]],
  ["reggae", ["reggae", "dancehall", "dub", "ska"]],
];

export function normalizeSceneGenreFamilies(
  genres: readonly string[],
): SceneGenreFamily[] {
  const families = new Set<SceneGenreFamily>();

  for (const genre of genres) {
    const normalizedGenre = normalizeText(genre);
    const detectedInGenre = new Set<SceneGenreFamily>();

    for (const [family, patterns] of GENRE_FAMILY_PATTERNS) {
      if (
        patterns.some((pattern) =>
          (` ${normalizedGenre} `).includes(` ${pattern} `),
        )
      ) {
        detectedInGenre.add(family);
      }
    }

    // Indie/alternative-rock variants are members of the canonical Rock
    // family, not Indie/Rock hybrids. True multi-family labels (for example
    // rap rock) retain every family.
    if (
      detectedInGenre.has("rock") &&
      detectedInGenre.has("indie") &&
      (
        normalizedGenre.includes("alternative rock") ||
        normalizedGenre.includes("indie rock")
      )
    ) {
      detectedInGenre.delete("indie");
    }

    detectedInGenre.forEach((family) => families.add(family));
  }

  return Array.from(families);
}

function selectedGenreFamilies(
  draft: Pick<SceneStudioDraft, "preferredGenres">,
): SceneGenreFamily[] {
  return normalizeSceneGenreFamilies(draft.preferredGenres);
}

export function getSceneTrackGenreMatch(
  genres: readonly string[],
  draft: Pick<
    SceneStudioDraft,
    "preferredGenres" | "allowAdjacentGenres"
  >,
): GeneratedTrackGenreMatch {
  const selected = selectedGenreFamilies(draft);
  const detected = normalizeSceneGenreFamilies(genres);

  if (selected.length === 0) {
    return {
      confidence: "unscoped",
      detectedFamilies: detected,
      matchedFamilies: [],
      whyMatched: "No genre filter was requested.",
    };
  }

  const matched = detected.filter((family) => selected.includes(family));
  const hasAdjacent = detected.some((family) => !selected.includes(family));
  const accepted = detected.length > 0 && matched.length > 0 &&
    (draft.allowAdjacentGenres || !hasAdjacent);

  return {
    confidence: accepted && !hasAdjacent ? "high" : "low",
    detectedFamilies: detected,
    matchedFamilies: matched,
    whyMatched: detected.length === 0
      ? "Excluded because genre metadata is missing."
      : accepted && hasAdjacent
        ? `Matched ${matched.join(", ")}; adjacent genre metadata was allowed.`
        : accepted
          ? `Strict match: ${matched.join(", ")}.`
          : `Excluded by strict genre selection (${selected.join(", ")}).`,
  };
}

function candidateMatchesGenreSelection(
  candidate: InternalCandidate,
  draft: SceneStudioDraft,
): boolean {
  if (draft.preferredGenres.length === 0) {
    return true;
  }

  const match = getSceneTrackGenreMatch(candidate.genres, draft);
  return match.matchedFamilies.length > 0 &&
    (draft.allowAdjacentGenres || match.confidence === "high");
}

function seededUnitInterval(
  value: string,
): number {
  let hash = 2166136261;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
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
  familiarityLevel: number,
): number {
  const familiar: Record<SceneTrackSource, number> = {
    top: 2.5,
    saved: 1.45,
    recent: 1.8,
    playlist: 1.15,
    discovery: 0.1,
  };
  const balanced: Record<SceneTrackSource, number> = {
    top: 1.1,
    saved: 1.05,
    recent: 1,
    playlist: 1.05,
    discovery: 0.8,
  };
  const newMusic: Record<SceneTrackSource, number> = {
    top: 0.68,
    saved: 1.08,
    recent: 0.72,
    playlist: 1,
    discovery: 1.55,
  };
  const level = clamp(familiarityLevel, 0, 100);

  if (level <= 50) {
    const progress = level / 50;

    return (
      familiar[source] +
      (balanced[source] - familiar[source]) * progress
    );
  }

  const progress = (level - 50) / 50;

  return (
    balanced[source] +
    (newMusic[source] - balanced[source]) * progress
  );
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
  generationSeed: string,
  deprioritizedTrackIds: ReadonlySet<string>,
  preferredTrackIds: ReadonlySet<string>,
): number {
  let score = 0;
  const familiarityLevel =
    getSceneFamiliarityLevel(draft);
  const novelty = familiarityLevel / 100;

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
        familiarityLevel,
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

  score += scoreSceneDirectionText(
    draft.notes,
    [
      candidate.track.name,
      candidate.track.album?.name,
      ...(candidate.track.artists ?? []).map((artist) => artist.name),
      ...candidate.genres,
    ].filter(Boolean).join(" "),
  );

  const lessObviousRank = Math.max(
    candidate.sourceRanks.saved ?? 0,
    candidate.sourceRanks.playlist ?? 0,
  );
  const libraryDepth =
    lessObviousRank > 0
      ? clamp(
          Math.log2(lessObviousRank + 1) / 11,
          0,
          1,
        )
      : 0;

  score +=
    libraryDepth *
    (novelty * 28 - (1 - novelty) * 7);

  if (candidate.sources.has("top")) {
    score += (1 - novelty) * 80;
    score -= novelty * 55;
  }

  if (candidate.sources.has("recent")) {
    score += (1 - novelty) * 35;
    score -= novelty * 18;
  }

  if (candidate.sources.has("saved")) {
    score += (1 - novelty) * 15;
  }

  if (candidate.sources.has("discovery")) {
    score -= (1 - novelty) * 80;
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

  score +=
    seededUnitInterval(
      `${generationSeed}:${candidate.track.id}`,
    ) *
    (3 + novelty * 24);

  if (deprioritizedTrackIds.has(candidate.track.id)) {
    score -= 180;
  }

  if (preferredTrackIds.has(candidate.track.id)) {
    score += 95 * (1 - novelty * 0.72);
  }

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
  generationSeed: string,
  rejectedTrackIds: ReadonlySet<string>,
  deprioritizedTrackIds: ReadonlySet<string>,
  preferredTrackIds: ReadonlySet<string>,
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
        generationSeed,
        deprioritizedTrackIds,
        preferredTrackIds,
      );
  }

  return candidates
    .filter(
      (candidate) =>
        candidate.score >
          -500 &&
        !rejectedTrackIds.has(candidate.track.id) &&
        candidateMatchesGenreSelection(candidate, draft),
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
    getSceneFamiliarityLevel(draft) <= 25
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
  if (draft.smoothTransitions === false) {
    return [...tracks];
  }

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

  return Math.round(
    durationMs / 60_000,
  );
}

function buildSelectionStatus(
  draft: SceneStudioDraft,
  signals: GeneratedTrackSignal[],
): GeneratedSceneSelectionStatus {
  const selectedDurationMinutes = estimateDurationMinutes(signals);
  const underfilled = selectedDurationMinutes < draft.durationMinutes;
  const strictGenres = draft.preferredGenres.length > 0 &&
    !draft.allowAdjacentGenres;

  if (!underfilled) {
    return {
      underfilled: false,
      requestedDurationMinutes: draft.durationMinutes,
      selectedDurationMinutes,
      action: "none",
      message: "The requested duration was filled.",
    };
  }

  return {
    underfilled: true,
    requestedDurationMinutes: draft.durationMinutes,
    selectedDurationMinutes,
    action: strictGenres
      ? "broaden-genres-or-shorten-duration"
      : "shorten-duration",
    message: strictGenres
      ? `Only ${selectedDurationMinutes} of ${draft.durationMinutes} minutes matched strictly. Turn on adjacent genres, broaden genres, or shorten the Scene.`
      : `Only ${selectedDurationMinutes} of ${draft.durationMinutes} minutes were available. Shorten the Scene to match.`,
  };
}

function buildDefaultSceneName(
  draft: SceneStudioDraft,
  existingNames: readonly string[] = [],
  variationSeed = "",
): string {
  return generateCreativeSceneName(
    {
      activity: draft.activity,
      moods: draft.moods,
      energy: draft.energy,
      arc: draft.arc,
      genres: draft.preferredGenres,
    },
    {
      seed: variationSeed,
      existingNames,
    },
  );
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

  const familiarityLevel =
    getSceneFamiliarityLevel(draft);

  if (familiarityLevel <= 33) {
    rationale.push(
      "The sequence prioritizes your strongest top-track and saved-track signals.",
    );
  } else if (familiarityLevel >= 67) {
    rationale.push(
      "The sequence increases artist variety and reaches deeper into your full imported library for less obvious choices.",
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
  const familiarityLevel =
    getSceneFamiliarityLevel(draft);

  await AsyncStorage.setItem(
    SCENE_STUDIO_DRAFT_STORAGE_KEY,
    JSON.stringify({
      ...draft,
      familiarityLevel,
      familiarity:
        sceneFamiliarityFromLevel(familiarityLevel),
    }),
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
    const familiarityLevel =
      typeof parsed.familiarityLevel === "number" &&
      Number.isFinite(parsed.familiarityLevel)
        ? Math.round(
            clamp(parsed.familiarityLevel, 0, 100),
          )
        : parsed.familiarity === "familiar"
          ? 0
          : parsed.familiarity === "discovery"
            ? 100
            : 50;

    return {
      ...DEFAULT_SCENE_STUDIO_DRAFT,
      ...parsed,
      familiarityLevel,
      familiarity:
        sceneFamiliarityFromLevel(familiarityLevel),

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

    const familiarityLevel =
      typeof parsed.draft?.familiarityLevel === "number" &&
      Number.isFinite(parsed.draft.familiarityLevel)
        ? Math.round(
            clamp(parsed.draft.familiarityLevel, 0, 100),
          )
        : parsed.draft?.familiarity === "familiar"
          ? 0
          : parsed.draft?.familiarity === "discovery"
            ? 100
            : 50;

    return {
      ...parsed,

      draft: {
        ...DEFAULT_SCENE_STUDIO_DRAFT,
        ...parsed.draft,
        familiarityLevel,
        familiarity:
          sceneFamiliarityFromLevel(familiarityLevel),
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
  options: {
    variationSeed?: string;
    rejectedTrackIds?: readonly string[];
    deprioritizedTrackIds?: readonly string[];
    preferredTrackIds?: readonly string[];
    existingSceneNames?: readonly string[];
  } = {},
): GeneratedSceneResult {
  const id = createSceneId();
  const generationSeed =
    options.variationSeed ?? id;
  const candidatePool =
    buildCandidatePool(
      draft,
      snapshot,
      generationSeed,
      new Set(options.rejectedTrackIds ?? []),
      new Set(options.deprioritizedTrackIds ?? []),
      new Set(options.preferredTrackIds ?? []),
    );

  const selected =
    selectTracksForDuration(
      candidatePool,
      draft,
    );

  if (selected.length === 0 && draft.preferredGenres.length === 0) {
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

        genreMatch:
          getSceneTrackGenreMatch(
            candidate.genres,
            draft,
          ),
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

  const sceneName =
    draft.name.trim() ||
    buildDefaultSceneName(
      draft,
      options.existingSceneNames,
      generationSeed,
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
        .join(", ") || "Open",

    genres:
      selectedGenres.join(
        ", ",
      ),

    energy:
      draft.energy,

    familiarity:
      sceneFamiliarityFromLevel(
        getSceneFamiliarityLevel(draft),
      ),

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
      familiarity:
        sceneFamiliarityFromLevel(
          getSceneFamiliarityLevel(draft),
        ),
      familiarityLevel:
        getSceneFamiliarityLevel(draft),
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

    selectionStatus:
      buildSelectionStatus(
        draft,
        signals,
      ),

    createdAt:
      now,
  };
}

export function generateSceneWithSpotifyGenreFallback(
  draft: SceneStudioDraft,
  snapshot: SpotifyLibrarySnapshot,
  options: {
    variationSeed?: string;
    rejectedTrackIds?: readonly string[];
    deprioritizedTrackIds?: readonly string[];
    preferredTrackIds?: readonly string[];
    existingSceneNames?: readonly string[];
  } = {},
): GeneratedSceneResult {
  const generated = generateSceneFromSpotify(draft, snapshot, options);
  const hasGenreSignals =
    snapshot.topGenres.length > 0 ||
    Object.values(snapshot.trackGenres).some((genres) => genres.length > 0);

  if (
    generated.scene.tracks.length > 0 ||
    draft.preferredGenres.length === 0 ||
    hasGenreSignals
  ) {
    return generated;
  }

  return {
    ...generated,
    scene: {
      ...generated.scene,
      genres: draft.preferredGenres.join(", "),
    },
    rationale: [
      `Spotify supplied no verifiable ${draft.preferredGenres.join(", ")} matches, so Canal kept the genre filter instead of adding unrelated tracks.`,
      ...generated.rationale,
    ],
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

    selectionStatus:
      buildSelectionStatus(
        result.draft,
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
