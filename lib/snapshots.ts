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

import {
  canonicalSpotifyTrackUrl,
} from "./spotify-track-links";

import {
  isSnapshotTemplateTheme,
} from "./snapshot-templates";

import type {
  SnapshotTemplateTheme,
} from "./snapshot-templates";

export type SnapshotVisibility =
  | "public"
  | "private";

export type SnapshotMediaType =
  | "photo"
  | "video";

export type Snapshot = {
  id: string;
  sceneId: string;
  sceneName: string;
  sceneActivity?: string;
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackImageUrl?: string;
  spotifyUrl?: string;
  mediaType?: SnapshotMediaType;
  mediaUri?: string;
  mediaPath?: string;
  mediaMimeType?: string;
  positionMs: number;
  note: string;
  mood?: string;
  createdAt: string;
  updatedAt: string;
  visibility: SnapshotVisibility;
  templateId?: string;
  templateBrandLabel?: string;
  templateTheme?: SnapshotTemplateTheme;

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
  sceneActivity?: string;
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackImageUrl?: string;
  spotifyUrl?: string;
  mediaType?: SnapshotMediaType;
  mediaUri?: string;
  mediaMimeType?: string;
  positionMs?: number;
  note?: string;
  mood?: string;
  visibility?: SnapshotVisibility;
  templateId?: string;
  templateBrandLabel?: string;
  templateTheme?: SnapshotTemplateTheme;
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

const SNAPSHOT_ACCOUNT_CHANGED_ERROR_NAME =
  "SnapshotAccountChangedError";

const SNAPSHOT_ACCOUNT_CHANGED_ERROR_MESSAGE =
  "The active Snapshot account changed while Canal was working. Try again for the current account.";

const SNAPSHOT_ACCOUNT_CHANGED_WARNING =
  "Canal stopped loading Snapshots because the active account changed. Try again to load the current account.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;

class SnapshotAccountChangedError extends Error {
  constructor() {
    super(
      SNAPSHOT_ACCOUNT_CHANGED_ERROR_MESSAGE,
    );

    this.name =
      SNAPSHOT_ACCOUNT_CHANGED_ERROR_NAME;
  }
}

const activeSnapshotReads = new Map<string, Promise<SnapshotResult<Snapshot[]>>>();

export async function readSnapshotsWithStatus(): Promise<
  SnapshotResult<Snapshot[]>
> {
  const expectedUserId =
    await getSnapshotSessionUserId();
  const key = expectedUserId ?? "signed-out";
  const existing = activeSnapshotReads.get(key);
  if (existing) return existing;

  const read = readSnapshotsForUser(expectedUserId);
  activeSnapshotReads.set(key, read);
  try {
    return await read;
  } finally {
    if (activeSnapshotReads.get(key) === read) {
      activeSnapshotReads.delete(key);
    }
  }
}

export async function readLocalSnapshotsWithStatus(): Promise<
  SnapshotResult<Snapshot[]>
> {
  const expectedUserId =
    await getSnapshotSessionUserId();
  const storageKey =
    getSnapshotStorageKey(expectedUserId);
  const localSnapshots =
    await readLocalSnapshots(storageKey, expectedUserId);

  await assertExpectedSnapshotUser(expectedUserId);

  return {
    value: localSnapshots,
    cloudStatus: "local-only",
  };
}

async function readSnapshotsForUser(
  expectedUserId: string | null,
): Promise<
  SnapshotResult<Snapshot[]>
> {
  const storageKey =
    getSnapshotStorageKey(
      expectedUserId,
    );

  let localSnapshots:
    Snapshot[] =
    [];

  try {
    localSnapshots =
      await readLocalSnapshots(
        storageKey,
        expectedUserId,
      );

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    if (
      !isSupabaseConfigured ||
      !expectedUserId
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

    await syncPendingDeletions(
      expectedUserId,
    );

    const initialCloudResult =
      await listOwnCloudSnapshots(
        expectedUserId,
      );

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    if (
      initialCloudResult.userId !==
      expectedUserId
    ) {
      throw new SnapshotAccountChangedError();
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
            expectedUserId
        )
      ) {
        const syncedSnapshot =
          await upsertCloudSnapshot(
            {
              ...localSnapshot,

              ownerId:
                expectedUserId,

              isMine:
                true,
            },
            expectedUserId,
          );

        await assertExpectedSnapshotUser(
          expectedUserId,
        );

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

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    await writeLocalSnapshots(
      storageKey,
      syncedSnapshots,
    );

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    return {
      value:
        syncedSnapshots,

      cloudStatus:
        "synced",
    };
  } catch (error) {
    if (
      isSnapshotAccountChangedError(
        error,
      )
    ) {
      return snapshotAccountChangedResult(
        [],
      );
    }

    try {
      await assertExpectedSnapshotUser(
        expectedUserId,
      );
    } catch (
      accountError
    ) {
      if (
        isSnapshotAccountChangedError(
          accountError,
        )
      ) {
        return snapshotAccountChangedResult(
          [],
        );
      }

      throw accountError;
    }

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

  const expectedUserId =
    await getSnapshotSessionUserId();

  const ownResult =
    await readSnapshotsForUser(
      expectedUserId,
    );

  if (
    ownResult.warning ===
    SNAPSHOT_ACCOUNT_CHANGED_WARNING
  ) {
    return snapshotAccountChangedResult(
      null,
    );
  }

  try {
    await assertExpectedSnapshotUser(
      expectedUserId,
    );
  } catch (error) {
    if (
      isSnapshotAccountChangedError(
        error,
      )
    ) {
      return snapshotAccountChangedResult(
        null,
      );
    }

    throw error;
  }

  const ownSnapshot =
    ownResult.value.find(
      (snapshot) =>
        snapshot.id ===
        normalizedId,
    );

  if (ownSnapshot) {
    try {
      await assertExpectedSnapshotUser(
        expectedUserId,
      );
    } catch (error) {
      if (
        isSnapshotAccountChangedError(
          error,
        )
      ) {
        return snapshotAccountChangedResult(
          null,
        );
      }

      throw error;
    }

    return {
      ...ownResult,
      value:
        ownSnapshot,
    };
  }

  if (
    !isSupabaseConfigured ||
    !expectedUserId
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
        expectedUserId,
      );

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    return {
      value:
        publicSnapshot,

      cloudStatus:
        "synced",
    };
  } catch (error) {
    if (
      isSnapshotAccountChangedError(
        error,
      )
    ) {
      return snapshotAccountChangedResult(
        null,
      );
    }

    try {
      await assertExpectedSnapshotUser(
        expectedUserId,
      );
    } catch (
      accountError
    ) {
      if (
        isSnapshotAccountChangedError(
          accountError,
        )
      ) {
        return snapshotAccountChangedResult(
          null,
        );
      }

      throw accountError;
    }

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
  const expectedUserId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      expectedUserId,
    );

  const snapshots =
    await readLocalSnapshots(
      storageKey,
      expectedUserId,
    );

  await assertExpectedSnapshotUser(
    expectedUserId,
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

    sceneActivity:
      cleanOptionalString(
        input.sceneActivity,
      ),

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

    trackImageUrl:
      cleanSnapshotArtworkUrl(
        input.trackImageUrl,
      ),

    spotifyUrl:
      canonicalSpotifyTrackUrl(
        input.spotifyUrl,
      ) ??
      undefined,

    mediaType:
      input.mediaType === "photo" ||
      input.mediaType === "video"
        ? input.mediaType
        : undefined,

    mediaUri:
      cleanOptionalString(input.mediaUri),

    mediaMimeType:
      cleanOptionalString(input.mediaMimeType),

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

    templateId:
      cleanTemplateId(
        input.templateId,
      ),

    templateBrandLabel:
      cleanTemplateBrandLabel(
        input.templateBrandLabel,
      ),

    templateTheme:
      isSnapshotTemplateTheme(
        input.templateTheme,
      )
        ? input.templateTheme
        : undefined,

    ownerId:
      expectedUserId ??
      undefined,

    isMine:
      true,

    pendingCloudSync:
      true,
  };

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  await writeLocalSnapshots(
    storageKey,
    [
      snapshot,
      ...snapshots,
    ],
  );

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  return syncCreatedOrUpdatedSnapshot(
    snapshot,
    storageKey,
    expectedUserId,
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
  const expectedUserId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      expectedUserId,
    );

  const snapshots =
    await readLocalSnapshots(
      storageKey,
      expectedUserId,
    );

  await assertExpectedSnapshotUser(
    expectedUserId,
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
        expectedUserId
          ? "synced"
          : "local-only",
    };
  }

  if (
    existingSnapshot.isMine ===
      false ||
    (
      existingSnapshot.ownerId &&
      expectedUserId &&
      existingSnapshot.ownerId !==
        expectedUserId
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
        ? canonicalSpotifyTrackUrl(
            changes.spotifyUrl,
          ) ??
          undefined
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
      expectedUserId ??
      undefined,

    isMine:
      true,

    pendingCloudSync:
      true,
  };

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  await writeLocalSnapshots(
    storageKey,
    snapshots.map((snapshot) =>
      snapshot.id ===
      snapshotId
        ? updatedSnapshot
        : snapshot,
    ),
  );

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  return syncCreatedOrUpdatedSnapshot(
    updatedSnapshot,
    storageKey,
    expectedUserId,
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
  options: {
    templateId?:
      | string
      | null;
  } = {},
): Promise<
  SnapshotResult<Snapshot | null>
> {
  const expectedUserId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      expectedUserId,
    );

  const snapshots =
    await readLocalSnapshots(
      storageKey,
      expectedUserId,
    );

  await assertExpectedSnapshotUser(
    expectedUserId,
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

  const hasTemplateOverride =
    Object.prototype.hasOwnProperty.call(
      options,
      "templateId",
    );

  if (
    hasTemplateOverride &&
    snapshot.templateBrandLabel
  ) {
    throw new Error(
      "Published Snapshot template provenance cannot be changed.",
    );
  }

  const retrySnapshot =
    hasTemplateOverride
      ? {
          ...snapshot,
          templateId:
            options.templateId
              ? cleanTemplateId(
                  options.templateId,
                )
              : undefined,
          templateBrandLabel:
            undefined,
          templateTheme:
            undefined,
          pendingCloudSync:
            true,
        }
      : {
          ...snapshot,
          pendingCloudSync:
            true,
        };

  if (
    hasTemplateOverride
  ) {
    await replaceLocalSnapshot(
      storageKey,
      retrySnapshot,
      expectedUserId,
    );

    await assertExpectedSnapshotUser(
      expectedUserId,
    );
  }

  return syncCreatedOrUpdatedSnapshot(
    retrySnapshot,
    storageKey,
    expectedUserId,
  );
}

export async function deleteSnapshotWithStatus(
  snapshotId: string,
): Promise<SnapshotResult<null>> {
  const expectedUserId =
    await getSnapshotSessionUserId();

  const storageKey =
    getSnapshotStorageKey(
      expectedUserId,
    );

  const snapshots =
    await readLocalSnapshots(
      storageKey,
      expectedUserId,
    );

  await assertExpectedSnapshotUser(
    expectedUserId,
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
    !expectedUserId
  ) {
    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    return {
      value: null,
      cloudStatus:
        "local-only",
      warning:
        "The Snapshot was removed from this device, but Canal could not confirm a cloud deletion.",
    };
  }

  await addPendingDeletion(
    expectedUserId,
    snapshotId,
  );

  try {
    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    await deleteCloudSnapshot(
      snapshotId,
      expectedUserId,
    );

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    await removePendingDeletionForExpectedUser(
      expectedUserId,
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
  const expectedUserId =
    await getSnapshotSessionUserId();

  await writeLocalSnapshots(
    getSnapshotStorageKey(
      expectedUserId,
    ),
    sortSnapshots(
      snapshots,
    ),
  );

  await assertExpectedSnapshotUser(
    expectedUserId,
  );
}

async function syncCreatedOrUpdatedSnapshot(
  snapshot: Snapshot,
  storageKey: string,
  expectedUserId: string | null,
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

  if (
    snapshot.ownerId !==
    expectedUserId
  ) {
    throw new SnapshotAccountChangedError();
  }

  try {
    const syncedSnapshot =
      await upsertCloudSnapshot(
        snapshot,
        snapshot.ownerId,
      );

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    await replaceLocalSnapshot(
      storageKey,
      syncedSnapshot,
      expectedUserId,
    );

    return {
      value:
        syncedSnapshot,

      cloudStatus:
        "synced",
    };
  } catch (error) {
    if (
      isSnapshotAccountChangedError(
        error,
      )
    ) {
      throw error;
    }

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

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
  expectedUserId: string | null,
): Promise<void> {
  const snapshots =
    await readLocalSnapshots(
      storageKey,
      expectedUserId,
    );

  await assertExpectedSnapshotUser(
    expectedUserId,
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

  await assertExpectedSnapshotUser(
    expectedUserId,
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
  expectedUserId: string,
): Promise<void> {
  const snapshotIds =
    await readPendingDeletions(
      expectedUserId,
    );

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  for (
    const snapshotId of
      snapshotIds
  ) {
    await deleteCloudSnapshot(
      snapshotId,
      expectedUserId,
    );

    await assertExpectedSnapshotUser(
      expectedUserId,
    );

    await removePendingDeletionForExpectedUser(
      expectedUserId,
      snapshotId,
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

async function removePendingDeletionForExpectedUser(
  expectedUserId: string,
  snapshotId: string,
): Promise<void> {
  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  await removePendingDeletion(
    expectedUserId,
    snapshotId,
  );

  try {
    await assertExpectedSnapshotUser(
      expectedUserId,
    );
  } catch (error) {
    await addPendingDeletion(
      expectedUserId,
      snapshotId,
    );

    throw error;
  }
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

  const templateProvenance =
    normalizeTemplateProvenance(
      record,
    );

  return {
    id,
    sceneId,
    sceneName,

    sceneActivity:
      readOptionalString(
        record.sceneActivity,
      ),

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

    trackImageUrl:
      cleanSnapshotArtworkUrl(
        record.trackImageUrl,
      ),

    spotifyUrl:
      canonicalSpotifyTrackUrl(
        record.spotifyUrl,
      ) ??
      undefined,

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

    ...templateProvenance,

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

function cleanSnapshotArtworkUrl(
  value: unknown,
): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 2_048
  ) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const allowedHost =
      url.hostname === "i.scdn.co" ||
      url.hostname === "image-cdn-ak.spotifycdn.com" ||
      url.hostname === "image-cdn-fa.spotifycdn.com";

    return url.protocol === "https:" &&
      allowedHost &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      /^\/image\/[A-Za-z0-9]{16,128}$/u.test(url.pathname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function cleanTemplateId(
  value:
    | string
    | undefined,
): string | undefined {
  const cleaned =
    cleanOptionalString(
      value,
    );

  return cleaned &&
    UUID_PATTERN.test(
      cleaned,
    )
    ? cleaned
    : undefined;
}

function cleanTemplateBrandLabel(
  value: string | undefined,
): "canal" | undefined {
  return typeof value === "string" &&
    value.trim().toLowerCase() === "canal"
    ? "canal"
    : undefined;
}

function normalizeTemplateProvenance(
  record: Record<
    string,
    unknown
  >,
): {
  templateId?: string;
  templateBrandLabel?: string;
  templateTheme?: SnapshotTemplateTheme;
} {
  const templateId =
    typeof record.templateId ===
      "string" &&
    UUID_PATTERN.test(
      record.templateId.trim(),
    )
      ? record.templateId.trim()
      : "";

  const templateBrandLabel =
    readString(
      record.templateBrandLabel,
    );

  if (
    templateId &&
    !templateBrandLabel &&
    record.pendingCloudSync ===
      true
  ) {
    return {
      templateId,
    };
  }

  const builtInStyle =
    !templateId &&
    templateBrandLabel.toLowerCase() === "canal";

  if (
    (!templateId && !builtInStyle) ||
    !templateBrandLabel ||
    Array.from(
      templateBrandLabel,
    ).length >
      32 ||
    CONTROL_CHARACTER_PATTERN.test(
      templateBrandLabel,
    ) ||
    !isSnapshotTemplateTheme(
      record.templateTheme,
    )
  ) {
    return {};
  }

  return {
    templateId:
      templateId || undefined,
    templateBrandLabel,
    templateTheme:
      record.templateTheme,
  };
}

async function assertExpectedSnapshotUser(
  expectedUserId: string | null,
): Promise<void> {
  const actualUserId =
    await getSnapshotSessionUserId();

  if (
    actualUserId !==
    expectedUserId
  ) {
    throw new SnapshotAccountChangedError();
  }
}

function isSnapshotAccountChangedError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name ===
      SNAPSHOT_ACCOUNT_CHANGED_ERROR_NAME
  );
}

function snapshotAccountChangedResult<T>(
  value: T,
): SnapshotResult<T> {
  return {
    value,
    cloudStatus:
      "local-only",
    warning:
      SNAPSHOT_ACCOUNT_CHANGED_WARNING,
  };
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
