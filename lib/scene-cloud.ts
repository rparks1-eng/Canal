import type {
  StoredScene,
} from "./scenes";

import {
  sameSceneStudioScope,
} from "./scene-studio-scope";
import type {
  SceneStudioScope,
} from "./scene-studio-scope";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

async function requireCanalUserId(): Promise<string> {
  requireSupabaseConfiguration();

  const {
    data: {
      session,
    },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const userId =
    session?.user.id;

  if (!userId) {
    throw new Error(
      "You must be signed into Canal before a Scene can be saved to the cloud.",
    );
  }

  return userId;
}

export async function saveSceneToCloud(
  scene: StoredScene,
): Promise<void> {
  const userId =
    await requireCanalUserId();

  const {
    error,
  } = await supabase
    .from("scenes")
    .upsert(
      {
        user_id: userId,
        id: scene.id,
        payload: scene,
        created_at: scene.createdAt,
        updated_at: scene.updatedAt,
        deleted_at: null,
      },
      {
        onConflict:
          "user_id,id",
      },
    );

  if (error) {
    throw new Error(
      `Supabase rejected the scoped Scene save: ${error.message}`,
    );
  }
}

export async function saveSceneToCloudForScope(
  scene: StoredScene,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<StoredScene> {
  requireSupabaseConfiguration();

  if (!sameSceneStudioScope(scope, currentScope())) {
    throw new Error("Canal stopped the Scene save because the active account changed.");
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (
    sessionError ||
    session?.user.id !== scope.userId ||
    !sameSceneStudioScope(scope, currentScope())
  ) {
    throw new Error("Canal stopped the Scene save because the active account changed.");
  }

  const expectedRevision =
    typeof scene.revision === "number" &&
    Number.isSafeInteger(scene.revision) &&
    scene.revision > 0
      ? scene.revision
      : null;

  if (expectedRevision !== null) {
    const { data, error } = await supabase.rpc(
      "update_collaborative_scene",
      {
        scene_owner_id_value: scope.userId,
        scene_id_value: scene.id,
        expected_revision_value: expectedRevision,
        scene_payload_value: scene,
      },
    );
    if (error) {
      throw new Error(`Supabase rejected the scoped Scene save: ${error.message}`);
    }
    const payload = data && typeof data === "object" && "payload" in data
      ? data.payload
      : null;
    return payload && typeof payload === "object"
      ? payload as StoredScene
      : { ...scene, revision: expectedRevision + 1 };
  }

  const { error } = await supabase
    .from("scenes")
    .upsert(
      {
        user_id: scope.userId,
        id: scene.id,
        payload: scene,
        created_at: scene.createdAt,
        updated_at: scene.updatedAt,
        deleted_at: null,
      },
      { onConflict: "user_id,id" },
    );

  if (error) {
    throw new Error(
      `Supabase rejected the scoped Scene save: ${error.message}`,
    );
  }

  // A successful owner-pinned upsert is the commit point. A later account
  // transition must suppress UI/local-cache work, never compensate through
  // whichever account happens to be active next.
  return {
    ...scene,
    ownerId: scope.userId,
    revision: 1,
  };
}

export async function deleteSceneFromCloud(
  sceneId: string,
): Promise<void> {
  const userId =
    await requireCanalUserId();

  const {
    error,
  } = await supabase
    .from("scenes")
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

export async function syncAllLocalScenesToCloud(): Promise<number> {
  const {
    readScenes,
  } = await import(
    "./scenes"
  );

  const scenes =
    await readScenes();

  for (const scene of scenes) {
    await saveSceneToCloud(
      scene,
    );
  }

  return scenes.length;
}
