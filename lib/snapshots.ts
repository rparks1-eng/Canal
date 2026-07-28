import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  STORAGE_KEYS,
} from "./storage-keys";

import {
  deleteCloudSnapshot,
  getSnapshotSessionUserId,
  listOwnCloudSnapshots,
  readCloudSnapshot,
  upsertCloudSnapshot,
} from "./snapshot-cloud";

import {
  isSupabaseConfigured,
} from "./supabase";

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

  /*
   * These fields keep the local cache account-safe
   * and make a pending offline write visible to the UI.
   */
  ownerId?: string;
  isMine?: boolean;
  pendingCloudSync?: boolean;
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

export type SnapshotCloudStatus =
  | "synced"
  | "local-only";

export type SnapshotResult<T> = {
  value: T;
  cloudStatus: SnapshotCloudStatus;
  warning?: string;
};

const SNAPSHOT_ACCOUNT_KEY_PREFIX =
  `${STORAGE_KEYS.snapshots}:user:`;

const SNAPSHOT_DELETION_KEY_PREFIX =
  "@canal/snapshot-deletions:user:";

export async function readSnapshotsWithStatus(): Promise<
  SnapshotResult<Snapshot[]>
> {
  const userId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      userId,
    );

  const localSnapshots =
    await readLocalSnapshots(
      storageKey,
      userId,
    );

  if (
    !isSupabaseConfigured ||
    !userId
  ) {
    return {
      value:
        localSnapshots,

      cloudStatus:
        "local-only",

      warning:
        !isSupabaseConfigured
          ? "Snapshots are available on this device, but Supabase is not configured."
          : "Snapshots are available on this device. Sign in to sync them with Canal.",
    };
  }

  try {
    await syncPendingDeletions(
      userId,
    );

    const initialCloudResult =
      await listOwnCloudSnapshots();

    if (
      initialCloudResult.userId !==
      userId
    ) {
      throw new Error(
        "The active Snapshot account changed during synchronization.",
      );
    }

    const cloudById =
      new Map(
        initialCloudResult.snapshots.map(
          (snapshot) => [
            snapshot.id,
            snapshot,
          ],
        ),
      );

    for (
      const localSnapshot of
        localSnapshots
    ) {
      if (
        localSnapshot.pendingCloudSync &&
        (
          !localSnapshot.ownerId ||
          localSnapshot.ownerId ===
            userId
        )
      ) {
        const syncedSnapshot =
          await upsertCloudSnapshot({
            ...localSnapshot,

            ownerId:
              userId,

            isMine:
              true,
          });

        cloudById.set(
          syncedSnapshot.id,
          syncedSnapshot,
        );
      }
    }

    const syncedSnapshots =
      sortSnapshots(
        Array.from(
          cloudById.values(),
        ),
      );

    await writeLocalSnapshots(
      storageKey,
      syncedSnapshots,
    );

    return {
      value:
        syncedSnapshots,

      cloudStatus:
        "synced",
    };
  } catch (error) {
    return {
      value:
        localSnapshots,

      cloudStatus:
        "local-only",

      warning:
        buildCloudWarning(
          "load or synchronize your Snapshots",
          error,
        ),
    };
  }
}

export async function readSnapshots(): Promise<
  Snapshot[]
> {
  const result =
    await readSnapshotsWithStatus();

  return result.value;
}

export async function readSnapshotWithStatus(
  snapshotId: string,
): Promise<
  SnapshotResult<Snapshot | null>
> {
  const normalizedId =
    snapshotId.trim();

  if (!normalizedId) {
    return {
      value: null,
      cloudStatus:
        "local-only",
    };
  }

  const ownResult =
    await readSnapshotsWithStatus();

  const ownSnapshot =
    ownResult.value.find(
      (snapshot) =>
        snapshot.id ===
        normalizedId,
    );

  if (ownSnapshot) {
    return {
      ...ownResult,
      value:
        ownSnapshot,
    };
  }

  if (
    !isSupabaseConfigured ||
    !await getSnapshotSessionUserId()
  ) {
    return {
      value: null,
      cloudStatus:
        ownResult.cloudStatus,
      warning:
        ownResult.warning,
    };
  }

  try {
    const publicSnapshot =
      await readCloudSnapshot(
        normalizedId,
      );

    return {
      value:
        publicSnapshot,

      cloudStatus:
        "synced",
    };
  } catch (error) {
    return {
      value: null,
      cloudStatus:
        "local-only",
      warning:
        buildCloudWarning(
          "load this shared Snapshot",
          error,
        ),
    };
  }
}

export async function readSnapshot(
  snapshotId: string,
): Promise<Snapshot | null> {
  const result =
    await readSnapshotWithStatus(
      snapshotId,
    );

  return result.value;
}

export async function createSnapshotWithStatus(
  input: CreateSnapshotInput,
): Promise<
  SnapshotResult<Snapshot>
> {
  const userId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      userId,
    );

  const snapshots =
    await readLocalSnapshots(
      storageKey,
      userId,
    );

  const now =
    new Date().toISOString();

  const snapshot: Snapshot = {
    id:
      createSnapshotId(),

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
            Math.round(
              input.positionMs,
            ),
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

    ownerId:
      userId ??
      undefined,

    isMine:
      true,

    pendingCloudSync:
      true,
  };

  await writeLocalSnapshots(
    storageKey,
    [
      snapshot,
      ...snapshots,
    ],
  );

  return syncCreatedOrUpdatedSnapshot(
    snapshot,
    storageKey,
  );
}

export async function createSnapshot(
  input: CreateSnapshotInput,
): Promise<Snapshot> {
  const result =
    await createSnapshotWithStatus(
      input,
    );

  return result.value;
}

export async function updateSnapshotWithStatus(
  snapshotId: string,
  changes: UpdateSnapshotInput,
): Promise<
  SnapshotResult<Snapshot | null>
> {
  const userId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      userId,
    );

  const snapshots =
    await readLocalSnapshots(
      storageKey,
      userId,
    );

  const existingSnapshot =
    snapshots.find(
      (snapshot) =>
        snapshot.id ===
        snapshotId,
    );

  if (!existingSnapshot) {
    return {
      value: null,
      cloudStatus:
        isSupabaseConfigured &&
        userId
          ? "synced"
          : "local-only",
    };
  }

  if (
    existingSnapshot.isMine ===
      false ||
    (
      existingSnapshot.ownerId &&
      userId &&
      existingSnapshot.ownerId !==
        userId
    )
  ) {
    throw new Error(
      "You can view this public Snapshot, but only its creator can edit it.",
    );
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

    ownerId:
      existingSnapshot.ownerId ??
      userId ??
      undefined,

    isMine:
      true,

    pendingCloudSync:
      true,
  };

  await writeLocalSnapshots(
    storageKey,
    snapshots.map((snapshot) =>
      snapshot.id ===
      snapshotId
        ? updatedSnapshot
        : snapshot,
    ),
  );

  return syncCreatedOrUpdatedSnapshot(
    updatedSnapshot,
    storageKey,
  );
}

export async function updateSnapshot(
  snapshotId: string,
  changes: UpdateSnapshotInput,
): Promise<Snapshot | null> {
  const result =
    await updateSnapshotWithStatus(
      snapshotId,
      changes,
    );

  return result.value;
}

export async function syncSnapshotWithStatus(
  snapshotId: string,
): Promise<
  SnapshotResult<Snapshot | null>
> {
  const userId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      userId,
    );

  const snapshots =
    await readLocalSnapshots(
      storageKey,
      userId,
    );

  const snapshot =
    snapshots.find(
      (value) =>
        value.id ===
        snapshotId,
    );

  if (!snapshot) {
    return {
      value: null,
      cloudStatus:
        "local-only",
      warning:
        "The local Snapshot could not be found.",
    };
  }

  return syncCreatedOrUpdatedSnapshot(
    {
      ...snapshot,
      pendingCloudSync:
        true,
    },
    storageKey,
  );
}

export async function deleteSnapshotWithStatus(
  snapshotId: string,
): Promise<SnapshotResult<null>> {
  const userId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      userId,
    );

  const snapshots =
    await readLocalSnapshots(
      storageKey,
      userId,
    );

  const existingSnapshot =
    snapshots.find(
      (snapshot) =>
        snapshot.id ===
        snapshotId,
    );

  if (
    existingSnapshot?.isMine ===
      false
  ) {
    throw new Error(
      "Only the creator can delete this Snapshot.",
    );
  }

  await writeLocalSnapshots(
    storageKey,
    snapshots.filter(
      (snapshot) =>
        snapshot.id !==
        snapshotId,
    ),
  );

  if (
    !isSupabaseConfigured ||
    !userId
  ) {
    return {
      value: null,
      cloudStatus:
        "local-only",
      warning:
        "The Snapshot was removed from this device, but Canal could not confirm a cloud deletion.",
    };
  }

  await addPendingDeletion(
    userId,
    snapshotId,
  );

  try {
    await deleteCloudSnapshot(
      snapshotId,
    );

    await removePendingDeletion(
      userId,
      snapshotId,
    );

    return {
      value: null,
      cloudStatus:
        "synced",
    };
  } catch (error) {
    return {
      value: null,
      cloudStatus:
        "local-only",
      warning:
        buildCloudWarning(
          "delete this Snapshot from the cloud",
          error,
          "It was removed from this device and Canal will retry later.",
        ),
    };
  }
}

export async function deleteSnapshot(
  snapshotId: string,
): Promise<void> {
  await deleteSnapshotWithStatus(
    snapshotId,
  );
}

export async function writeSnapshots(
  snapshots: Snapshot[],
): Promise<void> {
  const userId =
    await getSnapshotSessionUserId();

  await writeLocalSnapshots(
    getSnapshotStorageKey(
      userId,
    ),
    sortSnapshots(
      snapshots,
    ),
  );
}

async function syncCreatedOrUpdatedSnapshot(
  snapshot: Snapshot,
  storageKey: string,
): Promise<
  SnapshotResult<Snapshot>
> {
  if (!isSupabaseConfigured) {
    return {
      value:
        snapshot,

      cloudStatus:
        "local-only",

      warning:
        "The Snapshot was saved on this device, but Supabase is not configured.",
    };
  }

  if (!snapshot.ownerId) {
    return {
      value:
        snapshot,

      cloudStatus:
        "local-only",

      warning:
        "The Snapshot was saved on this device. Sign in to publish or sync it with Canal.",
    };
  }

  try {
    const syncedSnapshot =
      await upsertCloudSnapshot(
        snapshot,
      );

    await replaceLocalSnapshot(
      storageKey,
      syncedSnapshot,
    );

    return {
      value:
        syncedSnapshot,

      cloudStatus:
        "synced",
    };
  } catch (error) {
    return {
      value:
        snapshot,

      cloudStatus:
        "local-only",

      warning:
        buildCloudWarning(
          "publish or sync this Snapshot",
          error,
          "It remains safely saved on this device.",
        ),
    };
  }
}

async function replaceLocalSnapshot(
  storageKey: string,
  snapshot: Snapshot,
): Promise<void> {
  const snapshots =
    await readLocalSnapshots(
      storageKey,
      snapshot.ownerId ??
      null,
    );

  const existingIndex =
    snapshots.findIndex(
      (value) =>
        value.id ===
        snapshot.id,
    );

  const nextSnapshots =
    existingIndex >= 0
      ? snapshots.map((value) =>
          value.id ===
          snapshot.id
            ? snapshot
            : value,
        )
      : [
          snapshot,
          ...snapshots,
        ];

  await writeLocalSnapshots(
    storageKey,
    nextSnapshots,
  );
}

async function readLocalSnapshots(
  storageKey: string,
  currentUserId: string | null,
): Promise<Snapshot[]> {
  const storedValue =
    await AsyncStorage.getItem(
      storageKey,
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

    return sortSnapshots(
      parsedValue
        .map((value) =>
          normalizeSnapshot(
            value,
            currentUserId,
          ),
        )
        .filter(
          (
            snapshot,
          ): snapshot is Snapshot =>
            snapshot !== null,
        ),
    );
  } catch {
    return [];
  }
}

async function writeLocalSnapshots(
  storageKey: string,
  snapshots: Snapshot[],
): Promise<void> {
  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify(
      sortSnapshots(
        snapshots,
      ),
    ),
  );
}

async function syncPendingDeletions(
  userId: string,
): Promise<void> {
  const snapshotIds =
    await readPendingDeletions(
      userId,
    );

  for (
    const snapshotId of
      snapshotIds
  ) {
    await deleteCloudSnapshot(
      snapshotId,
    );
  }

  if (
    snapshotIds.length >
    0
  ) {
    await writePendingDeletions(
      userId,
      [],
    );
  }
}

async function addPendingDeletion(
  userId: string,
  snapshotId: string,
): Promise<void> {
  const snapshotIds =
    await readPendingDeletions(
      userId,
    );

  await writePendingDeletions(
    userId,
    Array.from(
      new Set([
        ...snapshotIds,
        snapshotId,
      ]),
    ),
  );
}

async function removePendingDeletion(
  userId: string,
  snapshotId: string,
): Promise<void> {
  const snapshotIds =
    await readPendingDeletions(
      userId,
    );

  await writePendingDeletions(
    userId,
    snapshotIds.filter(
      (value) =>
        value !==
        snapshotId,
    ),
  );
}

async function readPendingDeletions(
  userId: string,
): Promise<string[]> {
  const value =
    await AsyncStorage.getItem(
      getDeletionStorageKey(
        userId,
      ),
    );

  if (!value) {
    return [];
  }

  try {
    const parsed: unknown =
      JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string" &&
            item.length >
              0,
        )
      : [];
  } catch {
    return [];
  }
}

async function writePendingDeletions(
  userId: string,
  snapshotIds: string[],
): Promise<void> {
  const key =
    getDeletionStorageKey(
      userId,
    );

  if (
    snapshotIds.length ===
    0
  ) {
    await AsyncStorage.removeItem(
      key,
    );

    return;
  }

  await AsyncStorage.setItem(
    key,
    JSON.stringify(
      snapshotIds,
    ),
  );
}

function normalizeSnapshot(
  value: unknown,
  currentUserId: string | null,
): Snapshot | null {
  if (
    typeof value !==
      "object" ||
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
    readString(
      record.sceneId,
    );

  const sceneName =
    readString(
      record.sceneName,
    );

  if (
    !id ||
    !sceneId ||
    !sceneName
  ) {
    return null;
  }

  const now =
    new Date().toISOString();

  const ownerId =
    readOptionalString(
      record.ownerId,
    );

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
            Math.round(
              record.positionMs,
            ),
          )
        : 0,

    note:
      readString(
        record.note,
      ),

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

    ownerId,

    isMine:
      ownerId &&
      currentUserId
        ? ownerId ===
          currentUserId
        : record.isMine !==
          false,

    pendingCloudSync:
      record.pendingCloudSync ===
      true,
  };
}

function getSnapshotStorageKey(
  userId: string | null,
): string {
  return userId
    ? `${SNAPSHOT_ACCOUNT_KEY_PREFIX}${userId}`
    : STORAGE_KEYS.snapshots;
}

function getDeletionStorageKey(
  userId: string,
): string {
  return `${SNAPSHOT_DELETION_KEY_PREFIX}${userId}`;
}

function createSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function sortSnapshots(
  snapshots: Snapshot[],
): Snapshot[] {
  return [
    ...snapshots,
  ].sort(
    (first, second) =>
      getSnapshotTimestamp(
        second,
      ) -
      getSnapshotTimestamp(
        first,
      ),
  );
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

function buildCloudWarning(
  action: string,
  error: unknown,
  suffix = "",
): string {
  const detail =
    error instanceof Error
      ? error.message
      : "The cloud request failed.";

  return [
    `Canal could not ${action}.`,
    detail,
    suffix,
  ]
    .filter(Boolean)
    .join(" ");
}
