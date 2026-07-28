import {
  SceneTrack,
  StoredScene,
} from "./scenes";
import {
  createManualArtist,
  getArtistNames,
  parseArtistSelections,
  serializeArtistSelections,
  SpotifyArtistSelection,
} from "./spotify-search";

export type SceneDraft = {
  sceneId: string;
  name: string;
  activity: string;
  duration: string;
  emotions: string;
  genres: string;
  energy: string;
  familiarity: string;
  artistSelections:
    SpotifyArtistSelection[];
  songRequest: string;
  avoid: string;
  collaborators: string[];
};

export const EMPTY_SCENE_DRAFT:
  SceneDraft = {
    sceneId: "",
    name: "",
    activity: "",
    duration: "",
    emotions: "",
    genres: "",
    energy: "",
    familiarity: "",
    artistSelections: [],
    songRequest: "",
    avoid: "",
    collaborators: [],
  };

export function readSceneDraftFromParams(
  params: Record<
    string,
    string | string[] | undefined
  >,
): SceneDraft {
  const artists =
    readParam(
      params.artists,
    );

  const serializedSelections =
    readParam(
      params.artistSelections,
    );

  const parsedSelections =
    parseArtistSelections(
      serializedSelections,
    );

  const artistSelections =
    parsedSelections.length > 0
      ? parsedSelections
      : artists
          .split(",")
          .map((artist) =>
            artist.trim(),
          )
          .filter(Boolean)
          .map(
            createManualArtist,
          );

  return {
    sceneId:
      readParam(
        params.sceneId,
      ),

    name:
      readParam(
        params.name,
      ),

    activity:
      readParam(
        params.activity,
      ),

    duration:
      readParam(
        params.duration,
      ),

    emotions:
      readParam(
        params.emotions,
      ),

    genres:
      readParam(
        params.genres,
      ),

    energy:
      readParam(
        params.energy,
      ),

    familiarity:
      readParam(
        params.familiarity,
      ),

    artistSelections,

    songRequest:
      readParam(
        params.songRequest,
      ),

    avoid:
      readParam(
        params.avoid,
      ),

    collaborators:
      parseStringArrayParam(
        params.collaborators,
      ),
  };
}

export function sceneDraftToParams(
  draft: SceneDraft,
): Record<
  string,
  string
> {
  return {
    sceneId:
      draft.sceneId,

    name:
      draft.name,

    activity:
      draft.activity,

    duration:
      draft.duration,

    emotions:
      draft.emotions,

    genres:
      draft.genres,

    energy:
      draft.energy,

    familiarity:
      draft.familiarity,

    artists:
      getArtistNames(
        draft.artistSelections,
      ),

    artistSelections:
      serializeArtistSelections(
        draft.artistSelections,
      ),

    songRequest:
      draft.songRequest,

    avoid:
      draft.avoid,

    collaborators:
      JSON.stringify(
        draft.collaborators,
      ),
  };
}

export function storedSceneToDraft(
  scene: StoredScene,
): SceneDraft {
  const selections =
    parseArtistSelections(
      scene.artistSelections,
    );

  return {
    sceneId: scene.id,
    name: scene.name,
    activity:
      scene.activity,
    duration:
      scene.duration,
    emotions:
      scene.emotions,
    genres: scene.genres,
    energy: scene.energy,
    familiarity:
      scene.familiarity,

    artistSelections:
      selections.length > 0
        ? selections
        : scene.artists
            .split(",")
            .map((artist) =>
              artist.trim(),
            )
            .filter(Boolean)
            .map(
              createManualArtist,
            ),

    songRequest:
      scene.songRequest,

    avoid: scene.avoid,

    collaborators:
      scene.collaborators,
  };
}

export function generateSceneTracks(
  draft: SceneDraft,
  generationSeed = 0,
): SceneTrack[] {
  const requestedTrack =
    parseSongRequest(
      draft.songRequest,
    );

  const artistNames =
    draft.artistSelections
      .map(
        (artist) =>
          artist.name,
      )
      .filter(Boolean);

  const fallbackArtists = [
    "SZA",
    "Tems",
    "Frank Ocean",
    "Kaytranada",
    "Cleo Sol",
    "Drake",
  ];

  const artists =
    artistNames.length > 0
      ? artistNames
      : fallbackArtists;

  const trackTitles =
    getTrackTitlesForMood(
      draft,
    );

  const generatedTracks =
    trackTitles.map(
      (title, index) => {
        const artist =
          artists[
            (index +
              generationSeed) %
              artists.length
          ];

        return {
          id:
            createTrackId(
              index,
              generationSeed,
            ),

          title,
          artist,

          source: "Canal",
        };
      },
    );

  if (requestedTrack) {
    generatedTracks.unshift({
      id:
        createTrackId(
          -1,
          generationSeed,
        ),

      title:
        requestedTrack.title,

      artist:
        requestedTrack.artist,

      source: "Request",
    });
  }

  return removeDuplicateTracks(
    generatedTracks,
  ).slice(0, 10);
}

export function createSceneId(): string {
  return `scene-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function toggleCommaValue(
  currentValue: string,
  value: string,
): string {
  const values =
    currentValue
      .split(",")
      .map((item) =>
        item.trim(),
      )
      .filter(Boolean);

  const existingIndex =
    values.findIndex(
      (item) =>
        item.toLowerCase() ===
        value.toLowerCase(),
    );

  if (existingIndex >= 0) {
    values.splice(
      existingIndex,
      1,
    );
  } else {
    values.push(value);
  }

  return values.join(", ");
}

export function includesCommaValue(
  currentValue: string,
  value: string,
): boolean {
  return currentValue
    .split(",")
    .map((item) =>
      item.trim().toLowerCase(),
    )
    .includes(
      value.toLowerCase(),
    );
}

export function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseStringArrayParam(
  value:
    | string
    | string[]
    | undefined,
): string[] {
  const rawValue =
    firstParam(value);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown =
      JSON.parse(rawValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter(
        (
          item,
        ): item is string =>
          typeof item ===
          "string",
      );
    }
  } catch {
    return rawValue
      .split(",")
      .map((item) =>
        item.trim(),
      )
      .filter(Boolean);
  }

  return [];
}

function readParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  return firstParam(
    value,
  ).trim();
}

function parseSongRequest(
  value: string,
): {
  title: string;
  artist: string;
} | null {
  const cleanedValue =
    value.trim();

  if (!cleanedValue) {
    return null;
  }

  const separators = [
    " by ",
    " - ",
    " — ",
  ];

  for (const separator of separators) {
    const parts =
      cleanedValue.split(
        separator,
      );

    if (parts.length >= 2) {
      return {
        title:
          parts[0].trim(),

        artist:
          parts
            .slice(1)
            .join(separator)
            .trim(),
      };
    }
  }

  return {
    title: cleanedValue,
    artist: "Requested artist",
  };
}

function getTrackTitlesForMood(
  draft: SceneDraft,
): string[] {
  const normalizedText =
    [
      draft.activity,
      draft.emotions,
      draft.genres,
      draft.energy,
    ]
      .join(" ")
      .toLowerCase();

  if (
    normalizedText.includes(
      "study",
    ) ||
    normalizedText.includes(
      "focus",
    ) ||
    normalizedText.includes(
      "calm",
    )
  ) {
    return [
      "Quiet Focus",
      "Soft Window",
      "Low Light",
      "Open Notes",
      "Steady Mind",
      "After Hours",
      "Clear Space",
      "Still Moving",
    ];
  }

  if (
    normalizedText.includes(
      "workout",
    ) ||
    normalizedText.includes(
      "party",
    ) ||
    normalizedText.includes(
      "high",
    ) ||
    normalizedText.includes(
      "excited",
    )
  ) {
    return [
      "First Move",
      "No Waiting",
      "Up Next",
      "Full Energy",
      "Outside",
      "Run It Back",
      "All Night",
      "One More",
    ];
  }

  if (
    normalizedText.includes(
      "romantic",
    ) ||
    normalizedText.includes(
      "love",
    ) ||
    normalizedText.includes(
      "intimate",
    )
  ) {
    return [
      "Close Enough",
      "Warm Room",
      "Only Us",
      "Slow Motion",
      "Stay Here",
      "Soft Spoken",
      "After Midnight",
      "No Rush",
    ];
  }

  return [
    "Opening Scene",
    "Right Now",
    "In Between",
    "Moving Through",
    "Second Wind",
    "New Feeling",
    "Night Air",
    "Last Track",
  ];
}

function createTrackId(
  index: number,
  generationSeed: number,
): string {
  return `generated-${Date.now()}-${generationSeed}-${index}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function removeDuplicateTracks(
  tracks: SceneTrack[],
): SceneTrack[] {
  const seen =
    new Set<string>();

  return tracks.filter(
    (track) => {
      const key =
        `${track.title}:${track.artist}`.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    },
  );
}