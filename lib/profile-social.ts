import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

type ProfileRow = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  favorite_activities: string | null;
  is_public: boolean | null;
  is_verified: boolean | null;
  is_canal: boolean | null;
};

type RelationshipRow = {
  user_id: string;
  target_user_id: string | null;
  created_at: string;
};

export type ProfileConnectionProfile = {
  id: string;
  displayName: string;
  handle: string;
  normalizedHandle: string;
  avatarUrl: string | null;
  bio: string;
  favoriteActivities: string;
  isPublic: boolean;
  isVerified: boolean;
  isCanal: boolean;
};

export type ProfileConnection = {
  profile: ProfileConnectionProfile;
  connectedAt: string;
  viewerIsFollowing: boolean;
};

export type ProfileFollowState = {
  profileId: string;
  viewerId: string;
  isOwnProfile: boolean;
  viewerIsFollowing: boolean;
};

export type ProfileConnectionSummary =
  ProfileFollowState & {
    followingCount: number;
    followerCount: number;
  };

export type ProfileConnectionList = {
  profileId: string;
  following: ProfileConnection[];
  followers: ProfileConnection[];
  summary: ProfileConnectionSummary;
};

export type ProfileSocialAccountScope = Readonly<{
  viewerId: string;
}>;

export type ProfileSocialReadOptions = {
  account?: ProfileSocialAccountScope;
};

export type ProfileConnectionListOptions = {
  limit?: number;
  offset?: number;
  account?: ProfileSocialAccountScope;
};

export type ProfileFollowMutationOptions = {
  account?: ProfileSocialAccountScope;
};

const PROFILE_COLUMNS = [
  "id",
  "display_name",
  "handle",
  "avatar_url",
  "bio",
  "favorite_activities",
  "is_public",
  "is_verified",
  "is_canal",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeProfileHandle(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export async function captureProfileSocialAccount(
  expectedViewerId?: string,
): Promise<ProfileSocialAccountScope> {
  const viewerId =
    await currentUserId();

  if (
    expectedViewerId &&
    viewerId !==
      requireUuid(
        expectedViewerId,
        "viewer",
      )
  ) {
    throw profileSocialAccountChangedError();
  }

  return {
    viewerId,
  };
}

export async function loadProfileFollowState(
  profileId: string,
  options: ProfileSocialReadOptions = {},
): Promise<ProfileFollowState> {
  const targetProfileId =
    requireUuid(
      profileId,
      "profile",
    );

  const account =
    await resolveProfileSocialAccount(
      options.account,
    );

  const state =
    await loadProfileFollowStateForViewer(
      targetProfileId,
      account,
    );

  await assertProfileSocialAccount(
    account,
  );

  return state;
}

export async function loadProfileConnectionSummary(
  profileId: string,
  options: ProfileSocialReadOptions = {},
): Promise<ProfileConnectionSummary> {
  const targetProfileId =
    requireUuid(
      profileId,
      "profile",
    );

  const account =
    await resolveProfileSocialAccount(
      options.account,
    );

  const [
    followingCount,
    followerCount,
    followState,
  ] =
    await Promise.all([
      loadProfileFollowingCount(
        targetProfileId,
        account,
      ),

      loadProfileFollowerCount(
        targetProfileId,
        account,
      ),

      loadProfileFollowStateForViewer(
        targetProfileId,
        account,
      ),
    ]);

  await assertProfileSocialAccount(
    account,
  );

  return {
    ...followState,

    followingCount,

    followerCount,
  };
}

export async function loadProfileFollowing(
  profileId: string,
  options: ProfileConnectionListOptions = {},
): Promise<ProfileConnection[]> {
  const targetProfileId =
    requireUuid(
      profileId,
      "profile",
    );

  const account =
    await resolveProfileSocialAccount(
      options.account,
    );

  const {
    limit,
    offset,
  } =
    normalizeListOptions(
      options,
    );

  const {
    data,
    error,
  } =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .select(
            "user_id, target_user_id, created_at",
          )
          .eq(
            "user_id",
            targetProfileId,
          )
          .eq(
            "relationship_type",
            "following",
          )
          .not(
            "target_user_id",
            "is",
            null,
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            },
          )
          .range(
            offset,
            offset +
              limit -
              1,
          ),
      );

  if (error) {
    throw new Error(
      `Canal could not load the profiles this user follows: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as RelationshipRow[];

  const connections =
    await hydrateConnections(
      rows,
      "following",
      account,
    );

  await assertProfileSocialAccount(
    account,
  );

  return connections;
}

export async function loadProfileFollowers(
  profileId: string,
  options: ProfileConnectionListOptions = {},
): Promise<ProfileConnection[]> {
  const targetProfileId =
    requireUuid(
      profileId,
      "profile",
    );

  const account =
    await resolveProfileSocialAccount(
      options.account,
    );

  const {
    limit,
    offset,
  } =
    normalizeListOptions(
      options,
    );

  const {
    data,
    error,
  } =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .select(
            "user_id, target_user_id, created_at",
          )
          .eq(
            "target_user_id",
            targetProfileId,
          )
          .eq(
            "relationship_type",
            "following",
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            },
          )
          .range(
            offset,
            offset +
              limit -
              1,
          ),
      );

  if (error) {
    throw new Error(
      `Canal could not load this profile's followers: ${error.message}`,
    );
  }

  const connections =
    await hydrateConnections(
      (
        data ??
        []
      ) as RelationshipRow[],
      "followers",
      account,
    );

  await assertProfileSocialAccount(
    account,
  );

  return connections;
}

export async function loadProfileConnections(
  profileId: string,
  options: ProfileConnectionListOptions = {},
): Promise<ProfileConnectionList> {
  const targetProfileId =
    requireUuid(
      profileId,
      "profile",
    );

  const account =
    await resolveProfileSocialAccount(
      options.account,
    );

  const scopedOptions = {
    ...options,
    account,
  };

  const [
    summary,
    following,
    followers,
  ] =
    await Promise.all([
      loadProfileConnectionSummary(
        targetProfileId,
        {
          account,
        },
      ),

      loadProfileFollowing(
        targetProfileId,
        scopedOptions,
      ),

      loadProfileFollowers(
        targetProfileId,
        scopedOptions,
      ),
    ]);

  await assertProfileSocialAccount(
    account,
  );

  return {
    profileId:
      targetProfileId,

    following,

    followers,

    summary,
  };
}

export async function setViewerFollowingProfile(
  profileId: string,
  shouldFollow: boolean,
  options: ProfileFollowMutationOptions = {},
): Promise<ProfileFollowState> {
  const targetProfileId =
    requireUuid(
      profileId,
      "profile",
    );

  const account =
    await resolveProfileSocialAccount(
      options.account,
    );

  const {
    viewerId,
  } =
    account;

  if (
    viewerId ===
    targetProfileId
  ) {
    throw new Error(
      "You cannot follow your own Canal profile.",
    );
  }

  if (shouldFollow) {
    const target =
      await loadTargetProfile(
        targetProfileId,
        account,
      );

    if (
      !target.isPublic
    ) {
      throw new Error(
        "Only public Canal profiles can be followed.",
      );
    }

    await writeFollowRelationship(
      account,
      target,
    );
  } else {
    await deleteFollowRelationship(
      account,
      targetProfileId,
    );
  }

  await assertProfileSocialAccount(
    account,
  );

  return {
    profileId:
      targetProfileId,

    viewerId,

    isOwnProfile:
      false,

    viewerIsFollowing:
      shouldFollow,
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
      "You must be signed into Canal to view profile connections.",
    );
  }

  return user.id;
}

async function resolveProfileSocialAccount(
  account:
    | ProfileSocialAccountScope
    | undefined,
): Promise<ProfileSocialAccountScope> {
  if (!account) {
    return captureProfileSocialAccount();
  }

  const resolvedAccount = {
    viewerId:
      requireUuid(
        account.viewerId,
        "viewer",
      ),
  };

  await assertProfileSocialAccount(
    resolvedAccount,
  );

  return resolvedAccount;
}

async function assertProfileSocialAccount(
  account: ProfileSocialAccountScope,
): Promise<void> {
  const currentViewerId =
    await currentUserId();

  if (
    currentViewerId !==
    account.viewerId
  ) {
    throw profileSocialAccountChangedError();
  }
}

async function runProfileSocialQuery<T>(
  account: ProfileSocialAccountScope,
  query: () => PromiseLike<T>,
): Promise<T> {
  await assertProfileSocialAccount(
    account,
  );

  const result =
    await query();

  await assertProfileSocialAccount(
    account,
  );

  return result;
}

function profileSocialAccountChangedError(): Error {
  return new Error(
    "The signed-in Canal account changed while profile connections were loading. Please try again.",
  );
}

async function loadProfileFollowingCount(
  profileId: string,
  account: ProfileSocialAccountScope,
): Promise<number> {
  const result =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .select(
            "target_user_id",
            {
              count:
                "exact",
              head:
                true,
            },
          )
          .eq(
            "user_id",
            profileId,
          )
          .eq(
            "relationship_type",
            "following",
          )
          .not(
            "target_user_id",
            "is",
            null,
          ),
    );

  if (result.error) {
    throw new Error(
      `Canal could not load this profile's following count: ${result.error.message}`,
    );
  }

  await assertProfileSocialAccount(
    account,
  );

  return result.count ??
    0;
}

async function loadProfileFollowerCount(
  profileId: string,
  account: ProfileSocialAccountScope,
): Promise<number> {
  const result =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .select(
            "user_id",
            {
              count:
                "exact",
              head:
                true,
            },
          )
          .eq(
            "target_user_id",
            profileId,
          )
          .eq(
            "relationship_type",
            "following",
          ),
    );

  if (result.error) {
    throw new Error(
      `Canal could not load this profile's follower count: ${result.error.message}`,
    );
  }

  await assertProfileSocialAccount(
    account,
  );

  return result.count ??
    0;
}

async function loadProfileFollowStateForViewer(
  profileId: string,
  account: ProfileSocialAccountScope,
): Promise<ProfileFollowState> {
  const {
    viewerId,
  } =
    account;

  if (
    profileId ===
    viewerId
  ) {
    await assertProfileSocialAccount(
      account,
    );

    return {
      profileId,
      viewerId,
      isOwnProfile:
        true,
      viewerIsFollowing:
        false,
    };
  }

  const {
    data,
    error,
  } =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .select(
            "target_user_id",
          )
          .eq(
            "user_id",
            viewerId,
          )
          .eq(
            "target_user_id",
            profileId,
          )
          .eq(
            "relationship_type",
            "following",
          )
          .limit(
            1,
          )
          .maybeSingle(),
    );

  if (error) {
    throw new Error(
      `Canal could not determine whether you follow this profile: ${error.message}`,
    );
  }

  await assertProfileSocialAccount(
    account,
  );

  return {
    profileId,
    viewerId,
    isOwnProfile:
      false,
    viewerIsFollowing:
      Boolean(
        data,
      ),
  };
}

async function hydrateConnections(
  rows: RelationshipRow[],
  direction:
    | "following"
    | "followers",
  account: ProfileSocialAccountScope,
): Promise<ProfileConnection[]> {
  const profileIds =
    Array.from(
      new Set(
        rows
          .map(
            (row) =>
              direction ===
              "following"
                ? row.target_user_id
                : row.user_id,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(
                value,
              ),
          ),
      ),
    );

  if (
    profileIds.length ===
    0
  ) {
    await assertProfileSocialAccount(
      account,
    );

    return [];
  }

  const [
    profileResult,
    viewerFollowingIds,
  ] =
    await Promise.all([
      runProfileSocialQuery(
        account,
        () =>
          supabase
            .from(
              "profiles",
            )
            .select(
              PROFILE_COLUMNS,
            )
            .in(
              "id",
              profileIds,
            ),
      ),

      loadViewerFollowingIds(
        account,
        profileIds,
      ),
    ]);

  if (profileResult.error) {
    throw new Error(
      `Canal could not load profile connection details: ${profileResult.error.message}`,
    );
  }

  const profiles =
    new Map<
      string,
      ProfileConnectionProfile
    >(
      (
        (
          profileResult.data ??
          []
        ) as unknown as
          ProfileRow[]
      ).map(
        (row) => [
          row.id,
          normalizeProfile(
            row,
          ),
        ],
      ),
    );

  const connections =
    rows
      .map(
        (
          row,
        ): ProfileConnection | null => {
          const profileId =
            direction ===
            "following"
              ? row.target_user_id
              : row.user_id;

          if (!profileId) {
            return null;
          }

          const profile =
            profiles.get(
              profileId,
            );

          if (!profile) {
            return null;
          }

          return {
            profile,

            connectedAt:
              row.created_at,

            viewerIsFollowing:
              viewerFollowingIds.has(
                profileId,
              ),
          };
        },
      )
      .filter(
        (
          value,
        ): value is ProfileConnection =>
          value !==
          null,
      );

  await assertProfileSocialAccount(
    account,
  );

  return connections;
}

async function loadViewerFollowingIds(
  account: ProfileSocialAccountScope,
  profileIds: string[],
): Promise<Set<string>> {
  const {
    viewerId,
  } =
    account;

  const candidateIds =
    profileIds.filter(
      (profileId) =>
        profileId !==
        viewerId,
    );

  if (
    candidateIds.length ===
    0
  ) {
    await assertProfileSocialAccount(
      account,
    );

    return new Set();
  }

  const {
    data,
    error,
  } =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .select(
            "target_user_id",
          )
          .eq(
            "user_id",
            viewerId,
          )
          .eq(
            "relationship_type",
            "following",
          )
          .in(
            "target_user_id",
            candidateIds,
          ),
    );

  if (error) {
    throw new Error(
      `Canal could not load your follow state: ${error.message}`,
    );
  }

  const followingIds =
    new Set(
      (
        (
          data ??
          []
        ) as Pick<
          RelationshipRow,
          "target_user_id"
        >[]
      )
        .map(
          (row) =>
            row.target_user_id,
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(
              value,
            ),
        ),
    );

  await assertProfileSocialAccount(
    account,
  );

  return followingIds;
}

async function loadTargetProfile(
  profileId: string,
  account: ProfileSocialAccountScope,
): Promise<ProfileConnectionProfile> {
  const {
    data,
    error,
  } =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "profiles",
          )
          .select(
            PROFILE_COLUMNS,
          )
          .eq(
            "id",
            profileId,
          )
          .maybeSingle(),
    );

  if (error) {
    throw new Error(
      `Canal could not load the profile you selected: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "This Canal profile is unavailable.",
    );
  }

  const profile =
    normalizeProfile(
      data as unknown as
        ProfileRow,
    );

  await assertProfileSocialAccount(
    account,
  );

  return profile;
}

async function writeFollowRelationship(
  account: ProfileSocialAccountScope,
  target: ProfileConnectionProfile,
): Promise<void> {
  const {
    viewerId,
  } =
    account;

  const existingById =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .select(
            "target_user_id, relationship_type",
          )
          .eq(
            "user_id",
            viewerId,
          )
          .eq(
            "target_user_id",
            target.id,
          )
          .limit(
            1,
          )
          .maybeSingle(),
    );

  if (existingById.error) {
    throw new Error(
      `Canal could not read your current follow state: ${existingById.error.message}`,
    );
  }

  if (existingById.data) {
    if (
      existingById.data
        .relationship_type ===
      "blocked"
    ) {
      throw new Error(
        "Unblock this profile before following it.",
      );
    }

    const {
      error,
    } =
      await runProfileSocialQuery(
        account,
        () =>
          supabase
            .from(
              "user_relationships",
            )
            .update({
              target_username:
                target.normalizedHandle,

              relationship_type:
                "following",
            })
            .eq(
              "user_id",
              viewerId,
            )
            .eq(
              "target_user_id",
              target.id,
            ),
      );

    if (error) {
      throw new Error(
        `Canal could not follow this profile: ${error.message}`,
      );
    }

    await assertProfileSocialAccount(
      account,
    );

    return;
  }

  const {
    error,
  } =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .insert({
            user_id:
              viewerId,

            target_user_id:
              target.id,

            target_username:
              target.normalizedHandle,

            relationship_type:
              "following",
          }),
    );

  if (error) {
    throw new Error(
      `Canal could not follow this profile: ${error.message}`,
    );
  }

  await assertProfileSocialAccount(
    account,
  );
}

async function deleteFollowRelationship(
  account: ProfileSocialAccountScope,
  targetProfileId: string,
): Promise<void> {
  const {
    viewerId,
  } =
    account;

  const stableDelete =
    await runProfileSocialQuery(
      account,
      () =>
        supabase
          .from(
            "user_relationships",
          )
          .delete()
          .eq(
            "user_id",
            viewerId,
          )
          .eq(
            "target_user_id",
            targetProfileId,
          )
          .eq(
            "relationship_type",
            "following",
          ),
    );

  if (stableDelete.error) {
    throw new Error(
      `Canal could not unfollow this profile: ${stableDelete.error.message}`,
    );
  }

  await assertProfileSocialAccount(
    account,
  );
}

function normalizeProfile(
  row: ProfileRow,
): ProfileConnectionProfile {
  const normalizedHandle =
    normalizeProfileHandle(
      row.handle ??
      "",
    ) ||
    fallbackHandle(
      row.id,
    );

  return {
    id:
      row.id,

    displayName:
      row.display_name
        ?.trim() ||
      "Canal Listener",

    handle:
      `@${normalizedHandle}`,

    normalizedHandle,

    avatarUrl:
      row.avatar_url
        ?.trim() ||
      null,

    bio:
      row.bio
        ?.trim() ||
      "",

    favoriteActivities:
      row.favorite_activities
        ?.trim() ||
      "",

    isPublic:
      row.is_public !==
      false,

    isVerified:
      row.is_verified ===
      true,

    isCanal:
      row.is_canal ===
      true,
  };
}

function fallbackHandle(
  profileId: string,
): string {
  return (
    "canal_" +
    profileId
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

function normalizeListOptions(
  options: ProfileConnectionListOptions,
): {
  limit: number;
  offset: number;
} {
  return {
    limit:
      clampInteger(
        options.limit,
        1,
        100,
        50,
      ),

    offset:
      clampInteger(
        options.offset,
        0,
        Number.MAX_SAFE_INTEGER,
        0,
      ),
  };
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value,
    )
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.trunc(
        value,
      ),
    ),
  );
}

function requireUuid(
  value: string,
  label: string,
): string {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `A valid Canal ${label} ID is required.`,
    );
  }

  return normalized;
}
