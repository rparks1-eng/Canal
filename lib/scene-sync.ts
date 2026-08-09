import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  clearScenes,
  readScenes,
  writeScenes,
} from "./scenes";

import type {
  StoredScene,
} from "./scenes";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

const ACTIVE_SCENE_USER_KEY =
  "@canal/active-scene-user";

const ISOLATION_VERSION =
  "account-isolation-v3";

type SceneRow = {
  user_id: string;
  id: string;
  revision: number;
  payload: Record<
    string,
    unknown
  >;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SceneSyncResult = {
  uploaded: number;
  downloaded: number;
  total: number;
  syncedAt: string;
};

export type SceneCacheOwner = {
  userId: string;
  generation: number;
};

type ActiveSceneSync = {
  owner: SceneCacheOwner;
  promise: Promise<SceneSyncResult>;
};

type CompletedSceneSync = {
  owner: SceneCacheOwner;
  completedAt: number;
  result: SceneSyncResult;
};

const SCENE_SYNC_MIN_INTERVAL_MS =
  30_000;

const SCENE_SYNC_FAILURE_BACKOFF_MS =
  30_000;

const activeSyncs =
  new Map<
    string,
    ActiveSceneSync
  >();

const completedSyncs =
  new Map<
    string,
    CompletedSceneSync
  >();

const failedSyncUntil =
  new Map<
    string,
    number
  >();

let observedUserId:
  string | null = null;

let sceneCacheGeneration =
  0;

let sceneCacheMutationTail:
  Promise<void> =
  Promise.resolve();

function observeSceneUser(
  userId: string | null,
): SceneCacheOwner | null {
  if (
    observedUserId !==
    userId
  ) {
    observedUserId =
      userId;

    sceneCacheGeneration +=
      1;
  }

  return userId
    ? {
        userId,
        generation:
          sceneCacheGeneration,
      }
    : null;
}

function sameSceneCacheOwner(
  first: SceneCacheOwner,
  second: SceneCacheOwner,
): boolean {
  return (
    first.userId ===
      second.userId &&
    first.generation ===
      second.generation
  );
}

function sceneCacheOwnerChangedError(): Error {
  return new Error(
    "The signed-in Canal account changed while Scenes were loading. Please try again.",
  );
}

async function withSceneCacheMutationLock<
  Result,
>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const previous =
    sceneCacheMutationTail;

  let release:
    () => void =
    () => undefined;

  sceneCacheMutationTail =
    new Promise<void>(
      (resolve) => {
        release =
          resolve;
      },
    );

  await previous.catch(
    () => undefined,
  );

  try {
    return await operation();
  } finally {
    release();
  }
}

function timestamp(
  value?: string | null,
): number {
  if (!value) {
    return 0;
  }

  const parsed =
    new Date(
      value,
    ).getTime();

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function sceneRevision(
  value: unknown,
): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function isolationKey(
  userId: string,
): string {
  return `@canal/scene-isolation:${ISOLATION_VERSION}:${userId}`;
}

function rowToScene(
  row: SceneRow,
): StoredScene | null {
  if (
    row.deleted_at ||
    !row.payload ||
    typeof row.payload !==
      "object"
  ) {
    return null;
  }

  const payload =
    row.payload as Partial<StoredScene> & {
      ownerId?: unknown;
    };

  if (
    typeof payload.name !==
      "string" ||
    !Array.isArray(
      payload.tracks,
    )
  ) {
    return null;
  }

  if (
    typeof payload.ownerId ===
      "string" &&
    payload.ownerId !==
      row.user_id
  ) {
    return null;
  }

  return {
    ...(payload as StoredScene),

    id:
      row.id,

    createdAt:
      row.created_at ||
      payload.createdAt ||
      new Date().toISOString(),

    updatedAt:
      row.updated_at ||
      payload.updatedAt ||
      new Date().toISOString(),
  };
}

async function getCurrentUserId(): Promise<string> {
  requireSupabaseConfiguration();

  const {
    data: {
      user,
    },
    error,
  } =
    await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error(
      "You must be signed into Canal before Scenes can synchronize.",
    );
  }

  return user.id;
}

async function captureSceneCacheOwner(): Promise<
  SceneCacheOwner
> {
  const userId =
    await getCurrentUserId();

  return (
    observeSceneUser(
      userId,
    ) as SceneCacheOwner
  );
}

async function captureLocalSceneCacheOwner(): Promise<
  SceneCacheOwner
> {
  requireSupabaseConfiguration();

  const {
    data: {
      session,
    },
    error,
  } =
    await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const userId =
    session?.user.id;

  if (!userId) {
    observeSceneUser(
      null,
    );

    throw new Error(
      "You must be signed into Canal before Scenes can synchronize.",
    );
  }

  return (
    observeSceneUser(
      userId,
    ) as SceneCacheOwner
  );
}

export async function assertSceneCacheOwner(
  expectedOwner: SceneCacheOwner,
): Promise<void> {
  const currentOwner =
    await captureLocalSceneCacheOwner();

  if (
    !sameSceneCacheOwner(
      expectedOwner,
      currentOwner,
    )
  ) {
    throw sceneCacheOwnerChangedError();
  }
}

async function prepareCapturedSceneCacheOwner(
  expectedOwner: SceneCacheOwner,
): Promise<void> {
  await withSceneCacheMutationLock(
    async () => {
      await assertSceneCacheOwner(
        expectedOwner,
      );

      const [
        activeUserId,
        isolationApplied,
      ] =
        await Promise.all([
          AsyncStorage.getItem(
            ACTIVE_SCENE_USER_KEY,
          ),

          AsyncStorage.getItem(
            isolationKey(
              expectedOwner.userId,
            ),
          ),
        ]);

      await assertSceneCacheOwner(
        expectedOwner,
      );

      const accountChanged =
        activeUserId !==
        expectedOwner.userId;

      const requiresOneTimeCleanup =
        isolationApplied !==
        "complete";

      if (
        accountChanged ||
        requiresOneTimeCleanup
      ) {
        await clearScenes();

        await assertSceneCacheOwner(
          expectedOwner,
        );
      }

      await AsyncStorage.multiSet([
        [
          ACTIVE_SCENE_USER_KEY,
          expectedOwner.userId,
        ],

        [
          isolationKey(
            expectedOwner.userId,
          ),
          "complete",
        ],
      ]);

      await assertSceneCacheOwner(
        expectedOwner,
      );
    },
  );
}

export async function capturePreparedSceneCacheOwner(): Promise<
  SceneCacheOwner
> {
  const owner =
    await captureSceneCacheOwner();

  await prepareCapturedSceneCacheOwner(
    owner,
  );

  return owner;
}

export async function writeScenesForSceneCacheOwner(
  expectedOwner: SceneCacheOwner,
  scenes: StoredScene[],
): Promise<void> {
  await withSceneCacheMutationLock(
    async () => {
      await assertSceneCacheOwner(
        expectedOwner,
      );

      const activeUserId =
        await AsyncStorage.getItem(
          ACTIVE_SCENE_USER_KEY,
        );

      await assertSceneCacheOwner(
        expectedOwner,
      );

      if (
        activeUserId !==
        expectedOwner.userId
      ) {
        throw sceneCacheOwnerChangedError();
      }

      await writeScenes(
        scenes,
      );

      try {
        await assertSceneCacheOwner(
          expectedOwner,
        );
      } catch (error) {
        /*
         * The shared cache may briefly contain the
         * former account's write. Clear it before
         * allowing the next account's preparation
         * to acquire this lock.
         */
        await clearScenes();

        await AsyncStorage.removeItem(
          ACTIVE_SCENE_USER_KEY,
        );

        throw error;
      }
    },
  );
}

/*
 * Canal previously stored every account's Scenes
 * under one AsyncStorage key. This guard empties
 * that shared cache before a different account is
 * hydrated. It also runs once for every account
 * after this repair so already-contaminated caches
 * are removed.
 */
export async function prepareSceneLibraryForUser(
  userId: string,
): Promise<void> {
  const currentUserId =
    await getCurrentUserId();

  if (
    currentUserId !==
    userId
  ) {
    observeSceneUser(
      currentUserId,
    );

    throw sceneCacheOwnerChangedError();
  }

  const owner =
    observeSceneUser(
      userId,
    ) as SceneCacheOwner;

  await prepareCapturedSceneCacheOwner(
    owner,
  );
}

export async function uploadSceneToCloud(
  scene: StoredScene,
): Promise<void> {
  const owner =
    await capturePreparedSceneCacheOwner();

  const payload = {
    ...scene,

    ownerId:
      owner.userId,
  };

  await assertSceneCacheOwner(
    owner,
  );

  const {
    error,
  } =
    await supabase
      .from(
        "scenes",
      )
      .upsert(
        {
          user_id:
            owner.userId,

          id:
            scene.id,

          payload,

          created_at:
            scene.createdAt,

          updated_at:
            scene.updatedAt,

          deleted_at:
            null,
        },
        {
          onConflict:
            "user_id,id",
        },
      );

  if (error) {
    throw new Error(
      `The Scene was saved on this device, but Canal could not upload it to Supabase: ${error.message}`,
    );
  }

  await assertSceneCacheOwner(
    owner,
  );
}

export async function deleteSceneFromCloud(
  sceneId: string,
): Promise<void> {
  const owner =
    await capturePreparedSceneCacheOwner();

  await assertSceneCacheOwner(
    owner,
  );

  await applySceneDeletionToCloud(
    owner,
    sceneId,
  );

  await assertSceneCacheOwner(
    owner,
  );
}

export async function deleteSceneForCurrentOwner(
  sceneId: string,
): Promise<void> {
  const owner =
    await capturePreparedSceneCacheOwner();

  await withSceneCacheMutationLock(
    async () => {
      const deletionIds =
        await readSceneDeletionIds(
          owner,
        );

      deletionIds.add(
        sceneId,
      );

      const scenes =
        await readScenes();

      await AsyncStorage.setItem(
        sceneDeletionKey(
          owner.userId,
        ),
        JSON.stringify(
          Array.from(
            deletionIds,
          ).slice(-500),
        ),
      );

      await writeScenes(
        scenes.filter(
          (scene) =>
            scene.id !== sceneId,
        ),
      );

      await assertSceneCacheOwner(
        owner,
      );
    },
  );

  await applySceneDeletionToCloud(
    owner,
    sceneId,
  );

  await assertSceneCacheOwner(
    owner,
  );
}

async function performSceneSync(
  owner: SceneCacheOwner,
): Promise<
  SceneSyncResult
> {
  await prepareCapturedSceneCacheOwner(
    owner,
  );

  const localScenes =
    await readScenes();

  await assertSceneCacheOwner(
    owner,
  );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "scenes",
      )
      .select(
        "user_id, id, payload, revision, created_at, updated_at, deleted_at",
      )
      .eq(
        "user_id",
        owner.userId,
      );

  if (error) {
    throw new Error(
      `Canal could not read this account's cloud Scenes: ${error.message}`,
    );
  }

  await assertSceneCacheOwner(
    owner,
  );

  const remoteRows =
    (
      data ??
      []
    ) as SceneRow[];

  let deletionIds =
    await readSceneDeletionIds(
      owner,
    );

  for (const sceneId of deletionIds) {
    await applySceneDeletionToCloud(
      owner,
      sceneId,
    );
  }

  const remoteById =
    new Map<
      string,
      SceneRow
    >();

  for (
    const row of
      remoteRows
  ) {
    remoteById.set(
      row.id,
      row,
    );
  }

  const merged =
    new Map<
      string,
      StoredScene
    >();

  let downloaded =
    0;

  for (
    const row of
      remoteRows
  ) {
    const remoteScene =
      rowToScene(
        row,
      );

    if (remoteScene) {
      merged.set(
        remoteScene.id,
        remoteScene,
      );
    }
  }

  const uploads: {
      user_id: string;
      id: string;
      payload: Record<
        string,
        unknown
      >;
      created_at: string;
      updated_at: string;
      deleted_at: null;
    }[] = [];

  for (
    const localScene of
      localScenes
  ) {
    const remoteRow =
      remoteById.get(
        localScene.id,
      );

    if (!remoteRow) {
      uploads.push({
        user_id:
          owner.userId,

        id:
          localScene.id,

        payload: {
          ...localScene,

          ownerId:
            owner.userId,
        },

        created_at:
          localScene.createdAt,

        updated_at:
          localScene.updatedAt,

        deleted_at:
          null,
      });

      merged.set(
        localScene.id,
        localScene,
      );

      continue;
    }

    if (
      timestamp(
        localScene.updatedAt,
      ) >
      timestamp(
        remoteRow.updated_at,
      )
    ) {
      const remoteRevision =
        sceneRevision(
          remoteRow.revision,
        );
      const localRevision =
        sceneRevision(
          localScene.revision,
        );

      /*
       * A newer local timestamp is not authority to overwrite a newer
       * collaborative revision. Keep the server copy and let the user
       * explicitly resolve the conflict instead of submitting a stale
       * upsert that the revision trigger must reject.
       */
      if (
        remoteRevision !== null &&
        localRevision !==
          remoteRevision
      ) {
        continue;
      }

      uploads.push({
        user_id:
          owner.userId,

        id:
          localScene.id,

        payload: {
          ...localScene,

          ownerId:
            owner.userId,

          ...(remoteRevision !== null
            ? {
                revision:
                  remoteRevision,
              }
            : {}),
        },

        created_at:
          localScene.createdAt,

        updated_at:
          localScene.updatedAt,

        deleted_at:
          null,
      });

      merged.set(
        localScene.id,
        localScene,
      );

      continue;
    }

    const remoteScene =
      rowToScene(
        remoteRow,
      );

    if (
      remoteScene &&
      timestamp(
        remoteScene.updatedAt,
      ) >
      timestamp(
        localScene.updatedAt,
      )
    ) {
      downloaded +=
        1;
    }
  }

  if (
    uploads.length >
    0
  ) {
    deletionIds =
      await readSceneDeletionIds(
        owner,
      );

    const safeUploads =
      uploads.filter(
        (upload) =>
          !deletionIds.has(
            upload.id,
          ),
      );

    if (safeUploads.length > 0) {
    await assertSceneCacheOwner(
      owner,
    );

    const {
      error: uploadError,
    } =
      await supabase
        .from(
          "scenes",
        )
        .upsert(
          safeUploads,
          {
            onConflict:
              "user_id,id",
          },
        );

    if (uploadError) {
      throw new Error(
        `Canal could not upload this account's Scenes: ${uploadError.message}`,
      );
    }

    await assertSceneCacheOwner(
      owner,
    );
    }

    for (const sceneId of deletionIds) {
      await applySceneDeletionToCloud(
        owner,
        sceneId,
      );
    }
  }

  let uploaded =
    0;

  for (
    const row of
      remoteRows
  ) {
    if (
      !localScenes.some(
        (scene) =>
          scene.id ===
          row.id,
      )
    ) {
      const remoteScene =
        rowToScene(
          row,
        );

      if (remoteScene) {
        downloaded +=
          1;
      }
    }
  }

  const mergedScenes =
    Array.from(
      merged.values(),
    )
      .filter(
        (scene) =>
          !deletionIds.has(
            scene.id,
          ),
      )
      .sort(
      (
        first,
        second,
      ) =>
        timestamp(
          second.updatedAt,
        ) -
        timestamp(
          first.updatedAt,
        ),
    );

  await writeScenesForSceneCacheOwner(
    owner,
    mergedScenes,
  );

  const pendingDeletionIds =
    Array.from(
      deletionIds,
    ).filter(
      (sceneId) => {
        const row =
          remoteById.get(
            sceneId,
          );

        return Boolean(
          row &&
          !row.deleted_at,
        );
      },
    );

  await AsyncStorage.setItem(
    sceneDeletionKey(
      owner.userId,
    ),
    JSON.stringify(
      pendingDeletionIds,
    ),
  );

  await assertSceneCacheOwner(
    owner,
  );

  return {
    uploaded:
      uploaded,

    downloaded,

    total:
      mergedScenes.length,

    syncedAt:
      new Date().toISOString(),
  };
}

export async function syncScenesWithCloud(): Promise<
  SceneSyncResult
> {
  const owner =
    await captureLocalSceneCacheOwner();

  const existing =
    activeSyncs.get(
      owner.userId,
    );

  if (
    existing &&
    sameSceneCacheOwner(
      existing.owner,
      owner,
    )
  ) {
    return existing.promise;
  }

  const completed =
    completedSyncs.get(
      owner.userId,
    );

  if (
    completed &&
    sameSceneCacheOwner(
      completed.owner,
      owner,
    ) &&
    Date.now() -
      completed.completedAt <
      SCENE_SYNC_MIN_INTERVAL_MS
  ) {
    return completed.result;
  }

  const retryAt =
    failedSyncUntil.get(
      owner.userId,
    ) ?? 0;

  if (Date.now() < retryAt) {
    throw new Error(
      "Canal is waiting before retrying Scene synchronization after a temporary Supabase error.",
    );
  }

  const active: ActiveSceneSync = {
    owner,
    promise:
      (async () => {
        const validatedOwner =
          await captureSceneCacheOwner();

        if (
          !sameSceneCacheOwner(
            owner,
            validatedOwner,
          )
        ) {
          throw sceneCacheOwnerChangedError();
        }

        return performSceneSync(
          owner,
        );
      })(),
  };

  activeSyncs.set(
    owner.userId,
    active,
  );

  try {
    const result =
      await active.promise;

    completedSyncs.set(
      owner.userId,
      {
        owner,
        completedAt:
          Date.now(),
        result,
      },
    );

    failedSyncUntil.delete(
      owner.userId,
    );

    return result;
  } catch (error) {
    failedSyncUntil.set(
      owner.userId,
      Date.now() +
        SCENE_SYNC_FAILURE_BACKOFF_MS,
    );

    throw error;
  } finally {
    if (
      activeSyncs.get(
        owner.userId,
      ) === active
    ) {
      activeSyncs.delete(
        owner.userId,
      );
    }
  }
}

/*
 * This removes the active marker during full
 * logout. The next signed-in account will always
 * clear the shared local cache before hydration.
 */
export async function clearSceneSyncOwnership(): Promise<void> {
  observeSceneUser(
    null,
  );

  activeSyncs.clear();
  completedSyncs.clear();
  failedSyncUntil.clear();

  await withSceneCacheMutationLock(
    async () => {
      await AsyncStorage.removeItem(
        ACTIVE_SCENE_USER_KEY,
      );
    },
  );
}
