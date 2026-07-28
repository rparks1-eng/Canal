import {
  deleteScene,
  readScenes,
} from "./scenes";

import type {
  StoredScene,
} from "./scenes";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

type SavedSceneRelationship = {
  source_user_id: string;
  source_scene_id: string;
  payload:
    | Record<
        string,
        unknown
      >
    | null;
};

function readOptionalString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value
    : "";
}

function relationshipMatchesScene(
  relationship: SavedSceneRelationship,
  scene: StoredScene,
): boolean {
  const sourceOwnerId =
    readOptionalString(
      scene.sourceOwnerId,
    );

  const sourceSceneId =
    readOptionalString(
      scene.sourceSceneId,
    );

  if (
    sourceOwnerId &&
    sourceSceneId &&
    relationship
      .source_user_id ===
      sourceOwnerId &&
    relationship
      .source_scene_id ===
      sourceSceneId
  ) {
    return true;
  }

  const payload =
    relationship.payload ??
    {};

  const payloadId =
    readOptionalString(
      payload.id,
    );

  const payloadName =
    readOptionalString(
      payload.name,
    );

  if (
    sourceSceneId &&
    relationship
      .source_scene_id ===
      sourceSceneId
  ) {
    return true;
  }

  if (
    payloadId &&
    (
      payloadId ===
        sourceSceneId ||
      payloadId ===
        scene.id
    )
  ) {
    return true;
  }

  const payloadTracks =
    Array.isArray(
      payload.tracks,
    )
      ? payload.tracks
      : [];

  const payloadTrackIds =
    new Set(
      payloadTracks
        .map(
          (track) => {
            if (
              typeof track !==
                "object" ||
              track ===
                null
            ) {
              return "";
            }

            return readOptionalString(
              (
                track as Record<
                  string,
                  unknown
                >
              ).id,
            );
          },
        )
        .filter(
          Boolean,
        ),
    );

  const matchingTrackCount =
    scene.tracks.filter(
      (track) =>
        payloadTrackIds.has(
          track.id,
        ),
    ).length;

  return Boolean(
    payloadName &&
      payloadName ===
        scene.name &&
      matchingTrackCount >
        0,
  );
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

  const {
    data: {
      user,
    },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error(
      "Your Canal session expired. Sign in again.",
    );
  }

  const {
    data: relationships,
    error: relationshipReadError,
  } =
    await supabase
      .from(
        "saved_scenes",
      )
      .select(
        "source_user_id, source_scene_id, payload",
      )
      .eq(
        "user_id",
        user.id,
      );

  if (
    relationshipReadError
  ) {
    throw new Error(
      `Canal could not inspect the saved Scene relationship: ${relationshipReadError.message}`,
    );
  }

  const matchingRelationships =
    (
      relationships ??
      []
    )
      .map(
        (
          value,
        ) =>
          value as SavedSceneRelationship,
      )
      .filter(
        (relationship) =>
          relationshipMatchesScene(
            relationship,
            scene,
          ),
      );

  for (
    const relationship of
      matchingRelationships
  ) {
    const {
      error,
    } =
      await supabase
        .from(
          "saved_scenes",
        )
        .delete()
        .eq(
          "user_id",
          user.id,
        )
        .eq(
          "source_user_id",
          relationship
            .source_user_id,
        )
        .eq(
          "source_scene_id",
          relationship
            .source_scene_id,
        );

    if (error) {
      throw new Error(
        `Canal could not remove the saved Scene relationship: ${error.message}`,
      );
    }
  }

  const {
    error: cloudSceneError,
  } =
    await supabase
      .from(
        "scenes",
      )
      .delete()
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "id",
        scene.id,
      );

  if (cloudSceneError) {
    throw new Error(
      `Canal could not remove the saved Scene copy from Supabase: ${cloudSceneError.message}`,
    );
  }

  await deleteScene(
    scene.id,
  );

  const remainingLocalScenes =
    await readScenes();

  if (
    remainingLocalScenes.some(
      (candidate) =>
        candidate.id ===
        scene.id,
    )
  ) {
    throw new Error(
      "Canal removed the cloud copy but the local Scene remained.",
    );
  }

  const {
    data: remainingCloudScene,
    error: verifyCloudError,
  } =
    await supabase
      .from(
        "scenes",
      )
      .select(
        "id",
      )
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "id",
        scene.id,
      )
      .maybeSingle();

  if (verifyCloudError) {
    throw new Error(
      `Canal could not verify Scene deletion: ${verifyCloudError.message}`,
    );
  }

  if (
    remainingCloudScene
  ) {
    throw new Error(
      "Supabase still contains the saved Scene copy.",
    );
  }
}
