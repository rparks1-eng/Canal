import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  User,
} from "@supabase/supabase-js";

import type {
  LocalProfile,
} from "./canal-session";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

const PROFILE_CACHE_PREFIX =
  "@canal/profile-cache:";

type ProfileRow = {
  id: string;
  display_name: string | null;
  handle: string | null;
  bio: string | null;
  favorite_activities: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeHandle(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /^@+/,
      "",
    )
    .replace(
      /[^a-z0-9_]/g,
      "",
    )
    .slice(
      0,
      24,
    );
}

function fallbackHandle(
  userId: string,
): string {
  return (
    "canal_" +
    userId
      .replace(
        /-/g,
        "",
      )
      .slice(
        0,
        10,
      )
      .toLowerCase()
  );
}

function cacheKey(
  userId: string,
): string {
  return (
    PROFILE_CACHE_PREFIX +
    userId
  );
}

function metadataString(
  user: User,
  key: string,
): string {
  const value =
    user.user_metadata?.[key];

  return typeof value ===
    "string"
    ? value
    : "";
}

function normalizeDisplayName(
  value: string,
): string {
  return (
    Array.from(
      value.trim(),
    )
      .slice(
        0,
        60,
      )
      .join("") ||
    "Canal Listener"
  );
}

function rowToProfile(
  row: ProfileRow,
): LocalProfile {
  return {
    displayName:
      row.display_name ||
      "Canal Listener",

    handle:
      `@${row.handle || "canaluser"}`,

    bio:
      row.bio ||
      "",

    favoriteActivities:
      row.favorite_activities ||
      "",

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

async function getCurrentUser(): Promise<User> {
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
      "You must be signed into Canal to access your profile.",
    );
  }

  return user;
}

async function writeCache(
  userId: string,
  profile: LocalProfile,
): Promise<void> {
  await AsyncStorage.setItem(
    cacheKey(
      userId,
    ),
    JSON.stringify(
      profile,
    ),
  );
}

async function readCache(
  userId: string,
): Promise<LocalProfile | null> {
  const serialized =
    await AsyncStorage.getItem(
      cacheKey(
        userId,
      ),
    );

  if (!serialized) {
    return null;
  }

  try {
    return JSON.parse(
      serialized,
    ) as LocalProfile;
  } catch {
    return null;
  }
}

async function insertProfile(
  user: User,
  handle: string,
): Promise<ProfileRow> {
  const displayName =
    normalizeDisplayName(
      metadataString(
        user,
        "display_name",
      ) ||
      metadataString(
        user,
        "full_name",
      ) ||
      user.email?.split(
        "@",
      )[0] ||
      "Canal Listener",
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "profiles",
      )
      .insert({
        id:
          user.id,

        display_name:
          displayName,

        handle,

        bio:
          "",

        favorite_activities:
          "",
      })
      .select(
        "id, display_name, handle, bio, favorite_activities, created_at, updated_at",
      )
      .single();

  if (error) {
    throw error;
  }

  return data as ProfileRow;
}

export async function ensureOwnCanalProfile(): Promise<
  LocalProfile
> {
  const user =
    await getCurrentUser();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "profiles",
      )
      .select(
        "id, display_name, handle, bio, favorite_activities, created_at, updated_at",
      )
      .eq(
        "id",
        user.id,
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  let row =
    data as
      | ProfileRow
      | null;

  if (!row) {
    const requestedHandle =
      normalizeHandle(
        metadataString(
          user,
          "handle",
        ),
      );

    const initialHandle =
      requestedHandle.length >=
      3
        ? requestedHandle
        : fallbackHandle(
            user.id,
          );

    try {
      row =
        await insertProfile(
          user,
          initialHandle,
        );
    } catch (insertError) {
      if (
        initialHandle ===
        fallbackHandle(
          user.id,
        )
      ) {
        throw insertError;
      }

      row =
        await insertProfile(
          user,
          fallbackHandle(
            user.id,
          ),
        );
    }
  }

  const profile =
    rowToProfile(
      row,
    );

  await writeCache(
    user.id,
    profile,
  );

  return profile;
}

export async function readOwnCanalProfile(): Promise<
  LocalProfile
> {
  const user =
    await getCurrentUser();

  try {
    return await ensureOwnCanalProfile();
  } catch (error) {
    const cached =
      await readCache(
        user.id,
      );

    if (cached) {
      return cached;
    }

    throw error;
  }
}

export async function saveOwnCanalProfile(
  input: LocalProfile,
): Promise<LocalProfile> {
  const user =
    await getCurrentUser();

  const displayName =
    normalizeDisplayName(
      input.displayName,
    );

  const handle =
    normalizeHandle(
      input.handle,
    );

  if (
    handle.length <
    3
  ) {
    throw new Error(
      "Your Canal handle must contain at least three letters, numbers, or underscores.",
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "profiles",
      )
      .upsert(
        {
          id:
            user.id,

          display_name:
            displayName,

          handle,

          bio:
            input.bio
              .trim()
              .slice(
                0,
                300,
              ),

          favorite_activities:
            input.favoriteActivities
              .trim()
              .slice(
                0,
                300,
              ),

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "id",
        },
      )
      .select(
        "id, display_name, handle, bio, favorite_activities, created_at, updated_at",
      )
      .single();

  if (error) {
    const message =
      error.message.toLowerCase();

    if (
      message.includes(
        "duplicate",
      ) ||
      message.includes(
        "handle",
      )
    ) {
      throw new Error(
        "That Canal handle is already being used.",
      );
    }

    throw new Error(
      `Canal could not save your cloud profile: ${error.message}`,
    );
  }

  const {
    error: metadataError,
  } =
    await supabase.auth.updateUser({
      data: {
        display_name:
          displayName,

        handle,
      },
    });

  if (metadataError) {
    throw metadataError;
  }

  const profile =
    rowToProfile(
      data as ProfileRow,
    );

  await writeCache(
    user.id,
    profile,
  );

  return profile;
}

export async function clearCachedCanalProfile(): Promise<void> {
  const keys =
    await AsyncStorage.getAllKeys();

  const profileKeys =
    keys.filter(
      (key) =>
        key.startsWith(
          PROFILE_CACHE_PREFIX,
        ) ||
        key ===
          "@canal/local-profile",
    );

  if (
    profileKeys.length >
    0
  ) {
    await AsyncStorage.multiRemove(
      profileKeys,
    );
  }
}
