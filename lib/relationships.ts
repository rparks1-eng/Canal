import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./storage-keys";
import {
  isSupabaseConfigured,
  supabase,
} from "./supabase";

const RELATIONSHIP_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

type QuarantinedRelationshipMutation =
  RelationshipMutation & {
    quarantinedAt: string;
    reason: "missing_stable_target";
  };

export type CanalActivityType =
  RelationshipActivityType;

export type CanalActivityItem =
  RelationshipActivity;

export type RelationshipState = {
  following: string[];
  blocked: string[];
  blockedTargets?:
    BlockedUserReference[];
  syncStatus?:
    | "synced"
    | "pending"
    | "offline";
};

export type BlockedUserReference = {
  username: string;
  targetUserId?: string;
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

export async function readBlockedUserReferences(): Promise<
  BlockedUserReference[]
> {
  const state =
    await readRelationshipState();

  return (
    state.blockedTargets ??
    state.blocked.map(
      (username) => ({
        username,
      }),
    )
  );
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

  if (
    isSupabaseConfigured &&
    userId &&
    normalizedUsernames.length >
      0
  ) {
    throw new Error(
      "Canal cannot save username-only block records for a signed-in account.",
    );
  }

  await assertExpectedUser(
    userId,
  );

  await Promise.all([
    writeStoredStringArray(
      relationshipStorageKey(
        STORAGE_KEYS.blockedUsers,
        userId,
      ),
      normalizedUsernames,
    ),
    writeBlockedUserReferenceCache(
      normalizedUsernames.map(
        (username) => ({
          username,
        }),
      ),
      userId,
    ),
  ]);

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

  assertStableRelationshipTarget(
    "follow",
    resolvedTargetUserId,
    expectedUserId,
  );

  const currentState =
    await readRelationshipStateForUser(
      expectedUserId,
    );
  const {
    following,
    blocked,
  } =
    currentState;

  const currentBlockedTargets =
    currentState.blockedTargets ??
    blocked.map<BlockedUserReference>(
      (blockedUsername) => ({
        username:
          blockedUsername,
      }),
    );
  const targetIsBlocked =
    currentBlockedTargets.some(
      (reference) =>
        resolvedTargetUserId
          ? reference.targetUserId ===
            resolvedTargetUserId
          : reference.username ===
            normalizedUsername,
    );

  if (targetIsBlocked) {
    throw new Error(
      "Unblock this profile before following it.",
    );
  }

  const updatedFollowing =
    Array.from(
      new Set([
        ...following,
        normalizedUsername,
      ]),
    );

  const syncStatus =
    await persistRelationshipChange(
    {
      following:
        updatedFollowing,
      blocked:
        blocked,
      blockedTargets:
        currentBlockedTargets,
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
      blocked,
    blockedTargets:
      currentBlockedTargets,
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

  assertStableRelationshipTarget(
    "unfollow",
    resolvedTargetUserId,
    expectedUserId,
  );

  const currentState =
    await readRelationshipStateForUser(
      expectedUserId,
    );
  const {
    following,
    blocked,
  } =
    currentState;

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
      blockedTargets:
        currentState
          .blockedTargets,
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
    blockedTargets:
      currentState
        .blockedTargets,
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

  assertStableRelationshipTarget(
    "block",
    resolvedTargetUserId,
    expectedUserId,
  );

  const currentState =
    await readRelationshipStateForUser(
      expectedUserId,
    );
  const {
    following,
    blocked,
  } =
    currentState;

  const updatedFollowing =
    following.filter(
      (item) =>
        item !== normalizedUsername,
    );

  const updatedBlockedTargets =
    [
      ...(
        currentState
          .blockedTargets ??
        blocked.map<BlockedUserReference>(
          (blockedUsername) => ({
            username:
              blockedUsername,
          }),
        )
      ).filter(
        (reference) =>
          resolvedTargetUserId
            ? reference
                .targetUserId !==
                resolvedTargetUserId
            : reference
                .username !==
                normalizedUsername,
      ),
      {
        username:
          normalizedUsername,
        ...(resolvedTargetUserId
          ? {
              targetUserId:
                resolvedTargetUserId,
            }
          : {}),
      },
    ];
  const updatedBlocked =
    normalizeUsernameArray(
      updatedBlockedTargets.map(
        (reference) =>
          reference.username,
      ),
    );

  const syncStatus =
    await persistRelationshipChange(
    {
      following:
        updatedFollowing,
      blocked:
        updatedBlocked,
      blockedTargets:
        updatedBlockedTargets,
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
        action: "upsert",
      },
    ],
    expectedUserId,
  );

  try {
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
  } catch (error) {
    console.warn(
      "Canal applied the block but could not record its local activity item:",
      error,
    );
  }

  return {
    following:
      updatedFollowing,

    blocked:
      updatedBlocked,
    blockedTargets:
      updatedBlockedTargets,
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

  assertStableRelationshipTarget(
    "unblock",
    resolvedTargetUserId,
    expectedUserId,
  );

  const currentState =
    await readRelationshipStateForUser(
      expectedUserId,
    );
  const {
    following,
    blocked,
  } =
    currentState;

  const updatedBlockedTargets =
    (
      currentState
        .blockedTargets ??
      blocked.map<BlockedUserReference>(
        (blockedUsername) => ({
          username:
            blockedUsername,
        }),
      )
    ).filter(
      (reference) =>
        resolvedTargetUserId
          ? reference
              .targetUserId !==
              resolvedTargetUserId
          : reference
              .username !==
              normalizedUsername,
    );
  const updatedBlocked =
    normalizeUsernameArray(
      updatedBlockedTargets.map(
        (reference) =>
          reference.username,
      ),
    );

  const syncStatus =
    await persistRelationshipChange(
    {
      following,
      blocked:
        updatedBlocked,
      blockedTargets:
        updatedBlockedTargets,
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

  try {
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
  } catch (error) {
    console.warn(
      "Canal applied the unblock but could not record its local activity item:",
      error,
    );
  }

  return {
    following,
    blocked:
      updatedBlocked,
    blockedTargets:
      updatedBlockedTargets,
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

  if (
    isSupabaseConfigured &&
    expectedUserId
  ) {
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

    /*
     * Cloud deletion can finish after an account switch.
     * Keep the original account's local cache until the
     * active session is revalidated.
     */
    await assertExpectedUser(
      expectedUserId,
    );
  }

  await AsyncStorage.multiRemove([
    storageKey,
    ...(storageKey ===
    STORAGE_KEYS.activity
      ? [
          STORAGE_KEYS.legacyReadActivity,
        ]
      : []),
  ]);
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

function assertStableRelationshipTarget(
  action:
    | "follow"
    | "unfollow"
    | "block"
    | "unblock",
  targetUserId: string | undefined,
  expectedUserId: string | null,
): void {
  if (
    isSupabaseConfigured &&
    expectedUserId &&
    !targetUserId
  ) {
    throw new Error(
      `Canal needs the profile's stable ID before trying to ${action} this person.`,
    );
  }

  if (
    targetUserId &&
    !RELATIONSHIP_UUID_PATTERN.test(
      targetUserId,
    )
  ) {
    throw new Error(
      `Canal needs a valid stable profile ID before trying to ${action} this person.`,
    );
  }

  if (
    targetUserId &&
    targetUserId ===
      expectedUserId
  ) {
    throw new Error(
      `A Canal account cannot ${action} itself.`,
    );
  }
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
    blockedTargets,
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
      readBlockedUserReferenceCache(
        userId,
      ),
    ]);

  const canonicalBlockedTargets =
    blockedTargets.length > 0
      ? blockedTargets
      : blocked.map<BlockedUserReference>(
          (username) => ({
            username,
          }),
        );
  const canonicalBlocked =
    normalizeUsernameArray(
      canonicalBlockedTargets.map(
        (reference) =>
          reference.username,
      ),
    );

  return {
    following:
      following.filter(
        (username) =>
          !canonicalBlocked.includes(
            username,
          ),
      ),
    blocked:
      canonicalBlocked,
    ...(blockedTargets.length >
    0
      ? {
          blockedTargets:
            canonicalBlockedTargets,
        }
      : {}),
  };
}

async function writeLocalRelationshipState(
  state: RelationshipState,
  userId:
    string | null,
): Promise<void> {
  const blockedTargets =
    normalizeBlockedUserReferences(
      state.blockedTargets ??
      state.blocked.map(
        (username) => ({
          username,
        }),
      ),
    );
  const blocked =
    normalizeUsernameArray(
      blockedTargets.map(
        (reference) =>
          reference.username,
      ),
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

  const writes:
    Promise<void>[] = [
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
    writeBlockedUserReferenceCache(
      blockedTargets,
      userId,
    ),
  ];

  await Promise.all(
    writes,
  );
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

  if (
    !isSupabaseConfigured ||
    !expectedUserId
  ) {
    await writeLocalRelationshipState(
      state,
      expectedUserId,
    );
    return undefined;
  }

  const existingPending =
    await readRelationshipMutations(
      expectedUserId,
    );
  const pending =
    compactRelationshipMutations([
      ...existingPending,
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

    try {
      await writeRelationshipMutations(
        expectedUserId,
        [],
      );
      await writeLocalRelationshipState(
        state,
        expectedUserId,
      );
    } catch (error) {
      console.warn(
        "Canal synchronized the relationship change, but its device cache will refresh on the next load:",
        error,
      );
    }

    await assertExpectedUser(
      expectedUserId,
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

    if (
      !isRetryableRelationshipSyncError(
        error,
      )
    ) {
      await writeRelationshipMutations(
        expectedUserId,
        existingPending,
      );
      throw error;
    }

    await assertExpectedUser(
      expectedUserId,
    );

    await writeLocalRelationshipState(
      state,
      expectedUserId,
    );

    await assertExpectedUser(
      expectedUserId,
    );

    console.warn(
      "Canal saved the relationship change to this account's device cache and will retry when the connection recovers:",
      error,
    );

    return "pending";
  }
}

export function isRetryableRelationshipSyncError(
  error: unknown,
): boolean {
  if (
    error instanceof TypeError ||
    (
      error instanceof Error &&
      error.name ===
        "AbortError"
    )
  ) {
    return true;
  }

  if (
    typeof error !==
      "object" ||
    error === null
  ) {
    return false;
  }

  const record =
    error as Record<
      string,
      unknown
    >;
  const status =
    typeof record.status ===
      "number"
      ? record.status
      : undefined;
  const code =
    typeof record.code ===
      "string"
      ? record.code
      : "";
  const message = [
    record.message,
    record.details,
    record.hint,
  ]
    .filter(
      (
        value,
      ): value is string =>
        typeof value ===
        "string",
    )
    .join(
      " ",
    )
    .toLowerCase();

  if (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (
      status !== undefined &&
      status >= 500
    )
  ) {
    return true;
  }

  if (
    code.startsWith(
      "08",
    ) ||
    code.startsWith(
      "53",
    ) ||
    code.startsWith(
      "57P0",
    ) ||
    code === "40001" ||
    code === "40P01" ||
    code === "57014" ||
    code === "58030" ||
    code === "PGRST003"
  ) {
    return true;
  }

  return /network|failed to fetch|offline|timed? out|timeout|connection (?:closed|reset|refused)|temporar|rate limit|too many requests|service unavailable|bad gateway|gateway timeout/u.test(
    message,
  );
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

    compacted.set(
      `${mutation.relationshipType}:${identity}`,
      normalizedMutation,
    );
  }

  for (const [
    key,
    mutation,
  ] of compacted) {
    if (
      mutation.relationshipType !==
        "blocked" ||
      mutation.action !==
        "upsert"
    ) {
      continue;
    }

    const identity =
      key.slice(
        "blocked:".length,
      );
    const followingKey =
      `following:${identity}`;
    const followingMutation =
      compacted.get(
        followingKey,
      );

    if (
      followingMutation?.action ===
      "upsert"
    ) {
      compacted.delete(
        followingKey,
      );
    }
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
  const blockedTargets =
    new Map<
      string,
      BlockedUserReference
    >();

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
      const targetUserId =
        typeof row.target_user_id ===
          "string" &&
        row.target_user_id.trim()
          ? row.target_user_id.trim()
          : undefined;

      blockedTargets.set(
        targetUserId ??
          `username:${username}`,
        {
          username,
          ...(targetUserId
            ? {
                targetUserId,
              }
            : {}),
        },
      );
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
    blockedTargets:
      Array.from(
        blockedTargets.values(),
      ),
  };
}

export async function flushRelationshipMutations(
  userId: string,
  mutations:
    RelationshipMutation[],
): Promise<void> {
  const blockedUpserts =
    mutations.filter(
      (mutation) =>
        mutation.action ===
          "upsert" &&
        mutation.relationshipType ===
          "blocked",
    ).sort(
      (first, second) =>
        Number(
          Boolean(
            second.targetUserId,
          ),
        ) -
        Number(
          Boolean(
            first.targetUserId,
          ),
        ),
    );

  for (
    const mutation of
    blockedUpserts
  ) {
    await flushBlockedRelationshipMutation(
      userId,
      mutation,
    );
  }

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
      ).sort(
        (first, second) =>
          Number(
            Boolean(
              second.targetUserId,
            ),
          ) -
          Number(
            Boolean(
              first.targetUserId,
            ),
          ),
      );

    if (deletions.length === 0) {
      continue;
    }

    if (
      relationshipType ===
      "blocked"
    ) {
      for (const mutation of deletions) {
        await flushBlockedRelationshipMutation(
          userId,
          mutation,
        );
      }

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
      throw new Error(
        "Canal needs a stable profile ID before removing this relationship.",
      );
    }
  }

  const upserts =
    mutations.filter(
      (mutation) =>
        mutation.action ===
          "upsert" &&
        mutation.relationshipType ===
          "following",
    );

  if (
    upserts.some(
      (mutation) =>
        !mutation.targetUserId,
    )
  ) {
    throw new Error(
      "Canal needs a stable profile ID before following this person.",
    );
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
                mutation.targetUserId!,
              relationship_type:
                mutation.relationshipType,
            }),
          ),
          {
            onConflict:
              "user_id,target_user_id",
          },
        );

    if (error) {
      throw error;
    }
  }

}

async function flushBlockedRelationshipMutation(
  userId: string,
  mutation:
    RelationshipMutation,
): Promise<void> {
  await assertExpectedUser(
    userId,
  );

  const {
    error,
  } =
    await supabase.rpc(
      "set_canal_user_block",
      {
        target_user_id_value:
          mutation.targetUserId ??
          null,
        target_username_value:
          mutation.username,
        blocked_value:
          mutation.action ===
          "upsert",
        expected_actor_id_value:
          userId,
      },
    );

  await assertExpectedUser(
    userId,
  );

  if (error) {
    throw error;
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

    const compacted =
      compactRelationshipMutations(
        mutations,
      );
    const runnable =
      compacted.filter(
        (mutation) =>
          Boolean(
            mutation.targetUserId &&
            RELATIONSHIP_UUID_PATTERN.test(
              mutation.targetUserId,
            ),
          ),
      );
    const unresolved =
      compacted.filter(
        (mutation) =>
          !runnable.includes(
            mutation,
          ),
      );

    if (unresolved.length > 0) {
      await quarantineRelationshipMutations(
        userId,
        unresolved,
      );
      await writeRelationshipMutations(
        userId,
        runnable,
      );
    }

    return runnable;
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

async function quarantineRelationshipMutations(
  userId: string,
  mutations:
    RelationshipMutation[],
): Promise<void> {
  const key =
    relationshipMutationQuarantineStorageKey(
      userId,
    );
  const storedValue =
    await AsyncStorage.getItem(
      key,
    );
  let existing:
    QuarantinedRelationshipMutation[] =
      [];

  if (storedValue) {
    try {
      const parsed: unknown =
        JSON.parse(
          storedValue,
        );

      if (Array.isArray(parsed)) {
        existing =
          parsed.filter(
            (
              value,
            ): value is QuarantinedRelationshipMutation =>
              typeof value ===
                "object" &&
              value !== null &&
              "username" in value &&
              "relationshipType" in
                value &&
              "action" in value &&
              "quarantinedAt" in
                value &&
              "reason" in value,
          );
      }
    } catch {
      existing = [];
    }
  }

  const quarantinedAt =
    new Date().toISOString();
  const quarantined =
    new Map<
      string,
      QuarantinedRelationshipMutation
    >();

  for (const mutation of [
    ...existing,
    ...mutations.map(
      (mutation) => ({
        ...mutation,
        quarantinedAt,
        reason:
          "missing_stable_target" as const,
      }),
    ),
  ]) {
    quarantined.set(
      [
        mutation.relationshipType,
        mutation.action,
        normalizeUsername(
          mutation.username,
        ),
      ].join(
        ":",
      ),
      mutation,
    );
  }

  await AsyncStorage.setItem(
    key,
    JSON.stringify(
      Array.from(
        quarantined.values(),
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

function relationshipMutationQuarantineStorageKey(
  userId: string,
): string {
  return `${STORAGE_KEYS.relationshipMutationQuarantine}:${userId}`;
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

function normalizeBlockedUserReferences(
  references:
    BlockedUserReference[],
): BlockedUserReference[] {
  const normalized =
    new Map<
      string,
      BlockedUserReference
    >();

  for (const reference of references) {
    const username =
      normalizeUsername(
        reference.username,
      );
    const targetUserId =
      reference.targetUserId
        ?.trim()
        .toLowerCase();

    if (!username) {
      continue;
    }

    const validTargetUserId =
      targetUserId &&
      RELATIONSHIP_UUID_PATTERN.test(
        targetUserId,
      )
        ? targetUserId
        : undefined;

    normalized.set(
      validTargetUserId ??
        `username:${username}`,
      {
        username,
        ...(validTargetUserId
          ? {
              targetUserId:
                validTargetUserId,
            }
          : {}),
      },
    );
  }

  return Array.from(
    normalized.values(),
  );
}

async function readBlockedUserReferenceCache(
  userId: string | null,
): Promise<BlockedUserReference[]> {
  const value =
    await AsyncStorage.getItem(
      relationshipStorageKey(
        STORAGE_KEYS
          .blockedUserReferences,
        userId,
      ),
    );

  if (!value) {
    return [];
  }

  try {
    const parsed: unknown =
      JSON.parse(
        value,
      );

    if (!Array.isArray(parsed)) {
      return [];
    }

    const references =
      new Map<
        string,
        BlockedUserReference
      >();

    for (const item of parsed) {
      if (
        typeof item !==
          "object" ||
        item === null
      ) {
        continue;
      }

      const record =
        item as Record<
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
      const targetUserId =
        typeof record.targetUserId ===
          "string" &&
        RELATIONSHIP_UUID_PATTERN.test(
          record.targetUserId,
        )
          ? record.targetUserId
              .toLowerCase()
          : undefined;

      if (!username) {
        continue;
      }

      references.set(
        targetUserId ??
          `username:${username}`,
        {
          username,
          ...(targetUserId
            ? {
                targetUserId,
              }
            : {}),
        },
      );
    }

    return Array.from(
      references.values(),
    );
  } catch {
    return [];
  }
}

async function writeBlockedUserReferenceCache(
  references:
    BlockedUserReference[],
  userId: string | null,
): Promise<void> {
  const normalized =
    normalizeBlockedUserReferences(
      references,
    );

  await AsyncStorage.setItem(
    relationshipStorageKey(
      STORAGE_KEYS
        .blockedUserReferences,
      userId,
    ),
    JSON.stringify(
      normalized,
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
    relationshipStorageKey(
      STORAGE_KEYS
        .blockedUserReferences,
      userId,
    ),
    ...(userId
      ? [
          relationshipMutationStorageKey(
            userId,
          ),
          relationshipMutationQuarantineStorageKey(
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
