import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./storage-keys";

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

    return activities.sort(
      (first, second) =>
        getTimestamp(
          second.createdAt,
        ) -
        getTimestamp(
          first.createdAt,
        ),
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
    };

  const updatedActivities = [
    activity,
    ...activities,
  ].slice(0, 200);

  await writeActivity(
    updatedActivities,
  );

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
}

export async function clearActivity(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.activity,
    STORAGE_KEYS.legacyReadActivity,
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