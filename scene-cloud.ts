import type {
  StoredScene,
} from "./scenes";

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
      `Canal saved the Scene locally, but Supabase rejected the cloud save: ${error.message}`,
    );
  }
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
