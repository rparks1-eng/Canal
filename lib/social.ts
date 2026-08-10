import * as Crypto from "expo-crypto";

import {
  normalizeStoredScene,
  readScenes,
} from "./scenes";

import type {
  SceneVisibility,
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

type ProfileRow = {
  id: string;
  display_name: string | null;
  handle: string | null;
  bio: string | null;
  favorite_activities: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  is_verified: boolean | null;
  is_canal: boolean | null;
};

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

type SavedSceneRow = {
  source_user_id: string;
  source_scene_id: string;
};

export type PublicCanalProfile = {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  favoriteActivities: string;
  avatarUrl: string | null;
  isPublic: boolean;
  isVerified: boolean;
  isCanal: boolean;
};

export type PublicCanalScene = {
  ownerId: string;
  sceneId: string;
  scene: StoredScene;
  creator: PublicCanalProfile;
  updatedAt: string;
  savedByMe: boolean;
  isMine: boolean;
};

let exploreSceneCache: {
  userId: string;
  generation: number;
  expiresAt: number;
  scenes: PublicCanalScene[];
} | null = null;

function normalizeProfile(
  row: ProfileRow | null,
  userId: string,
): PublicCanalProfile {
  return {
    id:
      userId,

    displayName:
      row?.display_name ||
      "Canal Listener",

    handle:
      row?.handle
        ? `@${row.handle}`
        : `@canal_${userId
            .replace(
              /-/g,
              "",
            )
            .slice(
              0,
              8,
            )}`,

    bio:
      row?.bio ||
      "",

    favoriteActivities:
      row?.favorite_activities ||
      "",

    avatarUrl:
      row?.avatar_url ||
      null,

    isPublic:
      row?.is_public !==
      false,

    isVerified:
      row?.is_verified ===
        true,

    isCanal:
      row?.is_canal ===
        true,
  };
}

function normalizeScene(
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
    row.payload as Partial<StoredScene>;

  if (
    typeof payload.name !==
      "string" ||
    !Array.isArray(
      payload.tracks,
    )
  ) {
    return null;
  }

  const scene =
    normalizeStoredScene({
      ...payload,
      id:
        row.id,
      ownerId:
        row.user_id,
      visibility:
        payload.visibility ===
        "public"
          ? "public"
          : "private",
      libraryType:
        payload.libraryType ||
        "created",
      createdAt:
        row.created_at ||
        payload.createdAt ||
        new Date().toISOString(),
      updatedAt:
        row.updated_at ||
        payload.updatedAt ||
        new Date().toISOString(),
    });

  return scene;
}

async function currentUserId(): Promise<string> {
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
      "You must be signed into Canal.",
    );
  }

  return user.id;
}

async function loadProfiles(
  userIds: string[],
): Promise<
  Map<
    string,
    PublicCanalProfile
  >
> {
  const uniqueIds =
    Array.from(
      new Set(
        userIds,
      ),
    );

  const profiles =
    new Map<
      string,
      PublicCanalProfile
    >();

  if (
    uniqueIds.length ===
    0
  ) {
    return profiles;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "profiles",
      )
      .select(
        "id, display_name, handle, bio, favorite_activities, avatar_url, is_public, is_verified, is_canal",
      )
      .in(
        "id",
        uniqueIds,
      );

  if (error) {
    throw new Error(
      `Canal could not load public profiles: ${error.message}`,
    );
  }

  for (
    const row of
      (data ?? []) as ProfileRow[]
  ) {
    profiles.set(
      row.id,
      normalizeProfile(
        row,
        row.id,
      ),
    );
  }

  return profiles;
}

async function loadSavedKeys(
  userId: string,
): Promise<Set<string>> {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "saved_scenes",
      )
      .select(
        "source_user_id, source_scene_id",
      )
      .eq(
        "user_id",
        userId,
      );

  if (error) {
    throw new Error(
      `Canal could not load saved Scenes: ${error.message}`,
    );
  }

  return new Set(
    (
      (data ?? []) as SavedSceneRow[]
    ).map(
      (row) =>
        `${row.source_user_id}:${row.source_scene_id}`,
    ),
  );
}

export async function loadExploreScenes(
  options: { force?: boolean } = {},
): Promise<
  PublicCanalScene[]
> {
  const sceneCacheOwner = await capturePreparedSceneCacheOwner();
  const userId = sceneCacheOwner.userId;
  if (
    !options.force &&
    exploreSceneCache?.userId === sceneCacheOwner.userId &&
    exploreSceneCache.generation === sceneCacheOwner.generation &&
    exploreSceneCache.expiresAt > Date.now()
  ) {
    return exploreSceneCache.scenes;
  }

  const [
    sceneResult,
    savedKeys,
  ] =
    await Promise.all([
      supabase
        .from(
          "scenes",
        )
        .select(
          "user_id, id, payload, created_at, updated_at, deleted_at",
        )
        .is(
          "deleted_at",
          null,
        )
        .eq(
          "payload->>visibility",
          "public",
        )
        .order(
          "updated_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          250,
        ),

      loadSavedKeys(
        userId,
      ),
    ]);

  await assertSceneCacheOwner(sceneCacheOwner);

  if (
    sceneResult.error
  ) {
    throw new Error(
      `Canal could not load Explore: ${sceneResult.error.message}`,
    );
  }

  const rows =
    (
      sceneResult.data ??
      []
    ) as SceneRow[];

  const publicRows = rows;

  const profiles =
    await loadProfiles(
      publicRows.map(
        (row) =>
          row.user_id,
      ),
    );

  await assertSceneCacheOwner(sceneCacheOwner);

  const result = publicRows
    .map(
      (
        row,
      ): PublicCanalScene | null => {
        const scene =
          normalizeScene(
            row,
          );

        const creator =
          profiles.get(
            row.user_id,
          );

        if (
          !scene ||
          !creator ||
          !creator.isPublic
        ) {
          return null;
        }

        return {
          ownerId:
            row.user_id,

          sceneId:
            row.id,

          scene,

          creator:
            creator,

          updatedAt:
            row.updated_at,

          savedByMe:
            savedKeys.has(
              `${row.user_id}:${row.id}`,
            ),

          isMine:
            row.user_id ===
            userId,
        };
      },
    )
    .filter(
      (
        value,
      ): value is PublicCanalScene =>
        Boolean(
          value,
      ),
    );

  exploreSceneCache = {
    userId: sceneCacheOwner.userId,
    generation: sceneCacheOwner.generation,
    expiresAt: Date.now() + 30_000,
    scenes: result,
  };
  return result;
}

export async function loadPublicProfile(
  userId: string,
): Promise<{
  profile: PublicCanalProfile;
  scenes: PublicCanalScene[];
}> {
  const viewerId =
    await currentUserId();

  const [
    profileResult,
    sceneResult,
    savedKeys,
  ] =
    await Promise.all([
      supabase
        .from(
          "profiles",
        )
        .select(
          "id, display_name, handle, bio, favorite_activities, avatar_url, is_public, is_verified, is_canal",
        )
        .eq(
          "id",
          userId,
        )
        .maybeSingle(),

      supabase
        .from(
          "scenes",
        )
        .select(
          "user_id, id, payload, created_at, updated_at, deleted_at",
        )
        .eq(
          "user_id",
          userId,
        )
        .is(
          "deleted_at",
          null,
        )
        .order(
          "updated_at",
          {
            ascending:
              false,
          },
        ),

      loadSavedKeys(
        viewerId,
      ),
    ]);

  if (
    profileResult.error
  ) {
    throw new Error(
      `Canal could not load this profile: ${profileResult.error.message}`,
    );
  }

  if (
    sceneResult.error
  ) {
    throw new Error(
      `Canal could not load this profile's Scenes: ${sceneResult.error.message}`,
    );
  }

  if (
    !profileResult.data
  ) {
    throw new Error(
      "This profile is unavailable or private.",
    );
  }

  const profile =
    normalizeProfile(
      profileResult.data as
        ProfileRow,
      userId,
    );

  if (
    !profile.isPublic &&
    viewerId !==
      userId
  ) {
    throw new Error(
      "This profile is unavailable or private.",
    );
  }

  const scenes =
    (
      (
        sceneResult.data ??
        []
      ) as SceneRow[]
    )
      .map(
        (row) => {
          const scene =
            normalizeScene(
              row,
            );

          if (
            !scene ||
            scene.visibility !==
              "public"
          ) {
            return null;
          }

          return {
            ownerId:
              row.user_id,

            sceneId:
              row.id,

            scene,

            creator:
              profile,

            updatedAt:
              row.updated_at,

            savedByMe:
              savedKeys.has(
                `${row.user_id}:${row.id}`,
              ),

            isMine:
              row.user_id ===
              viewerId,
          } satisfies PublicCanalScene;
        },
      )
      .filter(
        (
          value,
        ): value is PublicCanalScene =>
          Boolean(
            value,
          ),
      );

  return {
    profile,
    scenes,
  };
}

export async function resolvePublicProfileIdByHandle(
  handle: string,
): Promise<string | null> {
  requireSupabaseConfiguration();

  const normalizedHandle = handle
    .trim()
    .toLowerCase()
    .replace(/^@+/u, "");

  if (!normalizedHandle) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from("profiles")
    .select("id, is_public")
    .eq("handle", normalizedHandle)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Canal could not resolve this profile: ${error.message}`,
    );
  }

  if (
    typeof data?.id !== "string" ||
    data.is_public !== true
  ) {
    return null;
  }

  return data.id;
}

export async function loadPublicScene(
  ownerId: string,
  sceneId: string,
): Promise<PublicCanalScene> {
  const viewerId =
    await currentUserId();

  const [
    sceneResult,
    profileResult,
    savedKeys,
  ] =
    await Promise.all([
      supabase
        .from(
          "scenes",
        )
        .select(
          "user_id, id, payload, created_at, updated_at, deleted_at",
        )
        .eq(
          "user_id",
          ownerId,
        )
        .eq(
          "id",
          sceneId,
        )
        .maybeSingle(),

      supabase
        .from(
          "profiles",
        )
        .select(
          "id, display_name, handle, bio, favorite_activities, avatar_url, is_public, is_verified, is_canal",
        )
        .eq(
          "id",
          ownerId,
        )
        .maybeSingle(),

      loadSavedKeys(
        viewerId,
      ),
    ]);

  if (
    sceneResult.error
  ) {
    throw new Error(
      `Canal could not load this Scene: ${sceneResult.error.message}`,
    );
  }

  if (
    profileResult.error
  ) {
    throw new Error(
      `Canal could not load this Scene's creator: ${profileResult.error.message}`,
    );
  }

  const row =
    sceneResult.data as
      | SceneRow
      | null;

  if (!row) {
    throw new Error(
      "This Scene is unavailable or private.",
    );
  }

  const profileRow =
    profileResult.data as
      | ProfileRow
      | null;

  if (
    !profileRow
  ) {
    throw new Error(
      "This Scene's creator is unavailable or private.",
    );
  }

  const scene =
    normalizeScene(
      row,
    );

  if (
    !scene ||
    scene.visibility !==
      "public"
  ) {
    throw new Error(
      "This Scene is unavailable or private.",
    );
  }

  return {
    ownerId,

    sceneId,

    scene,

    creator:
      normalizeProfile(
        profileRow,
        ownerId,
      ),

    updatedAt:
      row.updated_at,

    savedByMe:
      savedKeys.has(
        `${ownerId}:${sceneId}`,
      ),

    isMine:
      viewerId ===
      ownerId,
  };
}

export async function savedSceneCopyId(
  ownerId: string,
  sceneId: string,
): Promise<string> {
  const digest =
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm
        .SHA256,
      JSON.stringify([
        ownerId,
        sceneId,
      ]),
    );

  return `saved-${digest}`;
}

export async function savePublicSceneToLibrary(
  publicScene: PublicCanalScene,
): Promise<StoredScene> {
  const sceneCacheOwner =
    await capturePreparedSceneCacheOwner();

  const userId =
    sceneCacheOwner.userId;

  if (
    userId ===
    publicScene.ownerId
  ) {
    throw new Error(
      "This Scene is already yours.",
    );
  }

  if (
    publicScene.scene.visibility !==
    "public"
  ) {
    throw new Error(
      "Only public Scenes can be saved.",
    );
  }

  const now =
    new Date().toISOString();

  const copyId =
    await savedSceneCopyId(
      publicScene.ownerId,
      publicScene.sceneId,
    );

  await assertSceneCacheOwner(
    sceneCacheOwner,
  );

  const copy: StoredScene = {
    ...publicScene.scene,

    id:
      copyId,

    ownerId:
      userId,

    libraryType:
      "saved",

    visibility:
      "private",

    createdAt:
      now,

    updatedAt:
      now,

    favorite:
      false,

    playCount:
      0,

    collaborators:
      [],

    sourceOwnerId:
      publicScene.ownerId,

    sourceSceneId:
      publicScene.sceneId,

    sourceCreatorName:
      publicScene.creator.displayName,

    sourceCreatorHandle:
      publicScene.creator.handle,

    savedAt:
      now,
  };

  await assertSceneCacheOwner(
    sceneCacheOwner,
  );

  const {
    error: savedError,
  } =
    await supabase.rpc(
      "save_public_scene_to_library",
      {
        source_owner_id_value:
          publicScene.ownerId,
        source_scene_id_value:
          publicScene.sceneId,
        saved_copy_id_value:
          copy.id,
        saved_copy_payload:
          copy,
      },
    );

  if (savedError) {
    throw new Error(
      `Canal could not save this public Scene: ${savedError.message}`,
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
    [
      copy,
      ...localScenes.filter(
        (scene) =>
          scene.id !==
          copy.id,
      ),
    ],
  );

  return copy;
}

export async function setOwnSceneVisibility(
  sceneId: string,
  visibility: SceneVisibility,
): Promise<StoredScene> {
  const sceneCacheOwner =
    await capturePreparedSceneCacheOwner();

  const userId =
    sceneCacheOwner.userId;

  const scenes =
    await readScenes();

  await assertSceneCacheOwner(
    sceneCacheOwner,
  );

  const scene =
    scenes.find(
      (candidate) =>
        candidate.id ===
        sceneId,
    );

  if (!scene) {
    throw new Error(
      "Canal could not find this Scene in your Library.",
    );
  }

  if (
    scene.libraryType ===
    "saved"
  ) {
    throw new Error(
      "A Scene saved from another creator remains private in your Library.",
    );
  }

  let updated: StoredScene | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assertSceneCacheOwner(sceneCacheOwner);
    const { data: remoteData, error: remoteError } = await supabase
      .from("scenes")
      .select("user_id, id, payload, revision, created_at, updated_at, deleted_at")
      .eq("user_id", userId)
      .eq("id", sceneId)
      .maybeSingle();

    await assertSceneCacheOwner(sceneCacheOwner);
    if (remoteError) {
      throw new Error(`Canal could not refresh the Scene before changing visibility: ${remoteError.message}`);
    }

    const remoteRow = remoteData as (SceneRow & { revision: number }) | null;
    if (!remoteRow || remoteRow.deleted_at) {
      throw new Error("This Scene is no longer available. Refresh your Library to remove the stale copy.");
    }

    const canonicalScene = normalizeScene(remoteRow);
    if (!canonicalScene || !Number.isSafeInteger(remoteRow.revision) || remoteRow.revision < 1) {
      throw new Error("Canal received an invalid cloud Scene while changing visibility.");
    }

    const requestedScene: StoredScene = {
      ...canonicalScene,
      visibility,
      revision: remoteRow.revision,
      updatedAt: new Date().toISOString(),
    };

    const { data: savedData, error: savedError } = await supabase.rpc(
      "update_collaborative_scene",
      {
        scene_owner_id_value: userId,
        scene_id_value: sceneId,
        expected_revision_value: remoteRow.revision,
        scene_payload_value: requestedScene,
      },
    );

    await assertSceneCacheOwner(sceneCacheOwner);
    if (savedError) {
      const conflict =
        (savedError.code === "40001" || savedError.code === "P0001") &&
        savedError.message.includes("SCENE_REVISION_CONFLICT");
      if (conflict && attempt === 0) continue;
      throw new Error(
        conflict
          ? "This Scene changed on another device. Refresh your Library and try again."
          : `Canal could not update the Scene's cloud visibility: ${savedError.message}`,
      );
    }

    const savedRow = (Array.isArray(savedData) ? savedData[0] : savedData) as SceneRow | null;
    updated = savedRow ? normalizeScene(savedRow) : null;
    if (!updated) {
      updated = { ...requestedScene, revision: remoteRow.revision + 1 };
    }
    break;
  }

  if (!updated) {
    throw new Error("Canal could not update the Scene visibility.");
  }

  await assertSceneCacheOwner(
    sceneCacheOwner,
  );

  const latestScenes = await readScenes();

  await assertSceneCacheOwner(sceneCacheOwner);

  await writeScenesForSceneCacheOwner(
    sceneCacheOwner,
    latestScenes.map(
      (candidate) =>
        candidate.id ===
        updated.id
          ? updated
          : candidate,
    ),
  );

  return updated;
}
