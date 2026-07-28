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
  relationship_type:
    RelationshipKind;
};

export type RelationshipMutation = {
  username: string;
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
  const localState =
    await readLocalRelationshipState();

  if (!isSupabaseConfigured) {
    return localState;
  }

  try {
    const userId =
      await currentUserId();

    if (!userId) {
      return localState;
    }

    const pendingMutations =
      await readRelationshipMutations(
        userId,
      );

    if (
      pendingMutations.length >
      0
    ) {
      await flushRelationshipMutations(
        userId,
        pendingMutations,
      );
    }

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "user_relationships",
        )
        .select(
          "target_username, relationship_type",
        )
        .eq("user_id", userId);

    if (error) {
      throw error;
    }

    const cloudState =
      relationshipRowsToState(
        (data ?? []) as
          RelationshipRow[],
      );

    await writeLocalRelationshipState(
      cloudState,
      userId,
    );

    await writeRelationshipMutations(
      userId,
      [],
    );

    return {
      ...cloudState,
      syncStatus: "synced",
    };
  } catch (error) {
    console.warn(
      "Canal relationships are offline; using the device cache:",
      error,
    );

    const userId =
      await relationshipUserId();

    const pending =
      userId
        ? await readRelationshipMutations(
            userId,
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
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  if (!normalizedUsername) {
    throw new Error(
      "A valid username is required.",
    );
  }

  const {
    following,
    blocked,
  } =
    await readRelationshipState();

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
        relationshipType:
          "following",
        action: "upsert",
      },
      {
        username:
          normalizedUsername,
        relationshipType:
          "blocked",
        action: "delete",
      },
    ],
  );

  await recordActivity({
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
    });

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
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  const {
    following,
    blocked,
  } =
    await readRelationshipState();

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
        relationshipType:
          "following",
        action: "delete",
      },
    ],
  );

  await recordActivity({
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
    });

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
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  if (!normalizedUsername) {
    throw new Error(
      "A valid username is required.",
    );
  }

  const {
    following,
    blocked,
  } =
    await readRelationshipState();

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
        relationshipType:
          "following",
        action: "delete",
      },
      {
        username:
          normalizedUsername,
        relationshipType:
          "blocked",
        action: "upsert",
      },
    ],
  );

  await recordActivity({
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
    });

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
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  const {
    following,
    blocked,
  } =
    await readRelationshipState();

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
        relationshipType:
          "blocked",
        action: "delete",
      },
    ],
  );

  await recordActivity({
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
    });

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
  const localActivities =
    await readLocalActivity();

  if (!isSupabaseConfigured) {
    return localActivities;
  }

  try {
    const userId =
      await currentUserId();

    if (!userId) {
      return localActivities;
    }

    const pending =
      localActivities.filter(
        (item) =>
          item.syncStatus ===
          "pending",
      );

    if (pending.length > 0) {
      await upsertCloudActivity(
        userId,
        pending,
      );
    }

    const {
      data,
      error,
    } =
      await supabase
        .from("activity_events")
        .select(
          "id, type, title, description, username, display_name, created_at, is_read",
        )
        .eq("user_id", userId)
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

    await writeActivity(merged);

    return merged;
  } catch (error) {
    console.warn(
      "Canal activity is offline; using the device cache:",
      error,
    );

    return localActivities;
  }
}

async function readLocalActivity(): Promise<
  CanalActivityItem[]
> {
  const storageKey =
    await activityStorageKey();

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
  const activities =
    await readActivity();

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

  await writeActivity(
    updatedActivities,
  );

  if (isSupabaseConfigured) {
    try {
      const userId =
        await currentUserId();

      if (userId) {
        await upsertCloudActivity(
          userId,
          [activity],
        );

        activity.syncStatus =
          "synced";

        await writeActivity(
          updatedActivities.map(
            (item) =>
              item.id ===
              activity.id
                ? activity
                : item,
          ),
        );
      }
    } catch (error) {
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
  const storageKey =
    await activityStorageKey();

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
  const activities =
    await readActivity();

  await writeActivity(
    activities.map((activity) =>
      activity.id === activityId
        ? {
            ...activity,
            isRead: true,
          }
        : activity,
    ),
  );

  if (isSupabaseConfigured) {
    try {
      const userId =
        await currentUserId();

      if (userId) {
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
              userId,
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
      console.warn(
        "Canal could not mark cloud activity as read:",
        error,
      );
    }
  }
}

export async function markAllActivityRead(): Promise<void> {
  const activities =
    await readActivity();

  await writeActivity(
    activities.map(
      (activity) => ({
        ...activity,
        isRead: true,
      }),
    ),
  );

  if (isSupabaseConfigured) {
    try {
      const userId =
        await currentUserId();

      if (userId) {
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
              userId,
            );

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      console.warn(
        "Canal could not mark cloud activity as read:",
        error,
      );
    }
  }
}

export async function clearActivity(): Promise<void> {
  const storageKey =
    await activityStorageKey();

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
    const userId =
      await currentUserId();

    if (userId) {
      const { error } =
        await supabase
          .from("activity_events")
          .delete()
          .eq("user_id", userId);

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

async function activityStorageKey(): Promise<string> {
  if (!isSupabaseConfigured) {
    return STORAGE_KEYS.activity;
  }

  try {
    const {
      data: {
        session,
      },
    } =
      await supabase.auth.getSession();

    const userId =
      session?.user.id;

    return userId
      ? `${STORAGE_KEYS.activity}:${userId}`
      : STORAGE_KEYS.activity;
  } catch {
    return STORAGE_KEYS.activity;
  }
}

async function currentUserId(): Promise<
  string | null
> {
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

  return user?.id ?? null;
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

async function readLocalRelationshipState(): Promise<RelationshipState> {
  const userId =
    await relationshipUserId();

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
): Promise<
  | "synced"
  | "pending"
  | undefined
> {
  const userId =
    await relationshipUserId();

  await writeLocalRelationshipState(
    state,
    userId,
  );

  if (
    !isSupabaseConfigured ||
    !userId
  ) {
    return undefined;
  }

  const pending =
    compactRelationshipMutations([
      ...await readRelationshipMutations(
        userId,
      ),
      ...mutations,
    ]);

  await writeRelationshipMutations(
    userId,
    pending,
  );

  try {
    await flushRelationshipMutations(
      userId,
      pending,
    );

    await writeRelationshipMutations(
      userId,
      [],
    );

    return "synced";
  } catch (error) {
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
    };

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
        `${otherType}:${username}`,
        {
          username,
          relationshipType:
            otherType,
          action: "delete",
        },
      );
    }

    compacted.set(
      `${mutation.relationshipType}:${username}`,
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
  const upserts =
    mutations.filter(
      (mutation) =>
        mutation.action ===
        "upsert",
    );

  if (upserts.length > 0) {
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

  for (
    const relationshipType
    of [
      "following",
      "blocked",
    ] as const
  ) {
    const usernames =
      mutations
        .filter(
          (mutation) =>
            mutation.action ===
              "delete" &&
            mutation.relationshipType ===
              relationshipType,
        )
        .map(
          (mutation) =>
            mutation.username,
        );

    if (usernames.length === 0) {
      continue;
    }

    const { error } =
      await supabase
        .from(
          "user_relationships",
        )
        .delete()
        .eq("user_id", userId)
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
