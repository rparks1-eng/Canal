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

export type CanalActivityType =
  RelationshipActivityType;

export type CanalActivityItem =
  RelationshipActivity;

export type RelationshipState = {
  following: string[];
  blocked: string[];
};

export type RecordActivityInput = {
  type: RelationshipActivityType;
  title: string;
  description: string;
  username?: string;
  displayName?: string;
};

export async function readRelationshipState(): Promise<RelationshipState> {
  const [following, blocked] =
    await Promise.all([
      readFollowing(),
      readBlockedUsers(),
    ]);

  return {
    following,
    blocked,
  };
}

export async function readFollowing(): Promise<string[]> {
  return readStoredStringArray(
    STORAGE_KEYS.following,
  );
}

export async function readBlockedUsers(): Promise<string[]> {
  return readStoredStringArray(
    STORAGE_KEYS.blockedUsers,
  );
}

export async function writeFollowing(
  usernames: string[],
): Promise<string[]> {
  const normalizedUsernames =
    normalizeUsernameArray(
      usernames,
    );

  await AsyncStorage.setItem(
    STORAGE_KEYS.following,
    JSON.stringify(
      normalizedUsernames,
    ),
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

  await AsyncStorage.setItem(
    STORAGE_KEYS.blockedUsers,
    JSON.stringify(
      normalizedUsernames,
    ),
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

  const [following, blocked] =
    await Promise.all([
      readFollowing(),
      readBlockedUsers(),
    ]);

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

  await Promise.all([
    writeFollowing(
      updatedFollowing,
    ),

    writeBlockedUsers(
      updatedBlocked,
    ),

    recordActivity({
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
    }),
  ]);

  return {
    following:
      updatedFollowing,

    blocked:
      updatedBlocked,
  };
}

export async function unfollowUser(
  username: string,
  displayName?: string,
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  const [following, blocked] =
    await Promise.all([
      readFollowing(),
      readBlockedUsers(),
    ]);

  const updatedFollowing =
    following.filter(
      (item) =>
        item !== normalizedUsername,
    );

  await Promise.all([
    writeFollowing(
      updatedFollowing,
    ),

    recordActivity({
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
    }),
  ]);

  return {
    following:
      updatedFollowing,

    blocked,
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

  const [following, blocked] =
    await Promise.all([
      readFollowing(),
      readBlockedUsers(),
    ]);

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

  await Promise.all([
    writeFollowing(
      updatedFollowing,
    ),

    writeBlockedUsers(
      updatedBlocked,
    ),

    recordActivity({
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
    }),
  ]);

  return {
    following:
      updatedFollowing,

    blocked:
      updatedBlocked,
  };
}

export async function unblockUser(
  username: string,
  displayName?: string,
): Promise<RelationshipState> {
  const normalizedUsername =
    normalizeUsername(username);

  const [following, blocked] =
    await Promise.all([
      readFollowing(),
      readBlockedUsers(),
    ]);

  const updatedBlocked =
    blocked.filter(
      (item) =>
        item !== normalizedUsername,
    );

  await Promise.all([
    writeBlockedUsers(
      updatedBlocked,
    ),

    recordActivity({
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
    }),
  ]);

  return {
    following,
    blocked:
      updatedBlocked,
  };
}

export async function isFollowingUser(
  username: string,
): Promise<boolean> {
  const following =
    await readFollowing();

  return following.includes(
    normalizeUsername(username),
  );
}

export async function isBlockedUser(
  username: string,
): Promise<boolean> {
  const blocked =
    await readBlockedUsers();

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
  const currentValue =
    await AsyncStorage.getItem(
      STORAGE_KEYS.activity,
    );

  const legacyValue =
    currentValue
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
  await AsyncStorage.setItem(
    STORAGE_KEYS.activity,
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
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.activity,
    STORAGE_KEYS.legacyReadActivity,
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
