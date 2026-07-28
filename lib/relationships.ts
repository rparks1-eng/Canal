import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./storage-keys";
import {
  isSupabaseConfigured,
  supabase,
} from "./supabase";

export type RelationshipActivityType =
  | "follow"
  | "unfollow"
  | "block"
  | "unblock"
  | "share"
  | "collaboration"
  | "snapshot"
  | "scene"
  | "system";

export type RelationshipActivity = {
  id: string;
  type: RelationshipActivityType;
  title: string;
  description: string;
  username?: string;
  displayName?: string;
  createdAt: string;
  isRead: boolean;
  syncStatus?: "pending" | "synced";
};

type ActivityRow = {
  id: string;
  type: RelationshipActivityType;
  title: string;
  description: string;
  username: string | null;
  display_name: string | null;
  created_at: string;
  is_read: boolean;
};

type RelationshipKind =
  | "following"
  | "blocked";

type RelationshipRow = {
  target_username: string;
  target_user_id?: string | null;
  relationship_type:
    RelationshipKind;
};

export type RelationshipMutation = {
  username: string;
  targetUserId?: string;
  relationshipType:
    RelationshipKind;
  action: "upsert" | "delete";
};

export type CanalActivityType =
  RelationshipActivityType;

export type CanalActivityItem =
  RelationshipActivity;

export type RelationshipState = {
  following: string[];
  blocked: string[];
  syncStatus?:
    | "synced"
    | "pending"
    | "offline";
};

export type RecordActivityInput = {
  type: RelationshipActivityType;
  title: string;
  description: string;
  username?: string;
  displayName?: string;
};

export async function readRelationshipState(): Promise<RelationshipState> {
  const expectedUserId =
    await relationshipUserId();

  return readRelationshipStateForUser(
    expectedUserId,
  );
}

async function readRelationshipStateForUser(
  expectedUserId: string | null,
): Promise<RelationshipState> {
  const localState =
    await readLocalRelationshipState(
      expectedUserId,
    );

  if (!isSupabaseConfigured) {
    return localState;
  }

  try {
    await assertExpectedUser(
      expectedUserId,
    );

    if (!expectedUserId) {
      return localState;
    }

    const pendingMutations =
      await readRelationshipMutations(
        expectedUserId,
      );

    if (
      pendingMutations.length >
      0
    ) {
      await flushRelationshipMutations(
        expectedUserId,
        pendingMutations,
      );
    }

    await assertExpectedUser(
      expectedUserId,
    );

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "user_relationships",
        )
        .select(
          "target_username, target_user_id, relationship_type",
        )
        .eq(
          "user_id",
          expectedUserId,
        );

    if (error) {
      throw error;
    }

    await assertExpectedUser(
      expectedUserId,
    );

    const cloudState =
      relationshipRowsToState(
        (data ?? []) as
          RelationshipRow[],
      );

    await writeLocalRelationshipState(
      cloudState,
      expectedUserId,
    );

    await assertExpectedUser(
      expectedUserId,
    );

    await writeRelationshipMutations(
      expectedUserId,
      [],
    );

    return {
      ...cloudState,
      syncStatus: "synced",
    };
  } catch (error) {
    if (
      isAccountChangedError(
        error,
      )
    ) {
      throw error;
    }

    console.warn(
      "Canal relationships are offline; using the device cache:",
      error,
    );

    await assertExpectedUser(
      expectedUserId,
    );

    const pending =
      expectedUserId
        ? await readRelationshipMutations(
            expectedUserId,
          )
        : [];

    return {
      ...localState,
      syncStatus:
        pending.length > 0
          ? "pending"
          : "offline",
    };
  }
}

export async function readFollowing(): Promise<string[]> {
  return (
    await readRelationshipState()
  ).following;
}

export async function readBlockedUsers(): Promise<string[]> {
  return (
    await readRelationshipState()
  ).blocked;
}

export async function writeFollowing(
  usernames: string[],
): Promise<string[]> {
  const normalizedUsernames =
    normalizeUsernameArray(
      usernames,
    );

  const userId =
    await relationshipUserId();

  await assertExpectedUser(
    userId,
  );

  await writeStoredStringArray(
    relationshipStorageKey(
      STORAGE_KEYS.following,
      userId,
    ),
    normalizedUsernames,
  );

  return normalizedUsernames;
}

export async function writeBlockedUsers(
  usernames: string[],
): Promise<string[]> {
  const normalizedUsernames =
    normalizeUsernameArray(
      usernames,
    );

  const userId =
    await relationshipUserId();

  await assertExpectedUser(
    userId,
  );

  await writeStoredStringArray(
    relationshipStorageKey(
      STORAGE_KEYS.blockedUsers,
      userId,
    ),
    normalizedUsernames,
  );

  return normalizedUsernames;
}

export async function followUser(
  username: string,
  displayName?: string,
  targetUserId?: string,
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  if (!normalizedUsername) {
    throw new Error(
      "A valid username is required.",
    );
  }

  const expectedUserId =
    await relationshipUserId();

  const resolvedTargetUserId =
    targetUserId ??
    await resolveTargetProfileId(
      normalizedUsername,
      expectedUserId,
    );

  const {
    following,
    blocked,
  } =
    await readRelationshipStateForUser(
      expectedUserId,
    );

  const updatedFollowing =
    Array.from(
      new Set([
        ...following,
        normalizedUsername,
      ]),
    );

  const updatedBlocked =
    blocked.filter(
      (item) =>
        item !== normalizedUsername,
    );

  const syncStatus =
    await persistRelationshipChange(
    {
      following:
        updatedFollowing,
      blocked:
        updatedBlocked,
    },
    [
      {
        username:
          normalizedUsername,
        ...(resolvedTargetUserId
          ? {
              targetUserId:
                resolvedTargetUserId,
            }
          : {}),
        relationshipType:
          "following",
        action: "upsert",
      },
      {
        username:
          normalizedUsername,
        ...(resolvedTargetUserId
          ? {
              targetUserId:
                resolvedTargetUserId,
            }
          : {}),
        relationshipType:
          "blocked",
        action: "delete",
      },
    ],
    expectedUserId,
  );

  await recordActivityForUser({
      type: "follow",

      title: `Followed ${
        displayName ||
        `@${normalizedUsername}`
      }`,

      description:
        `You are now following @${normalizedUsername}.`,

      username:
        normalizedUsername,

      displayName,
    }, expectedUserId);

  return {
    following:
      updatedFollowing,

    blocked:
      updatedBlocked,
    syncStatus,
  };
}

export async function unfollowUser(
  username: string,
  displayName?: string,
  targetUserId?: string,
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  const expectedUserId =
    await relationshipUserId();

  const resolvedTargetUserId =
    targetUserId ??
    await resolveTargetProfileId(
      normalizedUsername,
      expectedUserId,
    );

  const {
    following,
    blocked,
  } =
    await readRelationshipStateForUser(
      expectedUserId,
    );

  const updatedFollowing =
    following.filter(
      (item) =>
        item !== normalizedUsername,
    );

  const syncStatus =
    await persistRelationshipChange(
    {
      following:
        updatedFollowing,
      blocked,
    },
    [
      {
        username:
          normalizedUsername,
        ...(resolvedTargetUserId
          ? {
              targetUserId:
                resolvedTargetUserId,
            }
          : {}),
        relationshipType:
          "following",
        action: "delete",
      },
    ],
    expectedUserId,
  );

  await recordActivityForUser({
      type: "unfollow",

      title: `Unfollowed ${
        displayName ||
        `@${normalizedUsername}`
      }`,

      description:
        `You stopped following @${normalizedUsername}.`,

      username:
        normalizedUsername,

      displayName,
    }, expectedUserId);

  return {
    following:
      updatedFollowing,

    blocked,
    syncStatus,
  };
}

export async function blockUser(
  username: string,
  displayName?: string,
  targetUserId?: string,
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  if (!normalizedUsername) {
    throw new Error(
      "A valid username is required.",
    );
  }

  const expectedUserId =
    await relationshipUserId();

  const resolvedTargetUserId =
    targetUserId ??
    await resolveTargetProfileId(
      normalizedUsername,
      expectedUserId,
    );

  const {
    following,
    blocked,
  } =
    await readRelationshipStateForUser(
      expectedUserId,
    );

  const updatedFollowing =
    following.filter(
      (item) =>
        item !== normalizedUsername,
    );

  const updatedBlocked =
    Array.from(
      new Set([
        ...blocked,
        normalizedUsername,
      ]),
    );

  const syncStatus =
    await persistRelationshipChange(
    {
      following:
        updatedFollowing,
      blocked:
        updatedBlocked,
    },
    [
      {
        username:
          normalizedUsername,
        ...(resolvedTargetUserId
          ? {
              targetUserId:
                resolvedTargetUserId,
            }
          : {}),
        relationshipType:
          "following",
        action: "delete",
      },
      {
        username:
          normalizedUsername,
        ...(resolvedTargetUserId
          ? {
              targetUserId:
                resolvedTargetUserId,
            }
          : {}),
        relationshipType:
          "blocked",
        action: "upsert",
      },
    ],
    expectedUserId,
  );

  await recordActivityForUser({
      type: "block",

      title: `Blocked ${
        displayName ||
        `@${normalizedUsername}`
      }`,

      description:
        `@${normalizedUsername} is hidden from your Canal account.`,

      username:
        normalizedUsername,

      displayName,
    }, expectedUserId);

  return {
    following:
      updatedFollowing,

    blocked:
      updatedBlocked,
    syncStatus,
  };
}

export async function unblockUser(
  username: string,
  displayName?: string,
  targetUserId?: string,
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  const expectedUserId =
    await relationshipUserId();

  const resolvedTargetUserId =
    targetUserId ??
    await resolveTargetProfileId(
      normalizedUsername,
      expectedUserId,
    );

  const {
    following,
    blocked,
  } =
    await readRelationshipStateForUser(
      expectedUserId,
    );

  const updatedBlocked =
    blocked.filter(
      (item) =>
        item !== normalizedUsername,
    );

  const syncStatus =
    await persistRelationshipChange(
    {
      following,
      blocked:
        updatedBlocked,
    },
    [
      {
        username:
          normalizedUsername,
        ...(resolvedTargetUserId
          ? {
              targetUserId:
                resolvedTargetUserId,
            }
          : {}),
        relationshipType:
          "blocked",
        action: "delete",
      },
    ],
    expectedUserId,
  );

  await recordActivityForUser({
      type: "unblock",

      title: `Unblocked ${
        displayName ||
        `@${normalizedUsername}`
      }`,

      description:
        `@${normalizedUsername} is visible again.`,

      username:
        normalizedUsername,

      displayName,
    }, expectedUserId);

  return {
    following,
    blocked:
      updatedBlocked,
    syncStatus,
  };
}

export async function isFollowingUser(
  username: string,
): Promise<boolean> {
  const {
    following,
  } =
    await readRelationshipState();

  return following.includes(
    normalizeUsername(username),
  );
}

export async function isBlockedUser(
  username: string,
): Promise<boolean> {
  const {
    blocked,
  } =
    await readRelationshipState();

  return blocked.includes(
    normalizeUsername(username),
  );
}

export async function readActivity(): Promise<
  CanalActivityItem[]
> {
  const expectedUserId =
    await relationshipUserId();

  return readActivityForUser(
    expectedUserId,
  );
}

async function readActivityForUser(
  expectedUserId: string | null,
): Promise<CanalActivityItem[]> {
  const localActivities =
    await readLocalActivityForUser(
      expectedUserId,
    );

  if (!isSupabaseConfigured) {
    return localActivities;
  }

  try {
    await assertExpectedUser(
      expectedUserId,
    );

    if (!expectedUserId) {
      return localActivities;
    }

    const pending =
      localActivities.filter(
        (item) =>
          item.syncStatus ===
          "pending",
      );

    if (pending.length > 0) {
      await assertExpectedUser(
        expectedUserId,
      );

      await upsertCloudActivity(
        expectedUserId,
        pending,
      );
    }

    await assertExpectedUser(
      expectedUserId,
    );

    const {
      data,
      error,
    } =
      await supabase
        .from("activity_events")
        .select(
          "id, type, title, description, username, display_name, created_at, is_read",
        )
        .eq(
          "user_id",
          expectedUserId,
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(200);

    if (error) {
      throw error;
    }

    const cloudActivities =
      ((data ?? []) as ActivityRow[])
        .map(normalizeActivityRow);

    const merged =
      mergeActivityItems(
        cloudActivities,
        localActivities,
      );

    await writeActivityForUser(
      merged,
      expectedUserId,
    );

    return merged;
  } catch (error) {
    if (
      isAccountChangedError(
        error,
      )
    ) {
      throw error;
    }

    console.warn(
      "Canal activity is offline; using the device cache:",
      error,
    );

    await assertExpectedUser(
      expectedUserId,
    );

    return localActivities;
  }
}

async function readLocalActivityForUser(
  expectedUserId: string | null,
): Promise<CanalActivityItem[]> {
  const storageKey =
    activityStorageKey(
      expectedUserId,
    );

  const currentValue =
    await AsyncStorage.getItem(
      storageKey,
    );

  const legacyValue =
    currentValue ||
    storageKey !==
      STORAGE_KEYS.activity
      ? null
      : await AsyncStorage.getItem(
          STORAGE_KEYS.legacyReadActivity,
        );

  const storedValue =
    currentValue ??
    legacyValue;

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const activities:
      CanalActivityItem[] = [];

    for (const item of parsedValue) {
      const activity =
        normalizeActivity(item);

      if (activity) {
        activities.push(activity);
      }
    }

    return sortActivity(
      activities,
    );
  } catch {
    return [];
  }
}

export async function readActivityItems(): Promise<
  CanalActivityItem[]
> {
  return readActivity();
}

export async function recordActivity(
  input: RecordActivityInput,
): Promise<CanalActivityItem> {
  const expectedUserId =
    await relationshipUserId();

  return recordActivityForUser(
    input,
    expectedUserId,
  );
}

async function recordActivityForUser(
  input: RecordActivityInput,
  expectedUserId: string | null,
): Promise<CanalActivityItem> {
  const activities =
    await readActivityForUser(
      expectedUserId,
    );

  const activity:
    CanalActivityItem = {
      id:
        createActivityId(),

      type:
        input.type,

      title:
        input.title.trim(),

      description:
        input.description.trim(),

      username:
        input.username
          ? normalizeUsername(
              input.username,
            )
          : undefined,

      displayName:
        input.displayName?.trim() ||
        undefined,

      createdAt:
        new Date().toISOString(),

      isRead: false,
      syncStatus:
        isSupabaseConfigured
          ? "pending"
          : undefined,
    };

  const updatedActivities = [
    activity,
    ...activities,
  ].slice(0, 200);

  await writeActivityForUser(
    updatedActivities,
    expectedUserId,
  );

  if (isSupabaseConfigured) {
    try {
      await assertExpectedUser(
        expectedUserId,
      );

      if (expectedUserId) {
        await upsertCloudActivity(
          expectedUserId,
          [activity],
        );

        await assertExpectedUser(
          expectedUserId,
        );

        activity.syncStatus =
          "synced";

        await writeActivityForUser(
          updatedActivities.map(
            (item) =>
              item.id ===
              activity.id
                ? activity
                : item,
          ),
          expectedUserId,
        );
      }
    } catch (error) {
      if (
        isAccountChangedError(
          error,
        )
      ) {
        throw error;
      }

      console.warn(
        "Canal saved activity on this device and will retry cloud sync:",
        error,
      );
    }
  }

  return activity;
}

export async function writeActivity(
  activities:
    CanalActivityItem[],
): Promise<void> {
  const expectedUserId =
    await relationshipUserId();

  await writeActivityForUser(
    activities,
    expectedUserId,
  );
}

async function writeActivityForUser(
  activities:
    CanalActivityItem[],
  expectedUserId: string | null,
): Promise<void> {
  await assertExpectedUser(
    expectedUserId,
  );

  const storageKey =
    activityStorageKey(
      expectedUserId,
    );

  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify(
      activities,
    ),
  );
}

export async function markActivityRead(
  activityId: string,
): Promise<void> {
  const expectedUserId =
    await relationshipUserId();

  const activities =
    await readActivityForUser(
      expectedUserId,
    );

  await writeActivityForUser(
    activities.map((activity) =>
      activity.id === activityId
        ? {
            ...activity,
            isRead: true,
          }
        : activity,
    ),
    expectedUserId,
  );

  if (isSupabaseConfigured) {
    try {
      await assertExpectedUser(
        expectedUserId,
      );

      if (expectedUserId) {
        const { error } =
          await supabase
            .from(
              "activity_events",
            )
            .update({
              is_read: true,
            })
            .eq(
              "user_id",
              expectedUserId,
            )
            .eq(
              "id",
              activityId,
            );

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      if (
        isAccountChangedError(
          error,
        )
      ) {
        throw error;
      }

      console.warn(
        "Canal could not mark cloud activity as read:",
        error,
      );
    }
  }
}

export async function markAllActivityRead(): Promise<void> {
  const expectedUserId =
    await relationshipUserId();

  const activities =
    await readActivityForUser(
      expectedUserId,
    );

  await writeActivityForUser(
    activities.map(
      (activity) => ({
        ...activity,
        isRead: true,
      }),
    ),
    expectedUserId,
  );

  if (isSupabaseConfigured) {
    try {
      await assertExpectedUser(
        expectedUserId,
      );

      if (expectedUserId) {
        const { error } =
          await supabase
            .from(
              "activity_events",
            )
            .update({
              is_read: true,
            })
            .eq(
              "user_id",
              expectedUserId,
            );

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      if (
        isAccountChangedError(
          error,
        )
      ) {
        throw error;
      }

      console.warn(
        "Canal could not mark cloud activity as read:",
        error,
      );
    }
  }
}

export async function clearActivity(): Promise<void> {
  const expectedUserId =
    await relationshipUserId();

  await assertExpectedUser(
    expectedUserId,
  );

  const storageKey =
    activityStorageKey(
      expectedUserId,
    );

  await AsyncStorage.multiRemove([
    storageKey,
    ...(storageKey ===
    STORAGE_KEYS.activity
      ? [
          STORAGE_KEYS.legacyReadActivity,
        ]
      : []),
  ]);

  if (isSupabaseConfigured) {
    await assertExpectedUser(
      expectedUserId,
    );

    if (expectedUserId) {
      const { error } =
        await supabase
          .from("activity_events")
          .delete()
          .eq(
            "user_id",
            expectedUserId,
          );

      if (error) {
        throw error;
      }
    }
  }
}

function normalizeActivity(
  value: unknown,
): CanalActivityItem | null {
  if (
    typeof value !== "object" ||
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

  const title =
    readString(record.title);

  if (!id || !title) {
    return null;
  }

  return {
    id,

    type:
      readActivityType(
        record.type,
      ),

    title,

    description:
      readString(
        record.description,
      ),

    username:
      readOptionalString(
        record.username,
      ),

    displayName:
      readOptionalString(
        record.displayName,
      ),

    createdAt:
      readString(
        record.createdAt,
      ) ||
      new Date().toISOString(),

    isRead:
      record.isRead === true,

    syncStatus:
      record.syncStatus ===
      "pending"
        ? "pending"
        : record.syncStatus ===
            "synced"
          ? "synced"
          : undefined,
  };
}

export function mergeActivityItems(
  primary: CanalActivityItem[],
  secondary: CanalActivityItem[],
): CanalActivityItem[] {
  const merged =
    new Map<
      string,
      CanalActivityItem
    >();

  for (const item of [
    ...secondary,
    ...primary,
  ]) {
    merged.set(item.id, item);
  }

  return sortActivity(
    Array.from(
      merged.values(),
    ),
  ).slice(0, 200);
}

function sortActivity(
  activities: CanalActivityItem[],
): CanalActivityItem[] {
  return [...activities].sort(
    (first, second) =>
      getTimestamp(
        second.createdAt,
      ) -
      getTimestamp(
        first.createdAt,
      ),
  );
}

function activityStorageKey(
  userId: string | null,
): string {
  if (!isSupabaseConfigured) {
    return STORAGE_KEYS.activity;
  }

  return userId
    ? `${STORAGE_KEYS.activity}:${userId}`
    : STORAGE_KEYS.activity;
}

class RelationshipAccountChangedError extends Error {
  readonly code =
    "CANAL_RELATIONSHIP_ACCOUNT_CHANGED";

  constructor() {
    super(
      "The signed-in Canal account changed while relationship data was loading. Please try again.",
    );

    this.name =
      "RelationshipAccountChangedError";
  }
}

function isAccountChangedError(
  error: unknown,
): error is RelationshipAccountChangedError {
  return (
    error instanceof
      RelationshipAccountChangedError ||
    (
      typeof error ===
        "object" &&
      error !==
        null &&
      "code" in error &&
      (
        error as {
          code?: unknown;
        }
      ).code ===
        "CANAL_RELATIONSHIP_ACCOUNT_CHANGED"
    )
  );
}

async function assertExpectedUser(
  expectedUserId: string | null,
): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }

  const actualUserId =
    await relationshipUserId();

  if (
    actualUserId !==
    expectedUserId
  ) {
    throw new RelationshipAccountChangedError();
  }
}

async function resolveTargetProfileId(
  username: string,
  expectedUserId: string | null,
): Promise<string | undefined> {
  if (!isSupabaseConfigured) {
    return undefined;
  }

  try {
    await assertExpectedUser(
      expectedUserId,
    );

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "profiles",
        )
        .select(
          "id",
        )
        .eq(
          "handle",
          normalizeUsername(
            username,
          ),
        )
        .maybeSingle();

    if (
      error ||
      typeof data?.id !==
        "string"
    ) {
      return undefined;
    }

    await assertExpectedUser(
      expectedUserId,
    );

    return data.id;
  } catch (error) {
    if (
      isAccountChangedError(
        error,
      )
    ) {
      throw error;
    }

    return undefined;
  }
}

async function upsertCloudActivity(
  userId: string,
  activities: CanalActivityItem[],
): Promise<void> {
  const { error } =
    await supabase
      .from("activity_events")
      .upsert(
        activities.map(
          (item) => ({
            user_id: userId,
            id: item.id,
            type: item.type,
            title: item.title,
            description:
              item.description,
            username:
              item.username ??
              null,
            display_name:
              item.displayName ??
              null,
            created_at:
              item.createdAt,
            is_read:
              item.isRead,
          }),
        ),
        {
          onConflict:
            "user_id,id",
        },
      );

  if (error) {
    throw error;
  }
}

function normalizeActivityRow(
  row: ActivityRow,
): CanalActivityItem {
  return {
    id: row.id,
    type:
      readActivityType(
        row.type,
      ),
    title: row.title,
    description:
      row.description,
    username:
      row.username ??
      undefined,
    displayName:
      row.display_name ??
      undefined,
    createdAt:
      row.created_at,
    isRead:
      row.is_read,
    syncStatus: "synced",
  };
}

async function readLocalRelationshipState(
  userId: string | null,
): Promise<RelationshipState> {
  const [
    following,
    blocked,
  ] =
    await Promise.all([
      readStoredStringArray(
        relationshipStorageKey(
          STORAGE_KEYS.following,
          userId,
        ),
      ),
      readStoredStringArray(
        relationshipStorageKey(
          STORAGE_KEYS.blockedUsers,
          userId,
        ),
      ),
    ]);

  return {
    following:
      following.filter(
        (username) =>
          !blocked.includes(
            username,
          ),
      ),
    blocked,
  };
}

async function writeLocalRelationshipState(
  state: RelationshipState,
  userId:
    string | null,
): Promise<void> {
  const blocked =
    normalizeUsernameArray(
      state.blocked,
    );

  const following =
    normalizeUsernameArray(
      state.following,
    ).filter(
      (username) =>
        !blocked.includes(
          username,
        ),
    );

  await Promise.all([
    writeStoredStringArray(
      relationshipStorageKey(
        STORAGE_KEYS.following,
        userId,
      ),
      following,
    ),
    writeStoredStringArray(
      relationshipStorageKey(
        STORAGE_KEYS.blockedUsers,
        userId,
      ),
      blocked,
    ),
  ]);
}

async function persistRelationshipChange(
  state: RelationshipState,
  mutations:
    RelationshipMutation[],
  expectedUserId: string | null,
): Promise<
  | "synced"
  | "pending"
  | undefined
> {
  await assertExpectedUser(
    expectedUserId,
  );

  await writeLocalRelationshipState(
    state,
    expectedUserId,
  );

  if (
    !isSupabaseConfigured ||
    !expectedUserId
  ) {
    return undefined;
  }

  const pending =
    compactRelationshipMutations([
      ...await readRelationshipMutations(
        expectedUserId,
      ),
      ...mutations,
    ]);

  await assertExpectedUser(
    expectedUserId,
  );

  await writeRelationshipMutations(
    expectedUserId,
    pending,
  );

  try {
    await flushRelationshipMutations(
      expectedUserId,
      pending,
    );

    await assertExpectedUser(
      expectedUserId,
    );

    await writeRelationshipMutations(
      expectedUserId,
      [],
    );

    return "synced";
  } catch (error) {
    if (
      isAccountChangedError(
        error,
      )
    ) {
      throw error;
    }

    console.warn(
      "Canal saved the relationship change on this device and will retry when online:",
      error,
    );

    return "pending";
  }
}

export function compactRelationshipMutations(
  mutations:
    RelationshipMutation[],
): RelationshipMutation[] {
  const compacted =
    new Map<
      string,
      RelationshipMutation
    >();

  for (const mutation of mutations) {
    const username =
      normalizeUsername(
        mutation.username,
      );

    if (!username) {
      continue;
    }

    const normalizedMutation = {
      ...mutation,
      username,
      ...(mutation.targetUserId
        ? {
            targetUserId:
              mutation.targetUserId,
          }
        : {}),
    };

    const identity =
      normalizedMutation
        .targetUserId
        ? `id:${normalizedMutation.targetUserId}`
        : `username:${username}`;

    if (
      normalizedMutation
        .targetUserId
    ) {
      for (
        const relationshipType
        of [
          "following",
          "blocked",
        ] as const
      ) {
        const existing =
          compacted.get(
            `${relationshipType}:${identity}`,
          );

        if (existing) {
          compacted.set(
            `${relationshipType}:${identity}`,
            {
              ...existing,
              username,
              targetUserId:
                normalizedMutation
                  .targetUserId,
            },
          );
        }
      }
    }

    if (
      normalizedMutation.action ===
      "upsert"
    ) {
      const otherType:
        RelationshipKind =
          normalizedMutation.relationshipType ===
          "following"
            ? "blocked"
            : "following";

      compacted.set(
        `${otherType}:${identity}`,
        {
          username,
          ...(normalizedMutation
            .targetUserId
            ? {
                targetUserId:
                  normalizedMutation
                    .targetUserId,
              }
            : {}),
          relationshipType:
            otherType,
          action: "delete",
        },
      );
    }

    compacted.set(
      `${mutation.relationshipType}:${identity}`,
      normalizedMutation,
    );
  }

  return Array.from(
    compacted.values(),
  ).sort(
    (first, second) =>
      first.relationshipType ===
      second.relationshipType
        ? first.username.localeCompare(
            second.username,
          )
        : first.relationshipType ===
            "following"
          ? -1
          : 1,
  );
}

function relationshipRowsToState(
  rows: RelationshipRow[],
): RelationshipState {
  const following:
    string[] = [];

  const blocked:
    string[] = [];

  for (const row of rows) {
    const username =
      normalizeUsername(
        row.target_username,
      );

    if (!username) {
      continue;
    }

    if (
      row.relationship_type ===
      "blocked"
    ) {
      blocked.push(username);
    } else if (
      row.relationship_type ===
      "following"
    ) {
      following.push(username);
    }
  }

  const normalizedBlocked =
    normalizeUsernameArray(
      blocked,
    );

  return {
    following:
      normalizeUsernameArray(
        following,
      ).filter(
        (username) =>
          !normalizedBlocked.includes(
            username,
          ),
      ),
    blocked:
      normalizedBlocked,
  };
}

async function flushRelationshipMutations(
  userId: string,
  mutations:
    RelationshipMutation[],
): Promise<void> {
  for (
    const relationshipType
    of [
      "following",
      "blocked",
    ] as const
  ) {
    const deletions =
      mutations.filter(
        (mutation) =>
          mutation.action ===
            "delete" &&
          mutation.relationshipType ===
            relationshipType,
      );

    if (deletions.length === 0) {
      continue;
    }

    const targetUserIds =
      deletions
        .map(
          (mutation) =>
            mutation.targetUserId,
        )
        .filter(
          (
            targetUserId,
          ): targetUserId is string =>
            Boolean(
              targetUserId,
            ),
        );

    const usernames =
      deletions
        .filter(
          (mutation) =>
            !mutation.targetUserId,
        )
        .map(
          (mutation) =>
            mutation.username,
        );

    if (targetUserIds.length > 0) {
      await assertExpectedUser(
        userId,
      );

      const {
        error,
      } =
        await supabase
          .from(
            "user_relationships",
          )
          .delete()
          .eq(
            "user_id",
            userId,
          )
          .eq(
            "relationship_type",
            relationshipType,
          )
          .in(
            "target_user_id",
            targetUserIds,
          );

      if (error) {
        throw error;
      }
    }

    if (usernames.length > 0) {
      await assertExpectedUser(
        userId,
      );

      const {
        error,
      } =
        await supabase
          .from(
            "user_relationships",
          )
          .delete()
          .eq(
            "user_id",
            userId,
          )
          .eq(
            "relationship_type",
            relationshipType,
          )
          .in(
            "target_username",
            usernames,
          );

      if (error) {
        throw error;
      }
    }
  }

  const upserts =
    mutations.filter(
      (mutation) =>
        mutation.action ===
        "upsert",
    );

  const stableUpsertTargetUserIds =
    Array.from(
      new Set(
        upserts
          .map(
            (mutation) =>
              mutation
                .targetUserId,
          )
          .filter(
            (
              targetUserId,
            ): targetUserId is string =>
              Boolean(
                targetUserId,
              ),
          ),
      ),
    );

  if (
    stableUpsertTargetUserIds
      .length >
    0
  ) {
    await assertExpectedUser(
      userId,
    );

    const {
      error,
    } =
      await supabase
        .from(
          "user_relationships",
        )
        .delete()
        .eq(
          "user_id",
          userId,
        )
        .in(
          "target_user_id",
          stableUpsertTargetUserIds,
        );

    if (error) {
      throw error;
    }
  }

  if (upserts.length > 0) {
    await assertExpectedUser(
      userId,
    );

    const { error } =
      await supabase
        .from(
          "user_relationships",
        )
        .upsert(
          upserts.map(
            (mutation) => ({
              user_id: userId,
              target_username:
                mutation.username,
              target_user_id:
                mutation.targetUserId ??
                null,
              relationship_type:
                mutation.relationshipType,
            }),
          ),
          {
            onConflict:
              "user_id,target_username",
          },
        );

    if (error) {
      throw error;
    }
  }

}

async function readRelationshipMutations(
  userId: string,
): Promise<RelationshipMutation[]> {
  const storedValue =
    await AsyncStorage.getItem(
      relationshipMutationStorageKey(
        userId,
      ),
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

    const mutations:
      RelationshipMutation[] = [];

    for (const value of parsedValue) {
      if (
        typeof value !==
          "object" ||
        value === null
      ) {
        continue;
      }

      const record =
        value as Record<
          string,
          unknown
        >;

      const username =
        typeof record.username ===
        "string"
          ? normalizeUsername(
              record.username,
            )
          : "";

      const relationshipType =
        record.relationshipType;

      const action =
        record.action;

      const targetUserId =
        typeof record.targetUserId ===
        "string"
          ? record.targetUserId
              .trim()
          : "";

      if (
        username &&
        (
          relationshipType ===
            "following" ||
          relationshipType ===
            "blocked"
        ) &&
        (
          action === "upsert" ||
          action === "delete"
        )
      ) {
        mutations.push({
          username,
          ...(targetUserId
            ? {
                targetUserId,
              }
            : {}),
          relationshipType,
          action,
        });
      }
    }

    return compactRelationshipMutations(
      mutations,
    );
  } catch {
    return [];
  }
}

async function writeRelationshipMutations(
  userId: string,
  mutations:
    RelationshipMutation[],
): Promise<void> {
  const key =
    relationshipMutationStorageKey(
      userId,
    );

  if (mutations.length === 0) {
    await AsyncStorage.removeItem(
      key,
    );
    return;
  }

  await AsyncStorage.setItem(
    key,
    JSON.stringify(
      compactRelationshipMutations(
        mutations,
      ),
    ),
  );
}

async function relationshipUserId(): Promise<
  string | null
> {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const {
      data: {
        session,
      },
    } =
      await supabase.auth.getSession();

    return session?.user.id ??
      null;
  } catch {
    return null;
  }
}

function relationshipStorageKey(
  baseKey: string,
  userId:
    string | null,
): string {
  if (!isSupabaseConfigured) {
    return baseKey;
  }

  return `${baseKey}:${userId ?? "anonymous"}`;
}

function relationshipMutationStorageKey(
  userId: string,
): string {
  return `${STORAGE_KEYS.relationshipMutations}:${userId}`;
}

async function writeStoredStringArray(
  key: string,
  values: string[],
): Promise<void> {
  await AsyncStorage.setItem(
    key,
    JSON.stringify(
      normalizeUsernameArray(
        values,
      ),
    ),
  );
}

export async function clearRelationships(): Promise<void> {
  const userId =
    await relationshipUserId();

  await AsyncStorage.multiRemove([
    relationshipStorageKey(
      STORAGE_KEYS.following,
      userId,
    ),
    relationshipStorageKey(
      STORAGE_KEYS.blockedUsers,
      userId,
    ),
    ...(userId
      ? [
          relationshipMutationStorageKey(
            userId,
          ),
        ]
      : []),
  ]);

  if (
    isSupabaseConfigured &&
    userId
  ) {
    const { error } =
      await supabase
        .from(
          "user_relationships",
        )
        .delete()
        .eq("user_id", userId);

    if (error) {
      throw error;
    }
  }
}

async function readStoredStringArray(
  key: string,
): Promise<string[]> {
  const storedValue =
    await AsyncStorage.getItem(
      key,
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

    return normalizeUsernameArray(
      parsedValue.filter(
        (
          item,
        ): item is string =>
          typeof item ===
          "string",
      ),
    );
  } catch {
    return [];
  }
}

function normalizeUsernameArray(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map(normalizeUsername)
        .filter(Boolean),
    ),
  );
}

function normalizeUsername(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function readActivityType(
  value: unknown,
): CanalActivityType {
  if (
    value === "follow" ||
    value === "unfollow" ||
    value === "block" ||
    value === "unblock" ||
    value === "share" ||
    value === "collaboration" ||
    value === "snapshot" ||
    value === "scene"
  ) {
    return value;
  }

  return "system";
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

function createActivityId(): string {
  return `activity-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getTimestamp(
  value: string,
): number {
  const timestamp =
    new Date(value).getTime();

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : 0;
}
