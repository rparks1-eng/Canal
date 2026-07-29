import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

export const CREATOR_RELEASE_STATUSES = [
  "draft",
  "open",
  "closed",
] as const;

export const CREATOR_RELEASE_CONTRIBUTOR_STATUSES = [
  "pending",
  "accepted",
  "declined",
] as const;

export type CreatorReleaseStatus =
  (typeof CREATOR_RELEASE_STATUSES)[number];

export type CreatorReleaseContributorStatus =
  (typeof CREATOR_RELEASE_CONTRIBUTOR_STATUSES)[number];

export type CreatorReleaseCreditResponse =
  | "accepted"
  | "declined";

export type CreatorReleaseAccount =
  Readonly<{
    userId: string;
  }>;

export type CreatorRelease = {
  id: string;
  ownerId: string;
  collectionId: string;
  title: string;
  description: string;
  status: CreatorReleaseStatus;
  openedAt: string | null;
  closedAt: string | null;
  winnerSceneId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatorReleaseItem = {
  releaseId: string;
  sceneId: string;
  sceneRevision: number;
  position: number;
  title: string;
};

export type CreatorReleaseContributorProfile = {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
};

export type CreatorReleaseContributor = {
  releaseId: string;
  contributorId: string;
  status: CreatorReleaseContributorStatus;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile: CreatorReleaseContributorProfile | null;
};

export type CreatorReleaseResultItem =
  CreatorReleaseItem & {
    voteCount: number;
    isWinner: boolean;
  };

export type CreatorReleaseResults = {
  releaseId: string;
  totalVotes: number;
  winnerSceneId: string | null;
  winnerSceneIds: string[];
  items: CreatorReleaseResultItem[];
};

export type CreatorReleaseDetail =
  CreatorRelease & {
    itemCount: number;
    items: CreatorReleaseItem[];
    contributors: CreatorReleaseContributor[];
    viewerContributorStatus:
      | CreatorReleaseContributorStatus
      | null;
    selectedVoteSceneId: string | null;
    results: CreatorReleaseResults | null;
  };

export type CreateCreatorReleaseInput = {
  collectionId: string;
  title: string;
  description: string;
};

export type CreatorReleaseOptions = {
  account?: CreatorReleaseAccount;
};

export type ListCreatorReleasesOptions =
  CreatorReleaseOptions & {
    limit?: number;
  };

export type CreatorReleaseErrorKind =
  | "account-changed"
  | "blocked"
  | "conflict"
  | "invalid-input"
  | "invalid-response"
  | "not-found"
  | "permission-denied"
  | "request-failed";

export class CreatorReleaseError extends Error {
  readonly kind: CreatorReleaseErrorKind;

  readonly databaseCode: string | null;

  readonly retryable: boolean;

  constructor(
    kind: CreatorReleaseErrorKind,
    message: string,
    databaseCode: string | null = null,
    retryable = false,
  ) {
    super(message);

    this.name = "CreatorReleaseError";
    this.kind = kind;
    this.databaseCode = databaseCode;
    this.retryable = retryable;

    Object.setPrototypeOf(
      this,
      CreatorReleaseError.prototype,
    );
  }
}

export function isCreatorReleaseError(
  error: unknown,
): error is CreatorReleaseError {
  return error instanceof CreatorReleaseError;
}

type CreatorReleaseRow = {
  id: unknown;
  owner_id: unknown;
  collection_id: unknown;
  title: unknown;
  description: unknown;
  status: unknown;
  opened_at: unknown;
  closed_at: unknown;
  winner_scene_id: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type CreatorReleaseItemRow = {
  release_id: unknown;
  owner_id: unknown;
  scene_id: unknown;
  scene_revision: unknown;
  position: unknown;
  scene_title: unknown;
  created_at: unknown;
};

type CreatorReleaseContributorRow = {
  release_id: unknown;
  owner_id: unknown;
  contributor_id: unknown;
  status: unknown;
  public_display_name: unknown;
  public_handle: unknown;
  responded_at: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type CreatorReleaseResultRow = {
  scene_id: unknown;
  scene_revision: unknown;
  position: unknown;
  scene_title: unknown;
  vote_count: unknown;
  is_winner: unknown;
};

type CreatorReleaseProfileRow = {
  id: unknown;
  display_name: unknown;
  handle: unknown;
  avatar_url: unknown;
};

type NormalizedContributor = Omit<
  CreatorReleaseContributor,
  "profile"
> & {
  ownerId: string;
  publicProfile:
    | CreatorReleaseContributorProfile
    | null;
};

type NormalizedResultRow = {
  sceneId: string;
  sceneRevision: number;
  position: number;
  title: string;
  voteCount: number;
  isWinner: boolean;
};

const RELEASE_COLUMNS = [
  "id",
  "owner_id",
  "collection_id",
  "title",
  "description",
  "status",
  "opened_at",
  "closed_at",
  "winner_scene_id",
  "created_at",
  "updated_at",
].join(", ");

const RELEASE_ITEM_COLUMNS = [
  "release_id",
  "owner_id",
  "scene_id",
  "scene_revision",
  "position",
  "scene_title",
  "created_at",
].join(", ");

const RELEASE_CONTRIBUTOR_COLUMNS = [
  "release_id",
  "owner_id",
  "contributor_id",
  "status",
  "public_display_name",
  "public_handle",
  "responded_at",
  "created_at",
  "updated_at",
].join(", ");

const CONTRIBUTOR_PROFILE_COLUMNS = [
  "id",
  "display_name",
  "handle",
  "avatar_url",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HANDLE_PATTERN =
  /^[a-z0-9_]{3,24}$/;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;

const CONNECTIVITY_MESSAGE_PATTERN =
  /\b(?:abort(?:ed)?|connection|fetch|network|offline|socket|timeout|timed out)\b/i;

const BLOCKED_MESSAGE_PATTERN =
  /\b(?:block|blocked|blocking|reciprocal)\b/i;

const DATABASE_CODE_PATTERN =
  /^(?:[0-9A-Z]{5}|PGRST[0-9]{3}|FETCH_ERROR)$/;

const MAX_RELEASE_TITLE_LENGTH = 80;
const MAX_RELEASE_DESCRIPTION_LENGTH = 500;
const MAX_SCENE_ID_LENGTH = 512;
const MAX_SCENE_TITLE_LENGTH = 120;
const MAX_RELEASE_ITEMS = 50;
const MAX_RELEASE_CONTRIBUTORS = 500;
const MAX_RELEASE_RESULTS = 50;
const MAX_RELEASE_LIST_RESULTS = 50;
const MAX_PROFILE_DISPLAY_NAME_LENGTH = 60;
const MAX_AVATAR_URL_LENGTH = 2048;
const PROFILE_QUERY_CHUNK_SIZE = 50;

export async function captureCreatorReleaseAccount(
  expectedUserId?: string,
): Promise<CreatorReleaseAccount> {
  const expected =
    expectedUserId === undefined
      ? null
      : requireUuidInput(
          expectedUserId,
          "expected Release Ballot account",
        );

  const userId = await currentUserId();

  if (
    expected !== null &&
    userId !== expected
  ) {
    throw accountChangedError();
  }

  return {
    userId,
  };
}

export async function listCreatorReleases(
  options: ListCreatorReleasesOptions = {},
): Promise<CreatorRelease[]> {
  const limit = normalizeLimit(options.limit);
  const account = await resolveAccount(options.account);

  const result = await runAccountOperation(
    account,
    "load Release Ballots",
    () =>
      supabase
        .from("creator_releases")
        .select(RELEASE_COLUMNS)
        .order("updated_at", {
          ascending: false,
        })
        .order("id", {
          ascending: true,
        })
        .limit(limit),
  );

  if (result.error) {
    throw mapDatabaseError(
      "load Release Ballots",
      result.error,
    );
  }

  if (
    !Array.isArray(result.data) ||
    result.data.length > limit
  ) {
    throw invalidResponse(
      "Canal returned an invalid Release Ballot list.",
    );
  }

  const releases = result.data.map((row) =>
    normalizeReleaseRow(row),
  );

  rejectDuplicateValues(
    releases.map((release) => release.id),
    "Release Ballot list",
  );

  return releases;
}

export async function loadCreatorRelease(
  releaseId: string,
  options: CreatorReleaseOptions = {},
): Promise<CreatorReleaseDetail> {
  const normalizedReleaseId = requireUuidInput(
    releaseId,
    "Release Ballot",
  );
  const account = await resolveAccount(options.account);

  return loadCreatorReleaseForAccount(
    normalizedReleaseId,
    account,
  );
}

export async function createCreatorRelease(
  input: CreateCreatorReleaseInput,
  options: CreatorReleaseOptions = {},
): Promise<CreatorRelease> {
  const normalizedInput = normalizeCreateInput(input);
  const account = await resolveAccount(options.account);

  const result = await runAccountOperation(
    account,
    "create this Release Ballot",
    () =>
      supabase.rpc(
        "create_creator_release",
        {
          collection_id_value:
            normalizedInput.collectionId,
          title_value:
            normalizedInput.title,
          description_value:
            normalizedInput.description,
          expected_actor_id_value:
            account.userId,
        },
      ),
  );

  if (result.error) {
    throw mapDatabaseError(
      "create this Release Ballot",
      result.error,
    );
  }

  const release = normalizeReleaseRow(
    singleRpcRow(
      result.data,
      "created Release Ballot",
    ),
    {
      expectedOwnerId: account.userId,
    },
  );

  if (release.status !== "draft") {
    throw invalidResponse(
      "Canal returned a Release Ballot in an invalid initial state.",
    );
  }

  return release;
}

export async function openCreatorRelease(
  releaseId: string,
  options: CreatorReleaseOptions = {},
): Promise<CreatorRelease> {
  const normalizedReleaseId = requireUuidInput(
    releaseId,
    "Release Ballot",
  );
  const account = await resolveAccount(options.account);

  const result = await runAccountOperation(
    account,
    "open this Release Ballot",
    () =>
      supabase.rpc(
        "open_creator_release",
        {
          release_id_value:
            normalizedReleaseId,
          expected_actor_id_value:
            account.userId,
        },
      ),
  );

  if (result.error) {
    throw mapDatabaseError(
      "open this Release Ballot",
      result.error,
    );
  }

  const release = normalizeReleaseRow(
    singleRpcRow(
      result.data,
      "opened Release Ballot",
    ),
    {
      expectedId: normalizedReleaseId,
      expectedOwnerId: account.userId,
    },
  );

  if (release.status !== "open") {
    throw invalidResponse(
      "Canal did not return an open Release Ballot.",
    );
  }

  return release;
}

export async function respondCreatorReleaseCredit(
  releaseId: string,
  response: CreatorReleaseCreditResponse,
  options: CreatorReleaseOptions = {},
): Promise<CreatorReleaseContributor> {
  const normalizedReleaseId = requireUuidInput(
    releaseId,
    "Release Ballot",
  );
  const normalizedResponse =
    normalizeCreditResponse(response);
  const account = await resolveAccount(options.account);

  const result = await runAccountOperation(
    account,
    "respond to this contributor credit request",
    () =>
      supabase.rpc(
        "respond_creator_release_credit",
        {
          release_id_value:
            normalizedReleaseId,
          response_value:
            normalizedResponse,
          expected_actor_id_value:
            account.userId,
        },
      ),
  );

  if (result.error) {
    throw mapDatabaseError(
      "respond to this contributor credit request",
      result.error,
    );
  }

  const contributor = normalizeContributorRow(
    singleRpcRow(
      result.data,
      "contributor credit response",
    ),
    normalizedReleaseId,
  );

  if (
    contributor.contributorId !== account.userId ||
    contributor.status !== normalizedResponse
  ) {
    throw invalidResponse(
      "Canal returned an invalid contributor credit response.",
    );
  }

  return {
    releaseId: contributor.releaseId,
    contributorId: contributor.contributorId,
    status: contributor.status,
    respondedAt: contributor.respondedAt,
    createdAt: contributor.createdAt,
    updatedAt: contributor.updatedAt,
    profile:
      contributor.publicProfile,
  };
}

export async function castCreatorReleaseVote(
  releaseId: string,
  sceneId: string,
  options: CreatorReleaseOptions = {},
): Promise<string> {
  const normalizedReleaseId = requireUuidInput(
    releaseId,
    "Release Ballot",
  );
  const normalizedSceneId = requireSceneIdInput(sceneId);
  const account = await resolveAccount(options.account);

  const result = await runAccountOperation(
    account,
    "save this Release Ballot vote",
    () =>
      supabase.rpc(
        "cast_creator_release_vote",
        {
          release_id_value:
            normalizedReleaseId,
          scene_id_value:
            normalizedSceneId,
          expected_actor_id_value:
            account.userId,
        },
      ),
  );

  if (result.error) {
    throw mapDatabaseError(
      "save this Release Ballot vote",
      result.error,
    );
  }

  return normalizeOwnVoteRow(
    result.data,
    normalizedSceneId,
  );
}

export async function closeCreatorRelease(
  releaseId: string,
  options: CreatorReleaseOptions = {},
): Promise<CreatorRelease> {
  const normalizedReleaseId = requireUuidInput(
    releaseId,
    "Release Ballot",
  );
  const account = await resolveAccount(options.account);

  const result = await runAccountOperation(
    account,
    "close this Release Ballot",
    () =>
      supabase.rpc(
        "close_creator_release",
        {
          release_id_value:
            normalizedReleaseId,
          expected_actor_id_value:
            account.userId,
        },
      ),
  );

  if (result.error) {
    throw mapDatabaseError(
      "close this Release Ballot",
      result.error,
    );
  }

  const release = normalizeReleaseRow(
    singleRpcRow(
      result.data,
      "closed Release Ballot",
    ),
    {
      expectedId: normalizedReleaseId,
      expectedOwnerId: account.userId,
    },
  );

  if (release.status !== "closed") {
    throw invalidResponse(
      "Canal did not return a closed Release Ballot.",
    );
  }

  return release;
}

export async function readMyCreatorReleaseVote(
  releaseId: string,
  options: CreatorReleaseOptions = {},
): Promise<string | null> {
  const normalizedReleaseId = requireUuidInput(
    releaseId,
    "Release Ballot",
  );
  const account = await resolveAccount(options.account);

  return readMyCreatorReleaseVoteForAccount(
    normalizedReleaseId,
    account,
  );
}

async function loadCreatorReleaseForAccount(
  releaseId: string,
  account: CreatorReleaseAccount,
): Promise<CreatorReleaseDetail> {
  const release = await loadReleaseRow(
    releaseId,
    account,
  );
  const items = await loadReleaseItems(
    release,
    account,
  );
  const allContributors = await loadReleaseContributors(
    release,
    account,
  );

  const viewerContributor =
    allContributors.find(
      (contributor) =>
        contributor.contributorId === account.userId,
    ) ?? null;

  const visibleContributors =
    release.ownerId === account.userId
      ? allContributors
      : allContributors.filter(
          (contributor) =>
            contributor.status === "accepted" ||
            contributor.contributorId === account.userId,
        );

  const profiles = await loadContributorProfiles(
    visibleContributors.map(
      (contributor) => contributor.contributorId,
    ),
    account,
  );

  const contributors =
    visibleContributors.map(
      (contributor): CreatorReleaseContributor => {
        const hydratedProfile =
          profiles.get(contributor.contributorId) ??
          null;

        return {
          releaseId: contributor.releaseId,
          contributorId: contributor.contributorId,
          status: contributor.status,
          respondedAt: contributor.respondedAt,
          createdAt: contributor.createdAt,
          updatedAt: contributor.updatedAt,
          profile:
            contributor.publicProfile === null
              ? hydratedProfile
              : {
                  ...contributor.publicProfile,
                  avatarUrl:
                    hydratedProfile?.avatarUrl ??
                    null,
                },
        };
      },
    );

  let selectedVoteSceneId: string | null = null;

  if (
    release.status === "open" &&
    release.ownerId !== account.userId
  ) {
    selectedVoteSceneId =
      await readMyCreatorReleaseVoteForAccount(
        release.id,
        account,
      );

    if (
      selectedVoteSceneId !== null &&
      !items.some(
        (item) =>
          item.sceneId === selectedVoteSceneId,
      )
    ) {
      throw invalidResponse(
        "Canal returned a vote outside this Release Ballot.",
      );
    }
  }

  const results =
    release.status === "closed"
      ? await readReleaseResults(
          release,
          items,
          account,
        )
      : null;

  return {
    ...release,
    itemCount: items.length,
    items,
    contributors,
    viewerContributorStatus:
      viewerContributor?.status ??
      null,
    selectedVoteSceneId,
    results,
  };
}

async function loadReleaseRow(
  releaseId: string,
  account: CreatorReleaseAccount,
): Promise<CreatorRelease> {
  const result = await runAccountOperation(
    account,
    "load this Release Ballot",
    () =>
      supabase
        .from("creator_releases")
        .select(RELEASE_COLUMNS)
        .eq("id", releaseId)
        .limit(1)
        .maybeSingle(),
  );

  if (result.error) {
    throw mapDatabaseError(
      "load this Release Ballot",
      result.error,
    );
  }

  if (result.data === null) {
    throw new CreatorReleaseError(
      "not-found",
      "This Release Ballot is unavailable.",
      "P0002",
    );
  }

  return normalizeReleaseRow(
    result.data,
    {
      expectedId: releaseId,
    },
  );
}

async function loadReleaseItems(
  release: CreatorRelease,
  account: CreatorReleaseAccount,
): Promise<CreatorReleaseItem[]> {
  const result = await runAccountOperation(
    account,
    "load the frozen Release Ballot Scenes",
    () =>
      supabase
        .from("creator_release_items")
        .select(RELEASE_ITEM_COLUMNS)
        .eq("release_id", release.id)
        .order("position", {
          ascending: true,
        })
        .limit(MAX_RELEASE_ITEMS),
  );

  if (result.error) {
    throw mapDatabaseError(
      "load the frozen Release Ballot Scenes",
      result.error,
    );
  }

  if (
    !Array.isArray(result.data) ||
    result.data.length > MAX_RELEASE_ITEMS
  ) {
    throw invalidResponse(
      "Canal returned invalid frozen Release Ballot Scenes.",
    );
  }

  const items = result.data.map((row, index) =>
    normalizeItemRow(
      row,
      release,
      index,
    ),
  );

  rejectDuplicateValues(
    items.map((item) => item.sceneId),
    "Release Ballot Scene list",
  );

  if (
    release.status === "draft" &&
    items.length !== 0
  ) {
    throw invalidResponse(
      "Canal returned frozen Scenes for a draft Release Ballot.",
    );
  }

  if (
    release.status !== "draft" &&
    items.length === 0
  ) {
    throw invalidResponse(
      "Canal returned an open or closed Release Ballot without frozen Scenes.",
    );
  }

  if (
    release.winnerSceneId !== null &&
    !items.some(
      (item) =>
        item.sceneId === release.winnerSceneId,
    )
  ) {
    throw invalidResponse(
      "Canal returned a winner outside this Release Ballot.",
    );
  }

  return items;
}

async function loadReleaseContributors(
  release: CreatorRelease,
  account: CreatorReleaseAccount,
): Promise<NormalizedContributor[]> {
  const result = await runAccountOperation(
    account,
    "load Release Ballot contributor credits",
    () =>
      supabase
        .from("creator_release_contributors")
        .select(RELEASE_CONTRIBUTOR_COLUMNS)
        .eq("release_id", release.id)
        .order("created_at", {
          ascending: true,
        })
        .order("contributor_id", {
          ascending: true,
        })
        .limit(MAX_RELEASE_CONTRIBUTORS),
  );

  if (result.error) {
    throw mapDatabaseError(
      "load Release Ballot contributor credits",
      result.error,
    );
  }

  if (
    !Array.isArray(result.data) ||
    result.data.length > MAX_RELEASE_CONTRIBUTORS
  ) {
    throw invalidResponse(
      "Canal returned invalid Release Ballot contributor credits.",
    );
  }

  const contributors = result.data.map((row) =>
    normalizeContributorRow(
      row,
      release.id,
      release.ownerId,
    ),
  );

  rejectDuplicateValues(
    contributors.map(
      (contributor) => contributor.contributorId,
    ),
    "Release Ballot contributor list",
  );

  return contributors;
}

async function loadContributorProfiles(
  contributorIds: readonly string[],
  account: CreatorReleaseAccount,
): Promise<Map<string, CreatorReleaseContributorProfile>> {
  const uniqueContributorIds = [
    ...new Set(contributorIds),
  ];
  const profiles =
    new Map<
      string,
      CreatorReleaseContributorProfile
    >();

  for (
    let offset = 0;
    offset < uniqueContributorIds.length;
    offset += PROFILE_QUERY_CHUNK_SIZE
  ) {
    const ids = uniqueContributorIds.slice(
      offset,
      offset + PROFILE_QUERY_CHUNK_SIZE,
    );

    const result = await runAccountOperation(
      account,
      "load contributor profile displays",
      () =>
        supabase
          .from("profiles")
          .select(CONTRIBUTOR_PROFILE_COLUMNS)
          .in("id", ids)
          .order("id", {
            ascending: true,
          })
          .limit(ids.length),
    );

    if (result.error) {
      if (
        readErrorCode(result.error) === "42501"
      ) {
        continue;
      }

      throw mapDatabaseError(
        "load contributor profile displays",
        result.error,
      );
    }

    if (
      !Array.isArray(result.data) ||
      result.data.length > ids.length
    ) {
      throw invalidResponse(
        "Canal returned invalid contributor profile displays.",
      );
    }

    const requestedIds = new Set(ids);

    for (const row of result.data) {
      const profile =
        normalizeReadableProfile(row);

      if (profile === null) {
        continue;
      }

      if (
        !requestedIds.has(profile.id) ||
        profiles.has(profile.id)
      ) {
        throw invalidResponse(
          "Canal returned an unexpected contributor profile display.",
        );
      }

      profiles.set(profile.id, profile);
    }
  }

  return profiles;
}

async function readMyCreatorReleaseVoteForAccount(
  releaseId: string,
  account: CreatorReleaseAccount,
): Promise<string | null> {
  const result = await runAccountOperation(
    account,
    "load your Release Ballot vote",
    () =>
      supabase.rpc(
        "read_my_creator_release_vote",
        {
          release_id_value:
            releaseId,
          expected_actor_id_value:
            account.userId,
        },
      ),
  );

  if (result.error) {
    throw mapDatabaseError(
      "load your Release Ballot vote",
      result.error,
    );
  }

  if (result.data === null) {
    return null;
  }

  return requireSceneIdResponse(
    result.data,
    "selected Release Ballot Scene",
  );
}

async function readReleaseResults(
  release: CreatorRelease,
  items: readonly CreatorReleaseItem[],
  account: CreatorReleaseAccount,
): Promise<CreatorReleaseResults> {
  if (release.status !== "closed") {
    throw invalidResponse(
      "Release Ballot results are unavailable before closure.",
    );
  }

  const result = await runAccountOperation(
    account,
    "load closed Release Ballot results",
    () =>
      supabase.rpc(
        "read_creator_release_results",
        {
          release_id_value:
            release.id,
          expected_actor_id_value:
            account.userId,
        },
      ),
  );

  if (result.error) {
    throw mapDatabaseError(
      "load closed Release Ballot results",
      result.error,
    );
  }

  if (
    !Array.isArray(result.data) ||
    result.data.length > MAX_RELEASE_RESULTS ||
    result.data.length !== items.length
  ) {
    throw invalidResponse(
      "Canal returned invalid closed Release Ballot results.",
    );
  }

  const normalizedRows = result.data.map(
    (row, index) =>
      normalizeResultRow(
        row,
        items[index],
        index,
      ),
  );

  rejectDuplicateValues(
    normalizedRows.map((row) => row.sceneId),
    "Release Ballot result list",
  );

  let totalVotes = 0;

  for (const row of normalizedRows) {
    totalVotes += row.voteCount;

    if (!Number.isSafeInteger(totalVotes)) {
      throw invalidResponse(
        "Canal returned an invalid Release Ballot vote total.",
      );
    }
  }

  const winners = normalizedRows.filter(
    (row) => row.isWinner,
  );

  if (
    (
      release.winnerSceneId === null &&
      (
        totalVotes !== 0 ||
        winners.length !== 0
      )
    ) ||
    (
      release.winnerSceneId !== null &&
      (
        totalVotes === 0 ||
        winners.length !== 1 ||
        winners[0].sceneId !== release.winnerSceneId
      )
    )
  ) {
    throw invalidResponse(
      "Canal returned inconsistent Release Ballot winner results.",
    );
  }

  if (winners.length === 1) {
    const highestVoteCount = Math.max(
      ...normalizedRows.map((row) => row.voteCount),
    );

    if (winners[0].voteCount !== highestVoteCount) {
      throw invalidResponse(
        "Canal returned an invalid Release Ballot winner.",
      );
    }
  }

  return {
    releaseId: release.id,
    totalVotes,
    winnerSceneId: release.winnerSceneId,
    winnerSceneIds:
      release.winnerSceneId === null
        ? []
        : [release.winnerSceneId],
    items: normalizedRows.map(
      (row): CreatorReleaseResultItem => ({
        releaseId: release.id,
        sceneId: row.sceneId,
        sceneRevision: row.sceneRevision,
        position: row.position,
        title: row.title,
        voteCount: row.voteCount,
        isWinner: row.isWinner,
      }),
    ),
  };
}

function normalizeCreateInput(
  input: CreateCreatorReleaseInput,
): CreateCreatorReleaseInput {
  if (
    typeof input !== "object" ||
    input === null
  ) {
    throw invalidInput(
      "Release Ballot details are invalid.",
    );
  }

  return {
    collectionId: requireUuidInput(
      input.collectionId,
      "public Scene collection",
    ),
    title: normalizeInputText(
      input.title,
      "Release Ballot title",
      1,
      MAX_RELEASE_TITLE_LENGTH,
    ),
    description: normalizeInputText(
      input.description,
      "Release Ballot description",
      0,
      MAX_RELEASE_DESCRIPTION_LENGTH,
    ),
  };
}

function normalizeReleaseRow(
  value: unknown,
  expected: {
    expectedId?: string;
    expectedOwnerId?: string;
  } = {},
): CreatorRelease {
  const row = requireRecord(
    value,
    "Release Ballot",
  ) as CreatorReleaseRow;

  const id = requireUuidResponse(
    row.id,
    "Release Ballot",
  );
  const ownerId = requireUuidResponse(
    row.owner_id,
    "Release Ballot owner",
  );
  const collectionId = requireUuidResponse(
    row.collection_id,
    "Release Ballot collection",
  );
  const title = requireOutputText(
    row.title,
    "Release Ballot title",
    1,
    MAX_RELEASE_TITLE_LENGTH,
  );
  const description = requireOutputText(
    row.description,
    "Release Ballot description",
    0,
    MAX_RELEASE_DESCRIPTION_LENGTH,
  );
  const status = requireReleaseStatus(row.status);
  const openedAt = requireNullableTimestamp(
    row.opened_at,
    "Release Ballot opened",
  );
  const closedAt = requireNullableTimestamp(
    row.closed_at,
    "Release Ballot closed",
  );
  const winnerSceneId =
    row.winner_scene_id === null
      ? null
      : requireSceneIdResponse(
          row.winner_scene_id,
          "Release Ballot winner",
        );
  const createdAt = requireTimestamp(
    row.created_at,
    "Release Ballot created",
  );
  const updatedAt = requireTimestamp(
    row.updated_at,
    "Release Ballot updated",
  );

  if (
    expected.expectedId !== undefined &&
    id !== expected.expectedId
  ) {
    throw invalidResponse(
      "Canal returned a different Release Ballot.",
    );
  }

  if (
    expected.expectedOwnerId !== undefined &&
    ownerId !== expected.expectedOwnerId
  ) {
    throw invalidResponse(
      "Canal returned a cross-account Release Ballot.",
    );
  }

  if (
    (
      status === "draft" &&
      (
        openedAt !== null ||
        closedAt !== null ||
        winnerSceneId !== null
      )
    ) ||
    (
      status === "open" &&
      (
        openedAt === null ||
        closedAt !== null ||
        winnerSceneId !== null
      )
    ) ||
    (
      status === "closed" &&
      (
        openedAt === null ||
        closedAt === null
      )
    )
  ) {
    throw invalidResponse(
      "Canal returned an inconsistent Release Ballot state.",
    );
  }

  if (
    openedAt !== null &&
    closedAt !== null &&
    Date.parse(closedAt) < Date.parse(openedAt)
  ) {
    throw invalidResponse(
      "Canal returned invalid Release Ballot timestamps.",
    );
  }

  return {
    id,
    ownerId,
    collectionId,
    title,
    description,
    status,
    openedAt,
    closedAt,
    winnerSceneId,
    createdAt,
    updatedAt,
  };
}

function normalizeItemRow(
  value: unknown,
  release: CreatorRelease,
  expectedPosition: number,
): CreatorReleaseItem {
  const row = requireRecord(
    value,
    "frozen Release Ballot Scene",
  ) as CreatorReleaseItemRow;

  const releaseId = requireUuidResponse(
    row.release_id,
    "frozen Release Ballot Scene release",
  );
  const ownerId = requireUuidResponse(
    row.owner_id,
    "frozen Release Ballot Scene owner",
  );
  const position = requirePosition(
    row.position,
    MAX_RELEASE_ITEMS,
    "frozen Release Ballot Scene",
  );

  requireTimestamp(
    row.created_at,
    "frozen Release Ballot Scene created",
  );

  if (
    releaseId !== release.id ||
    ownerId !== release.ownerId ||
    position !== expectedPosition
  ) {
    throw invalidResponse(
      "Canal returned an invalid or unordered frozen Release Ballot Scene.",
    );
  }

  return {
    releaseId,
    sceneId: requireSceneIdResponse(
      row.scene_id,
      "frozen Release Ballot Scene",
    ),
    sceneRevision: requireRevision(
      row.scene_revision,
      "frozen Release Ballot Scene",
    ),
    position,
    title: requireOutputText(
      row.scene_title,
      "frozen Release Ballot Scene title",
      1,
      MAX_SCENE_TITLE_LENGTH,
    ),
  };
}

function normalizeContributorRow(
  value: unknown,
  expectedReleaseId: string,
  expectedOwnerId?: string,
): NormalizedContributor {
  const row = requireRecord(
    value,
    "Release Ballot contributor",
  ) as CreatorReleaseContributorRow;

  const releaseId = requireUuidResponse(
    row.release_id,
    "Release Ballot contributor release",
  );
  const ownerId = requireUuidResponse(
    row.owner_id,
    "Release Ballot contributor owner",
  );
  const contributorId = requireUuidResponse(
    row.contributor_id,
    "Release Ballot contributor",
  );
  const status =
    requireContributorStatus(row.status);
  const respondedAt = requireNullableTimestamp(
    row.responded_at,
    "Release Ballot contributor response",
  );
  const createdAt = requireTimestamp(
    row.created_at,
    "Release Ballot contributor created",
  );
  const updatedAt = requireTimestamp(
    row.updated_at,
    "Release Ballot contributor updated",
  );
  const publicProfile =
    normalizeContributorPublicProfile(
      row.public_display_name,
      row.public_handle,
      contributorId,
      status,
    );

  if (
    releaseId !== expectedReleaseId ||
    (
      expectedOwnerId !== undefined &&
      ownerId !== expectedOwnerId
    ) ||
    ownerId === contributorId ||
    (
      status === "pending" &&
      respondedAt !== null
    ) ||
    (
      status !== "pending" &&
      respondedAt === null
    )
  ) {
    throw invalidResponse(
      "Canal returned an invalid Release Ballot contributor credit.",
    );
  }

  return {
    releaseId,
    ownerId,
    contributorId,
    status,
    respondedAt,
    createdAt,
    updatedAt,
    publicProfile,
  };
}

function normalizeContributorPublicProfile(
  displayNameValue: unknown,
  handleValue: unknown,
  contributorId: string,
  status: CreatorReleaseContributorStatus,
): CreatorReleaseContributorProfile | null {
  if (status !== "accepted") {
    if (
      displayNameValue !== null ||
      handleValue !== null
    ) {
      throw invalidResponse(
        "Canal returned public credit snapshots without contributor consent.",
      );
    }

    return null;
  }

  const displayName = requireOutputText(
    displayNameValue,
    "public contributor display name",
    1,
    MAX_PROFILE_DISPLAY_NAME_LENGTH,
  );
  const normalizedHandle =
    typeof handleValue === "string"
      ? handleValue.trim()
      : "";

  if (
    normalizedHandle !== handleValue ||
    !HANDLE_PATTERN.test(normalizedHandle)
  ) {
    throw invalidResponse(
      "Canal returned an invalid public contributor handle.",
    );
  }

  return {
    id: contributorId,
    displayName,
    handle:
      `@${normalizedHandle}`,
    avatarUrl: null,
  };
}

function normalizeOwnVoteRow(
  value: unknown,
  expectedSceneId: string,
): string {
  const valueRecord =
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  const candidate =
    typeof value === "string"
      ? value
      : (
          valueRecord !== null &&
          Object.keys(valueRecord).length === 1 &&
          Object.hasOwn(valueRecord, "scene_id")
        )
        ? valueRecord.scene_id
        : null;
  const sceneId = requireSceneIdResponse(
    candidate,
    "Release Ballot vote Scene",
  );

  if (sceneId !== expectedSceneId) {
    throw invalidResponse(
      "Canal returned an invalid Release Ballot vote.",
    );
  }

  return sceneId;
}

function normalizeResultRow(
  value: unknown,
  expectedItem: CreatorReleaseItem | undefined,
  expectedPosition: number,
): NormalizedResultRow {
  if (expectedItem === undefined) {
    throw invalidResponse(
      "Canal returned an extra Release Ballot result.",
    );
  }

  const row = requireRecord(
    value,
    "Release Ballot result",
  ) as CreatorReleaseResultRow;

  const sceneId = requireSceneIdResponse(
    row.scene_id,
    "Release Ballot result Scene",
  );
  const sceneRevision = requireRevision(
    row.scene_revision,
    "Release Ballot result Scene",
  );
  const position = requirePosition(
    row.position,
    MAX_RELEASE_RESULTS,
    "Release Ballot result",
  );
  const title = requireOutputText(
    row.scene_title,
    "Release Ballot result Scene title",
    1,
    MAX_SCENE_TITLE_LENGTH,
  );

  if (
    !Number.isSafeInteger(row.vote_count) ||
    (row.vote_count as number) < 0 ||
    typeof row.is_winner !== "boolean" ||
    position !== expectedPosition ||
    sceneId !== expectedItem.sceneId ||
    sceneRevision !== expectedItem.sceneRevision ||
    title !== expectedItem.title
  ) {
    throw invalidResponse(
      "Canal returned a result that does not match the frozen Release Ballot.",
    );
  }

  return {
    sceneId,
    sceneRevision,
    position,
    title,
    voteCount: row.vote_count as number,
    isWinner: row.is_winner,
  };
}

function normalizeReadableProfile(
  value: unknown,
): CreatorReleaseContributorProfile | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const row = value as CreatorReleaseProfileRow;
  const id = optionalUuidResponse(row.id);

  if (id === null) {
    return null;
  }

  const normalizedHandle =
    typeof row.handle === "string"
      ? row.handle.trim().toLowerCase()
      : "";

  if (!HANDLE_PATTERN.test(normalizedHandle)) {
    return null;
  }

  const displayName =
    optionalOutputText(
      row.display_name,
      1,
      MAX_PROFILE_DISPLAY_NAME_LENGTH,
    ) ?? `@${normalizedHandle}`;

  return {
    id,
    displayName,
    handle:
      `@${normalizedHandle}`,
    avatarUrl: normalizeAvatarUrl(row.avatar_url),
  };
}

function normalizeAvatarUrl(
  value: unknown,
): string | null {
  if (value === null || value === "") {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > MAX_AVATAR_URL_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(value);

    return (
      parsed.protocol === "https:" ||
      parsed.protocol === "http:"
    )
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeCreditResponse(
  value: unknown,
): CreatorReleaseCreditResponse {
  if (
    value !== "accepted" &&
    value !== "declined"
  ) {
    throw invalidInput(
      "Choose whether to accept or decline contributor credit.",
    );
  }

  return value;
}

function requireReleaseStatus(
  value: unknown,
): CreatorReleaseStatus {
  if (
    value !== "draft" &&
    value !== "open" &&
    value !== "closed"
  ) {
    throw invalidResponse(
      "Canal returned an invalid Release Ballot status.",
    );
  }

  return value;
}

function requireContributorStatus(
  value: unknown,
): CreatorReleaseContributorStatus {
  if (
    value !== "pending" &&
    value !== "accepted" &&
    value !== "declined"
  ) {
    throw invalidResponse(
      "Canal returned an invalid contributor credit status.",
    );
  }

  return value;
}

function normalizeInputText(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw invalidInput(
      `${label} must be text.`,
    );
  }

  const normalized = value.trim();

  if (
    Array.from(normalized).length < minimumLength ||
    Array.from(normalized).length > maximumLength ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw invalidInput(
      `${label} must be between ${minimumLength} and ${maximumLength} characters without control characters.`,
    );
  }

  return normalized;
}

function requireOutputText(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
): string {
  const normalized = optionalOutputText(
    value,
    minimumLength,
    maximumLength,
  );

  if (normalized === null) {
    throw invalidResponse(
      `Canal returned an invalid ${label}.`,
    );
  }

  return normalized;
}

function optionalOutputText(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  const length = Array.from(normalized).length;

  return (
    length >= minimumLength &&
    length <= maximumLength &&
    !CONTROL_CHARACTER_PATTERN.test(normalized)
  )
    ? normalized
    : null;
}

function requireSceneIdInput(
  value: unknown,
): string {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    normalized.length === 0 ||
    Array.from(normalized).length > MAX_SCENE_ID_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw invalidInput(
      "Release Ballot Scene ID is invalid.",
    );
  }

  return normalized;
}

function requireSceneIdResponse(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string") {
    throw invalidResponse(
      `Canal returned an invalid ${label}.`,
    );
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    Array.from(normalized).length > MAX_SCENE_ID_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw invalidResponse(
      `Canal returned an invalid ${label}.`,
    );
  }

  return normalized;
}

function requireUuidInput(
  value: unknown,
  label: string,
): string {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!UUID_PATTERN.test(normalized)) {
    throw invalidInput(
      `${label} ID is invalid.`,
    );
  }

  return normalized;
}

function requireUuidResponse(
  value: unknown,
  label: string,
): string {
  const normalized = optionalUuidResponse(value);

  if (normalized === null) {
    throw invalidResponse(
      `Canal returned an invalid ${label} ID.`,
    );
  }

  return normalized;
}

function optionalUuidResponse(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return UUID_PATTERN.test(normalized)
    ? normalized
    : null;
}

function requireRevision(
  value: unknown,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1
  ) {
    throw invalidResponse(
      `Canal returned an invalid ${label} revision.`,
    );
  }

  return value as number;
}

function requirePosition(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) >= maximum
  ) {
    throw invalidResponse(
      `Canal returned an invalid ${label} position.`,
    );
  }

  return value as number;
}

function requireTimestamp(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw invalidResponse(
      `Canal returned an invalid ${label} timestamp.`,
    );
  }

  return value;
}

function requireNullableTimestamp(
  value: unknown,
  label: string,
): string | null {
  return value === null
    ? null
    : requireTimestamp(value, label);
}

function normalizeLimit(
  value: number | undefined,
): number {
  if (value === undefined) {
    return MAX_RELEASE_LIST_RESULTS;
  }

  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_RELEASE_LIST_RESULTS
  ) {
    throw invalidInput(
      `Release Ballot list limit must be between 1 and ${MAX_RELEASE_LIST_RESULTS}.`,
    );
  }

  return value;
}

function rejectDuplicateValues(
  values: readonly string[],
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    throw invalidResponse(
      `Canal returned duplicate values in the ${label}.`,
    );
  }
}

function singleRpcRow(
  value: unknown,
  label: string,
): Record<string, unknown> {
  const candidate =
    Array.isArray(value)
      ? value.length === 1
        ? value[0]
        : null
      : value;

  return requireRecord(candidate, label);
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw invalidResponse(
      `Canal returned an invalid ${label}.`,
    );
  }

  return value as Record<string, unknown>;
}

async function resolveAccount(
  account: CreatorReleaseAccount | undefined,
): Promise<CreatorReleaseAccount> {
  if (account === undefined) {
    return captureCreatorReleaseAccount();
  }

  const resolved = {
    userId: requireUuidInput(
      account.userId,
      "Release Ballot account",
    ),
  };

  await assertAccount(resolved);

  return resolved;
}

async function runAccountOperation<Result>(
  account: CreatorReleaseAccount,
  action: string,
  operation: () => PromiseLike<Result>,
): Promise<Result> {
  await assertAccount(account);

  let result: Result;

  try {
    result = await operation();
  } catch (error) {
    await assertAccount(account);
    throw mapDatabaseError(action, error);
  }

  await assertAccount(account);

  return result;
}

async function currentUserId(): Promise<string> {
  let response:
    Awaited<
      ReturnType<
        typeof supabase.auth.getUser
      >
    >;

  try {
    requireSupabaseConfiguration();
    response = await supabase.auth.getUser();
  } catch (error) {
    throw mapDatabaseError(
      "verify the current Release Ballot account",
      error,
    );
  }

  if (response.error) {
    throw mapDatabaseError(
      "verify the current Release Ballot account",
      response.error,
    );
  }

  if (!response.data.user) {
    throw new CreatorReleaseError(
      "permission-denied",
      "You must be signed into Canal to use Release Ballots.",
      "42501",
    );
  }

  return requireUuidInput(
    response.data.user.id,
    "signed-in user",
  );
}

async function assertAccount(
  account: CreatorReleaseAccount,
): Promise<void> {
  const actualUserId = await currentUserId();

  if (actualUserId !== account.userId) {
    throw accountChangedError();
  }
}

function mapDatabaseError(
  action: string,
  error: unknown,
): CreatorReleaseError {
  if (error instanceof CreatorReleaseError) {
    return error;
  }

  const code = readErrorCode(error);

  if (code === "22023") {
    return new CreatorReleaseError(
      "invalid-input",
      `Canal rejected invalid data while trying to ${action}.`,
      code,
    );
  }

  if (code === "42501") {
    if (isBlockedError(error)) {
      return new CreatorReleaseError(
        "blocked",
        "This Release Ballot is unavailable because one of the involved Canal accounts is blocked.",
        code,
      );
    }

    return new CreatorReleaseError(
      "permission-denied",
      `Canal does not have permission to ${action}.`,
      code,
    );
  }

  if (code === "P0002") {
    return new CreatorReleaseError(
      "not-found",
      "This Release Ballot is unavailable.",
      code,
    );
  }

  if (code === "40001") {
    return new CreatorReleaseError(
      "conflict",
      "This Release Ballot changed. Reload it before trying again.",
      code,
    );
  }

  const retryable = isConnectivityError(error);

  return new CreatorReleaseError(
    "request-failed",
    retryable
      ? `Canal could not ${action} because the network request failed. Check your connection and try again.`
      : `Canal could not ${action}. Please try again.`,
    code,
    retryable,
  );
}

function readErrorCode(
  error: unknown,
): string | null {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return null;
  }

  const code = (error as {
    code?: unknown;
  }).code;

  return (
    typeof code === "string" &&
    DATABASE_CODE_PATTERN.test(code)
  )
    ? code
    : null;
}

function errorSearchText(
  error: unknown,
): string {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return typeof error === "string"
      ? error.slice(0, 500)
      : "";
  }

  const record = error as Record<string, unknown>;

  return [
    record.name,
    record.message,
    record.details,
    record.hint,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string",
    )
    .join(" ")
    .slice(0, 1000);
}

function isBlockedError(
  error: unknown,
): boolean {
  return BLOCKED_MESSAGE_PATTERN.test(
    errorSearchText(error),
  );
}

function isConnectivityError(
  error: unknown,
): boolean {
  const code = readErrorCode(error);

  return (
    code === null ||
    code === "PGRST000" ||
    code === "FETCH_ERROR" ||
    code.startsWith("08") ||
    CONNECTIVITY_MESSAGE_PATTERN.test(
      errorSearchText(error),
    )
  );
}

function invalidInput(
  message: string,
): CreatorReleaseError {
  return new CreatorReleaseError(
    "invalid-input",
    message,
    "22023",
  );
}

function invalidResponse(
  message: string,
): CreatorReleaseError {
  return new CreatorReleaseError(
    "invalid-response",
    message,
  );
}

function accountChangedError(): CreatorReleaseError {
  return new CreatorReleaseError(
    "account-changed",
    "The signed-in Canal account changed while the Release Ballot request was in progress. Reload and try again.",
  );
}
