import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  STORAGE_KEYS,
} from "./storage-keys";

export type SoundscapeVisibility =
  | "public"
  | "private";

export type SoundscapeProfile = {
  displayName: string;
  username: string;
  bio: string;
  genres: string[];
  favoriteArtists: string[];
  snapshotIds: string[];
  visibility: SoundscapeVisibility;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_SOUNDSCAPE:
  SoundscapeProfile = {
    displayName:
      "Brandon Parks",

    username:
      "brandonparks",

    bio:
      "Building Scenes for every kind of moment.",

    genres: [
      "R&B",
      "Hip-Hop",
      "Afrobeats",
    ],

    favoriteArtists: [
      "SZA",
      "Frank Ocean",
      "Tems",
    ],

    snapshotIds: [],

    visibility: "public",

    createdAt: "",

    updatedAt: "",
  };

export async function readSoundscape(): Promise<SoundscapeProfile> {
  const storedValue =
    await AsyncStorage.getItem(
      STORAGE_KEYS.soundscape,
    );

  if (!storedValue) {
    const now =
      new Date().toISOString();

    return {
      ...DEFAULT_SOUNDSCAPE,
      createdAt: now,
      updatedAt: now,
    };
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    return normalizeSoundscape(
      parsedValue,
    );
  } catch {
    const now =
      new Date().toISOString();

    return {
      ...DEFAULT_SOUNDSCAPE,
      createdAt: now,
      updatedAt: now,
    };
  }
}

export async function saveSoundscape(
  profile: SoundscapeProfile,
): Promise<SoundscapeProfile> {
  const existingProfile =
    await readSoundscape();

  const normalizedProfile =
    normalizeSoundscape({
      ...profile,

      createdAt:
        profile.createdAt ||
        existingProfile.createdAt,

      updatedAt:
        new Date().toISOString(),
    });

  await AsyncStorage.setItem(
    STORAGE_KEYS.soundscape,
    JSON.stringify(
      normalizedProfile,
    ),
  );

  return normalizedProfile;
}

export async function addSnapshotToSoundscape(
  snapshotId: string,
): Promise<SoundscapeProfile> {
  const profile =
    await readSoundscape();

  return saveSoundscape({
    ...profile,

    snapshotIds:
      Array.from(
        new Set([
          ...profile.snapshotIds,
          snapshotId,
        ]),
      ),
  });
}

export async function removeSnapshotFromSoundscape(
  snapshotId: string,
): Promise<SoundscapeProfile> {
  const profile =
    await readSoundscape();

  return saveSoundscape({
    ...profile,

    snapshotIds:
      profile.snapshotIds.filter(
        (id) =>
          id !== snapshotId,
      ),
  });
}

export function normalizeUsername(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(
      /[^a-z0-9._]/g,
      "",
    )
    .slice(0, 30);
}

function normalizeSoundscape(
  value: unknown,
): SoundscapeProfile {
  const now =
    new Date().toISOString();

  if (
    typeof value !== "object" ||
    value === null
  ) {
    return {
      ...DEFAULT_SOUNDSCAPE,
      createdAt: now,
      updatedAt: now,
    };
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  const displayName =
    readString(
      record.displayName,
    ) ||
    DEFAULT_SOUNDSCAPE.displayName;

  const username =
    normalizeUsername(
      readString(
        record.username,
      ) ||
        DEFAULT_SOUNDSCAPE.username,
    );

  return {
    displayName,
    username:
      username ||
      DEFAULT_SOUNDSCAPE.username,

    bio:
      readString(record.bio),

    genres:
      readStringArray(
        record.genres,
      ),

    favoriteArtists:
      readStringArray(
        record.favoriteArtists,
      ),

    snapshotIds:
      readStringArray(
        record.snapshotIds,
      ),

    visibility:
      record.visibility ===
      "private"
        ? "private"
        : "public",

    createdAt:
      readString(
        record.createdAt,
      ) || now,

    updatedAt:
      readString(
        record.updatedAt,
      ) ||
      readString(
        record.createdAt,
      ) ||
      now,
  };
}

function readStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
        .map((item) =>
          item.trim(),
        )
        .filter(Boolean),
    ),
  );
}

function readString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}