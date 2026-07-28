import AsyncStorage from "@react-native-async-storage/async-storage";

export type ListeningHistoryEntry = {
  id: string;
  sceneId: string;
  sceneName: string;
  startedAt: string;
  completedAt?: string;
  tracksPlayed: number;
  durationSeconds: number;
};

export type SceneFeedbackRating =
  | "perfect"
  | "too-calm"
  | "too-intense"
  | "too-familiar"
  | "too-unfamiliar"
  | "wrong-mood"
  | "wrong-artists"
  | "too-repetitive";

export type SceneFeedbackEntry = {
  id: string;
  sceneId: string;
  sceneName: string;
  rating: SceneFeedbackRating;
  note: string;
  createdAt: string;
};

export type SharedSnapshot = {
  id: string;
  sceneId: string;
  sceneName: string;
  activity: string;
  mood: string;
  caption: string;
  trackCount: number;
  artists: string;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
};

export type LocalProfile = {
  displayName: string;
  handle: string;
  bio: string;
  favoriteActivities: string;
  createdAt: string;
  updatedAt: string;
};

const HISTORY_KEY =
  "@canal/listening-history";

const FEEDBACK_KEY =
  "@canal/scene-feedback";

const FEED_KEY =
  "@canal/local-feed";

const PROFILE_KEY =
  "@canal/local-profile";

function createId(
  prefix: string,
): string {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );
}

async function readArray<T>(
  key: string,
): Promise<T[]> {
  const serialized =
    await AsyncStorage.getItem(key);

  if (!serialized) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(serialized);

    return Array.isArray(parsed)
      ? (parsed as T[])
      : [];
  } catch {
    return [];
  }
}

async function writeArray<T>(
  key: string,
  values: T[],
): Promise<void> {
  await AsyncStorage.setItem(
    key,
    JSON.stringify(values),
  );
}

export async function readListeningHistory(): Promise<
  ListeningHistoryEntry[]
> {
  const history =
    await readArray<ListeningHistoryEntry>(
      HISTORY_KEY,
    );

  return history.sort(
    (first, second) =>
      new Date(
        second.completedAt ??
          second.startedAt,
      ).getTime() -
      new Date(
        first.completedAt ??
          first.startedAt,
      ).getTime(),
  );
}

export async function recordListeningHistory(
  input: Omit<
    ListeningHistoryEntry,
    "id"
  >,
): Promise<ListeningHistoryEntry> {
  const entry: ListeningHistoryEntry = {
    ...input,

    id:
      createId("history"),
  };

  const history =
    await readListeningHistory();

  await writeArray(
    HISTORY_KEY,
    [entry, ...history].slice(
      0,
      100,
    ),
  );

  return entry;
}

export async function clearListeningHistory(): Promise<void> {
  await AsyncStorage.removeItem(
    HISTORY_KEY,
  );
}

export async function readFeedbackEntries(): Promise<
  SceneFeedbackEntry[]
> {
  return readArray<SceneFeedbackEntry>(
    FEEDBACK_KEY,
  );
}

export async function addFeedbackEntry(
  input: Omit<
    SceneFeedbackEntry,
    "id" | "createdAt"
  >,
): Promise<SceneFeedbackEntry> {
  const entry: SceneFeedbackEntry = {
    ...input,

    id:
      createId("feedback"),

    createdAt:
      new Date().toISOString(),
  };

  const entries =
    await readFeedbackEntries();

  await writeArray(
    FEEDBACK_KEY,
    [entry, ...entries].slice(
      0,
      200,
    ),
  );

  return entry;
}

export async function readSharedSnapshots(): Promise<
  SharedSnapshot[]
> {
  const snapshots =
    await readArray<SharedSnapshot>(
      FEED_KEY,
    );

  return snapshots.sort(
    (first, second) =>
      new Date(
        second.createdAt,
      ).getTime() -
      new Date(
        first.createdAt,
      ).getTime(),
  );
}

export async function publishSnapshot(
  input: Omit<
    SharedSnapshot,
    | "id"
    | "createdAt"
    | "likes"
    | "likedByMe"
  >,
): Promise<SharedSnapshot> {
  const snapshot: SharedSnapshot = {
    ...input,

    id:
      createId("snapshot"),

    createdAt:
      new Date().toISOString(),

    likes: 0,
    likedByMe: false,
  };

  const snapshots =
    await readSharedSnapshots();

  await writeArray(
    FEED_KEY,
    [snapshot, ...snapshots].slice(
      0,
      100,
    ),
  );

  return snapshot;
}

export async function toggleSnapshotLike(
  snapshotId: string,
): Promise<SharedSnapshot | null> {
  const snapshots =
    await readSharedSnapshots();

  const index =
    snapshots.findIndex(
      (snapshot) =>
        snapshot.id ===
        snapshotId,
    );

  if (index < 0) {
    return null;
  }

  const current =
    snapshots[index];

  const updated: SharedSnapshot = {
    ...current,

    likedByMe:
      !current.likedByMe,

    likes:
      current.likes +
      (current.likedByMe
        ? -1
        : 1),
  };

  snapshots[index] =
    updated;

  await writeArray(
    FEED_KEY,
    snapshots,
  );

  return updated;
}

export async function readLocalProfile(): Promise<
  LocalProfile
> {
  const serialized =
    await AsyncStorage.getItem(
      PROFILE_KEY,
    );

  if (serialized) {
    try {
      const parsed =
        JSON.parse(
          serialized,
        ) as Partial<LocalProfile>;

      return {
        displayName:
          parsed.displayName ??
          "Canal Listener",

        handle:
          parsed.handle ??
          "@canaluser",

        bio:
          parsed.bio ?? "",

        favoriteActivities:
          parsed.favoriteActivities ??
          "",

        createdAt:
          parsed.createdAt ??
          new Date().toISOString(),

        updatedAt:
          parsed.updatedAt ??
          new Date().toISOString(),
      };
    } catch {
      // Use defaults.
    }
  }

  const now =
    new Date().toISOString();

  return {
    displayName:
      "Canal Listener",

    handle:
      "@canaluser",

    bio: "",

    favoriteActivities:
      "",

    createdAt: now,
    updatedAt: now,
  };
}

export async function saveLocalProfile(
  input: LocalProfile,
): Promise<LocalProfile> {
  const profile: LocalProfile = {
    ...input,

    handle:
      input.handle.startsWith("@")
        ? input.handle
        : `@${input.handle}`,

    updatedAt:
      new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    PROFILE_KEY,
    JSON.stringify(profile),
  );

  return profile;
}
