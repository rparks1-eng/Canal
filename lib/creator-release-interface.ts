import type {
  CreatorRelease,
  CreatorReleaseContributorStatus,
  CreatorReleaseDetail,
  CreatorReleaseResultItem,
  CreatorReleaseStatus,
} from "./creator-releases";

export const CREATOR_RELEASE_BROWSE_FILTERS = [
  "all",
  "open",
  "closed",
] as const;

export type CreatorReleaseBrowseFilter =
  (typeof CREATOR_RELEASE_BROWSE_FILTERS)[number];

export type CreatorReleaseViewerRole =
  | "owner"
  | "contributor"
  | "listener";

export type CreatorReleaseMutationLease =
  Readonly<{
    owner: number;
    commitEpoch: number;
  }>;

export type CreatorReleaseMutationLeaseGate =
  Readonly<{
    acquire:
      () =>
        | CreatorReleaseMutationLease
        | null;
    canCommit: (
      lease:
        CreatorReleaseMutationLease,
    ) => boolean;
    invalidateCommits:
      () => void;
    isBusy:
      () => boolean;
    release: (
      lease:
        CreatorReleaseMutationLease,
    ) => boolean;
  }>;

type ErrorShape = {
  kind?: unknown;
};

export type CreatorReleaseRequestGuardInput =
  Readonly<{
    expectedUserId:
      string;
    activeUserId:
      string | null;
    accountUserId:
      string;
    requestEpoch:
      number;
    activeRequestEpoch:
      number;
    expectedReleaseId?:
      string;
    activeReleaseId?:
      string;
  }>;

const PRIVACY_SENSITIVE_ERROR_KINDS =
  new Set([
    "account-changed",
    "blocked",
    "not-found",
    "permission-denied",
  ]);

export function creatorReleaseRequestCanCommit(
  input:
    CreatorReleaseRequestGuardInput,
): boolean {
  if (
    !input.expectedUserId ||
    input.requestEpoch !==
      input.activeRequestEpoch ||
    input.activeUserId !==
      input.accountUserId ||
    input.accountUserId !==
      input.expectedUserId
  ) {
    return false;
  }

  if (
    input.expectedReleaseId !==
      undefined &&
    input.activeReleaseId !==
      input.expectedReleaseId
  ) {
    return false;
  }

  return true;
}

export function filterCreatorReleases(
  releases:
    readonly CreatorRelease[],
  filter:
    CreatorReleaseBrowseFilter,
): CreatorRelease[] {
  if (filter === "all") {
    return [...releases];
  }

  return releases.filter(
    (release) =>
      release.status ===
      filter,
  );
}

export function creatorReleaseViewerRole(
  release:
    CreatorReleaseDetail,
  viewerId: string,
): CreatorReleaseViewerRole {
  if (
    release.ownerId ===
    viewerId
  ) {
    return "owner";
  }

  return release.viewerContributorStatus ===
    null
    ? "listener"
    : "contributor";
}

export function creatorReleaseRoleCopy(
  role:
    CreatorReleaseViewerRole,
  status:
    CreatorReleaseStatus,
): {
  label: string;
  title: string;
  detail: string;
} {
  if (role === "owner") {
    if (status === "draft") {
      return {
        label: "OWNER",
        title:
          "You control this release.",
        detail:
          "Review the collection, then open voting when the frozen lineup is ready.",
      };
    }

    if (status === "open") {
      return {
        label: "OWNER",
        title:
          "You control when voting closes.",
        detail:
          "Listener choices and totals remain sealed until you close the ballot.",
      };
    }

    return {
      label: "OWNER",
      title:
        "This release is final.",
      detail:
        "Voting and contributor responses are closed. Only aggregate results are visible.",
    };
  }

  if (
    role ===
    "contributor"
  ) {
    return {
      label:
        "ELIGIBLE CONTRIBUTOR",
      title:
        status === "open"
          ? "You can choose public credit and vote."
          : "Your contributor response is final.",
      detail:
        status === "open"
          ? "Credit consent and your private favorite are separate choices."
          : "Public credit shows only when accepted. Individual votes are never identified.",
    };
  }

  return {
    label: "LISTENER",
    title:
      status === "open"
        ? "You can choose one private favorite."
        : status ===
            "closed"
          ? "You can view final totals."
          : "Voting has not opened.",
    detail:
      status === "open"
        ? "Change your favorite any time before the owner closes voting."
        : "Canal never displays who voted for a Scene.",
  };
}

export function contributorConsentLabel(
  status:
    CreatorReleaseContributorStatus,
): string {
  if (
    status ===
    "accepted"
  ) {
    return "Credit accepted";
  }

  if (
    status ===
    "declined"
  ) {
    return "Credit declined";
  }

  return "Response needed";
}

export function creatorReleaseVoteCopy(
  selectedSceneId:
    string | null,
  sceneId: string,
): {
  selected: boolean;
  label: string;
  hint: string;
} {
  const selected =
    selectedSceneId ===
    sceneId;

  if (selected) {
    return {
      selected: true,
      label: "Your favorite",
      hint:
        "This is your saved favorite Scene",
    };
  }

  if (selectedSceneId) {
    return {
      selected: false,
      label: "Change vote",
      hint:
        "Changes your favorite to this Scene",
    };
  }

  return {
    selected: false,
    label: "Choose",
    hint:
      "Selects this Scene as your favorite",
  };
}

export function rankCreatorReleaseResults(
  items:
    readonly CreatorReleaseResultItem[],
): CreatorReleaseResultItem[] {
  return [...items].sort(
    (
      first,
      second,
    ) =>
      second.voteCount -
        first.voteCount ||
      first.position -
        second.position ||
      first.sceneId.localeCompare(
        second.sceneId,
      ),
  );
}

export function creatorReleaseVotePercent(
  voteCount: number,
  totalVotes: number,
): number {
  if (
    totalVotes <= 0 ||
    voteCount <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.round(
      (
        voteCount /
        totalVotes
      ) *
        100,
    ),
  );
}

export function shouldDiscardCreatorReleaseSnapshot(
  error: unknown,
): boolean {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return false;
  }

  const {
    kind,
  } =
    error as ErrorShape;

  return (
    typeof kind ===
      "string" &&
    PRIVACY_SENSITIVE_ERROR_KINDS.has(
      kind,
    )
  );
}

export function createCreatorReleaseMutationLeaseGate():
  CreatorReleaseMutationLeaseGate {
  let nextOwner = 0;

  let activeOwner:
    | number
    | null = null;

  let commitEpoch = 0;

  return {
    acquire: () => {
      if (
        activeOwner !==
        null
      ) {
        return null;
      }

      nextOwner += 1;
      activeOwner =
        nextOwner;

      return {
        owner:
          nextOwner,
        commitEpoch,
      };
    },

    canCommit: (
      lease,
    ) =>
      activeOwner ===
        lease.owner &&
      commitEpoch ===
        lease.commitEpoch,

    invalidateCommits:
      () => {
        commitEpoch += 1;
      },

    isBusy: () =>
      activeOwner !==
      null,

    release: (
      lease,
    ) => {
      if (
        activeOwner !==
        lease.owner
      ) {
        return false;
      }

      activeOwner =
        null;

      return true;
    },
  };
}
