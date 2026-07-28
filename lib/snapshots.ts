import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  STORAGE_KEYS,
} from "./storage-keys";

export type SnapshotVisibility =
  | "public"
  | "private";

export type Snapshot = {
  id: string;
  sceneId: string;
  sceneName: string;
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  spotifyUrl?: string;
  positionMs: number;
  note: string;
  mood?: string;
  createdAt: string;
  updatedAt: string;
  visibility: SnapshotVisibility;
};

export type CreateSnapshotInput = {
  sceneId: string;
  sceneName: string;
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  spotifyUrl?: string;
  positionMs?: number;
  note?: string;
  mood?: string;
  visibility?: SnapshotVisibility;
};

export type UpdateSnapshotInput = {
  note?: string;
  mood?: string;
  spotifyUrl?: string;
  visibility?: SnapshotVisibility;
};

export async function readSnapshots(): Promise<
  Snapshot[]
> {
  const storedValue =
    await AsyncStorage.getItem(
      STORAGE_KEYS.snapshots,
    );

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(normalizeSnapshot)
      .filter(
        (
          snapshot,
        ): snapshot is Snapshot =>
          snapshot !== null,
      )
      .sort(
        (first, second) =>
          getSnapshotTimestamp(
            second,
          ) -
          getSnapshotTimestamp(
            first,
          ),
      );
  } catch {
    return [];
  }
}

export async function readSnapshot(
  snapshotId: string,
): Promise<Snapshot | null> {
  const snapshots =
    await readSnapshots();

  return (
    snapshots.find(
      (snapshot) =>
        snapshot.id === snapshotId,
    ) ?? null
  );
}

export async function createSnapshot(
  input: CreateSnapshotInput,
): Promise<Snapshot> {
  const snapshots =
    await readSnapshots();

  const now =
    new Date().toISOString();

  const snapshot: Snapshot = {
    id: createSnapshotId(),

    sceneId:
      input.sceneId.trim(),

    sceneName:
      input.sceneName.trim() ||
      "Untitled Scene",

    trackId:
      cleanOptionalString(
        input.trackId,
      ),

    trackTitle:
      cleanOptionalString(
        input.trackTitle,
      ),

    trackArtist:
      cleanOptionalString(
        input.trackArtist,
      ),

    spotifyUrl:
      cleanOptionalString(
        input.spotifyUrl,
      ),

    positionMs:
      typeof input.positionMs ===
        "number" &&
      Number.isFinite(
        input.positionMs,
      )
        ? Math.max(
            0,
            input.positionMs,
          )
        : 0,

    note:
      input.note?.trim() ?? "",

    mood:
      cleanOptionalString(
        input.mood,
      ),

    createdAt: now,
    updatedAt: now,

    visibility:
      input.visibility ===
      "public"
        ? "public"
        : "private",
  };

  await writeSnapshots([
    snapshot,
    ...snapshots,
  ]);

  return snapshot;
}

export async function updateSnapshot(
  snapshotId: string,
  changes: UpdateSnapshotInput,
): Promise<Snapshot | null> {
  const snapshots =
    await readSnapshots();

  const existingSnapshot =
    snapshots.find(
      (snapshot) =>
        snapshot.id === snapshotId,
    );

  if (!existingSnapshot) {
    return null;
  }

  const updatedSnapshot: Snapshot = {
    ...existingSnapshot,

    note:
      changes.note !== undefined
        ? changes.note.trim()
        : existingSnapshot.note,

    mood:
      changes.mood !== undefined
        ? cleanOptionalString(
            changes.mood,
          )
        : existingSnapshot.mood,

    spotifyUrl:
      changes.spotifyUrl !== undefined
        ? cleanOptionalString(
            changes.spotifyUrl,
          )
        : existingSnapshot.spotifyUrl,

    visibility:
      changes.visibility ===
      "public"
        ? "public"
        : changes.visibility ===
            "private"
          ? "private"
          : existingSnapshot.visibility,

    updatedAt:
      new Date().toISOString(),
  };

  await writeSnapshots(
    snapshots.map((snapshot) =>
      snapshot.id === snapshotId
        ? updatedSnapshot
        : snapshot,
    ),
  );

  return updatedSnapshot;
}

export async function deleteSnapshot(
  snapshotId: string,
): Promise<void> {
  const snapshots =
    await readSnapshots();

  await writeSnapshots(
    snapshots.filter(
      (snapshot) =>
        snapshot.id !== snapshotId,
    ),
  );
}

export async function writeSnapshots(
  snapshots: Snapshot[],
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.snapshots,
    JSON.stringify(snapshots),
  );
}

function normalizeSnapshot(
  value: unknown,
): Snapshot | null {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return null;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  const id =
    readString(record.id);

  const sceneId =
    readString(record.sceneId);

  const sceneName =
    readString(record.sceneName);

  if (
    !id ||
    !sceneId ||
    !sceneName
  ) {
    return null;
  }

  const now =
    new Date().toISOString();

  return {
    id,
    sceneId,
    sceneName,

    trackId:
      readOptionalString(
        record.trackId,
      ),

    trackTitle:
      readOptionalString(
        record.trackTitle,
      ),

    trackArtist:
      readOptionalString(
        record.trackArtist,
      ),

    spotifyUrl:
      readOptionalString(
        record.spotifyUrl,
      ),

    positionMs:
      typeof record.positionMs ===
        "number" &&
      Number.isFinite(
        record.positionMs,
      )
        ? Math.max(
            0,
            record.positionMs,
          )
        : 0,

    note:
      readString(record.note),

    mood:
      readOptionalString(
        record.mood,
      ),

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

    visibility:
      record.visibility ===
      "public"
        ? "public"
        : "private",
  };
}

function createSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getSnapshotTimestamp(
  snapshot: Snapshot,
): number {
  const timestamp =
    new Date(
      snapshot.updatedAt ||
        snapshot.createdAt,
    ).getTime();

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : 0;
}

function readString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function readOptionalString(
  value: unknown,
): string | undefined {
  const cleanedValue =
    readString(value);

  return cleanedValue ||
    undefined;
}

function cleanOptionalString(
  value:
    | string
    | undefined,
): string | undefined {
  const cleanedValue =
    value?.trim();

  return cleanedValue ||
    undefined;
}