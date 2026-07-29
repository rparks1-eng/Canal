import {
  readScenes,
} from "./scenes";

import type {
  StoredScene,
} from "./scenes";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

import {
  assertSceneCacheOwner,
  capturePreparedSceneCacheOwner,
  writeScenesForSceneCacheOwner,
} from "./scene-sync";

function readOptionalString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value
    : "";
}

export async function removeSavedSceneCompletely(
  scene: StoredScene,
): Promise<void> {
  requireSupabaseConfiguration();

  if (
    scene.libraryType !==
    "saved"
  ) {
    throw new Error(
      "This action is only for Scenes saved from another creator.",
    );
  }

  const sceneCacheOwner =
    await capturePreparedSceneCacheOwner();

  let sourceOwnerId =
    readOptionalString(
      scene.sourceOwnerId,
    );

  let sourceSceneId =
    readOptionalString(
      scene.sourceSceneId,
    );

  if (
    !sourceOwnerId ||
    !sourceSceneId
  ) {
    await assertSceneCacheOwner(
      sceneCacheOwner,
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
          "payload",
        )
        .eq(
          "user_id",
          sceneCacheOwner.userId,
        )
        .eq(
          "id",
          scene.id,
        )
        .maybeSingle();

    await assertSceneCacheOwner(
      sceneCacheOwner,
    );

    if (error) {
      throw new Error(
        `Canal could not inspect the saved Scene copy: ${error.message}`,
      );
    }

    const payload =
      data &&
      typeof data ===
        "object" &&
      typeof (
        data as {
          payload?: unknown;
        }
      ).payload ===
        "object" &&
      (
        data as {
          payload?: unknown;
        }
      ).payload !==
        null
        ? (
            data as {
              payload:
                Record<
                  string,
                  unknown
                >;
            }
          ).payload
        : null;

    const recoveredOwnerId =
      readOptionalString(
        payload
          ?.sourceOwnerId,
      );

    const recoveredSceneId =
      readOptionalString(
        payload
          ?.sourceSceneId,
      );

    const recoveredCopyId =
      readOptionalString(
        payload?.id,
      );

    if (
      readOptionalString(
        payload
          ?.libraryType,
      ) !==
        "saved" ||
      recoveredCopyId !==
        scene.id ||
      !recoveredOwnerId ||
      !recoveredSceneId
    ) {
      throw new Error(
        "Canal could not safely identify this legacy saved Scene. Refresh your library to recover its source details before removing it.",
      );
    }

    sourceOwnerId =
      recoveredOwnerId;
    sourceSceneId =
      recoveredSceneId;
  }

  await assertSceneCacheOwner(
    sceneCacheOwner,
  );

  const {
    error,
  } =
    await supabase.rpc(
      "remove_saved_scene_from_library",
      {
        source_owner_id_value:
          sourceOwnerId,
        source_scene_id_value:
          sourceSceneId,
        saved_copy_id_value:
          scene.id,
      },
    );

  if (error) {
    throw new Error(
      `Canal could not remove the saved Scene: ${error.message}`,
    );
  }

  await assertSceneCacheOwner(
    sceneCacheOwner,
  );

  const localScenes =
    await readScenes();

  await assertSceneCacheOwner(
    sceneCacheOwner,
  );

  await writeScenesForSceneCacheOwner(
    sceneCacheOwner,
    localScenes.filter(
      (candidate) =>
        candidate.id !==
        scene.id,
    ),
  );
}
