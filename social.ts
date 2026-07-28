import {
  readScenes,
  upsertScene,
} from "./scenes";

import type {
  SceneVisibility,
  StoredScene,
} from "./scenes";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

type ProfileRow = {
  id: string;
  display_name: string | null;
  handle: string | null;
  bio: string | null;
  favorite_activities: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
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

  return {
    ...(payload as StoredScene),

    id:
      row.id,

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
  };
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
        "id, display_name, handle, bio, favorite_activities, avatar_url, is_public",
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

  for (
    const userId of
      uniqueIds
  ) {
    if (
      !profiles.has(
        userId,
      )
    ) {
      profiles.set(
        userId,
        normalizeProfile(
          null,
          userId,
        ),
      );
    }
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

export async function loadExploreScenes(): Promise<
  PublicCanalScene[]
> {
  const userId =
    await currentUserId();

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
        .order(
          "updated_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          100,
        ),

      loadSavedKeys(
        userId,
      ),
    ]);

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

  const publicRows =
    rows.filter(
      (row) =>
        (
          row.payload as Partial<StoredScene>
        ).visibility ===
        "public",
    );

  const profiles =
    await loadProfiles(
      publicRows.map(
        (row) =>
          row.user_id,
      ),
    );

  return publicRows
    .map(
      (
        row,
      ): PublicCanalScene | null => {
        const scene =
          normalizeScene(
            row,
          );

        if (!scene) {
          return null;
        }

        return {
          ownerId:
            row.user_id,

          sceneId:
            row.id,

          scene,

          creator:
            profiles.get(
              row.user_id,
            ) ||
            normalizeProfile(
              null,
              row.user_id,
            ),

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
          "id, display_name, handle, bio, favorite_activities, avatar_url, is_public",
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

  const profile =
    normalizeProfile(
      profileResult.data as
        | ProfileRow
        | null,
      userId,
    );

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
          "id, display_name, handle, bio, favorite_activities, avatar_url, is_public",
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

  const row =
    sceneResult.data as
      | SceneRow
      | null;

  if (!row) {
    throw new Error(
      "This Scene is unavailable or private.",
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
        profileResult.data as
          | ProfileRow
          | null,
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

function savedCopyId(
  ownerId: string,
  sceneId: string,
): string {
  const normalizedSceneId =
    sceneId
      .replace(
        /[^a-zA-Z0-9_-]/g,
        "",
      )
      .slice(
        0,
        80,
      );

  return [
    "saved",
    ownerId.slice(
      0,
      8,
    ),
    normalizedSceneId ||
      Date.now().toString(
        36,
      ),
  ].join("-");
}

export async function savePublicSceneToLibrary(
  publicScene: PublicCanalScene,
): Promise<StoredScene> {
  const userId =
    await currentUserId();

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

  const copy: StoredScene = {
    ...publicScene.scene,

    id:
      savedCopyId(
        publicScene.ownerId,
        publicScene.sceneId,
      ),

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

  const {
    error: savedError,
  } =
    await supabase
      .from(
        "saved_scenes",
      )
      .upsert(
        {
          user_id:
            userId,

          source_user_id:
            publicScene.ownerId,

          source_scene_id:
            publicScene.sceneId,

          payload:
            publicScene.scene,

          created_at:
            now,
        },
        {
          onConflict:
            "user_id,source_user_id,source_scene_id",
        },
      );

  if (savedError) {
    throw new Error(
      `Canal could not save this public Scene: ${savedError.message}`,
    );
  }

  await upsertScene(
    copy,
  );

  return copy;
}

export async function setOwnSceneVisibility(
  sceneId: string,
  visibility: SceneVisibility,
): Promise<StoredScene> {
  const userId =
    await currentUserId();

  const scenes =
    await readScenes();

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

  const updated: StoredScene = {
    ...scene,

    visibility,

    updatedAt:
      new Date().toISOString(),
  };

  await upsertScene(
    updated,
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
            userId,

          id:
            updated.id,

          payload:
            updated,

          created_at:
            updated.createdAt,

          updated_at:
            updated.updatedAt,

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
      `Canal changed the local Scene but could not update its cloud visibility: ${error.message}`,
    );
  }

  return updated;
}
