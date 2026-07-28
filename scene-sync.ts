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

let activeSync:
  Promise<SceneSyncResult> | null =
  null;

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
          userId,
        ),
      ),
    ]);

  const accountChanged =
    activeUserId !==
    userId;

  const requiresOneTimeCleanup =
    isolationApplied !==
    "complete";

  if (
    accountChanged ||
    requiresOneTimeCleanup
  ) {
    await clearScenes();
  }

  await AsyncStorage.multiSet([
    [
      ACTIVE_SCENE_USER_KEY,
      userId,
    ],

    [
      isolationKey(
        userId,
      ),
      "complete",
    ],
  ]);
}

export async function uploadSceneToCloud(
  scene: StoredScene,
): Promise<void> {
  const userId =
    await getCurrentUserId();

  await prepareSceneLibraryForUser(
    userId,
  );

  const payload = {
    ...scene,

    ownerId:
      userId,
  };

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
            userId,

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
}

export async function deleteSceneFromCloud(
  sceneId: string,
): Promise<void> {
  const userId =
    await getCurrentUserId();

  const {
    error,
  } =
    await supabase
      .from(
        "scenes",
      )
      .delete()
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "id",
        sceneId,
      );

  if (error) {
    throw new Error(
      `Canal could not delete the cloud Scene: ${error.message}`,
    );
  }
}

async function performSceneSync(): Promise<
  SceneSyncResult
> {
  const userId =
    await getCurrentUserId();

  await prepareSceneLibraryForUser(
    userId,
  );

  const localScenes =
    await readScenes();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "scenes",
      )
      .select(
        "user_id, id, payload, created_at, updated_at, deleted_at",
      )
      .eq(
        "user_id",
        userId,
      );

  if (error) {
    throw new Error(
      `Canal could not read this account's cloud Scenes: ${error.message}`,
    );
  }

  const remoteRows =
    (
      data ??
      []
    ) as SceneRow[];

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

  const uploads:
    Array<{
      user_id: string;
      id: string;
      payload: Record<
        string,
        unknown
      >;
      created_at: string;
      updated_at: string;
      deleted_at: null;
    }> = [];

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
          userId,

        id:
          localScene.id,

        payload: {
          ...localScene,

          ownerId:
            userId,
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
      uploads.push({
        user_id:
          userId,

        id:
          localScene.id,

        payload: {
          ...localScene,

          ownerId:
            userId,
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
    const {
      error: uploadError,
    } =
      await supabase
        .from(
          "scenes",
        )
        .upsert(
          uploads,
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
  }

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
    ).sort(
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

  await writeScenes(
    mergedScenes,
  );

  return {
    uploaded:
      uploads.length,

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
  if (activeSync) {
    return activeSync;
  }

  activeSync =
    performSceneSync();

  try {
    return await activeSync;
  } finally {
    activeSync =
      null;
  }
}

/*
 * This removes the active marker during full
 * logout. The next signed-in account will always
 * clear the shared local cache before hydration.
 */
export async function clearSceneSyncOwnership(): Promise<void> {
  await AsyncStorage.removeItem(
    ACTIVE_SCENE_USER_KEY,
  );
}
