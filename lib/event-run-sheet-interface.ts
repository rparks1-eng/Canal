import type {
  EventRunSheet,
  EventRunSheetStatus,
} from "./event-run-sheets";

export const EVENT_RUN_SHEET_FILTERS = [
  "all",
  "planned",
  "running",
  "completed",
] as const;

export type EventRunSheetFilter =
  (typeof EVENT_RUN_SHEET_FILTERS)[number];

export type EventRunSheetMutationLease =
  Readonly<{
    owner: number;
    commitEpoch: number;
  }>;

export type EventRunSheetMutationLeaseGate =
  Readonly<{
    acquire:
      () =>
        | EventRunSheetMutationLease
        | null;
    canCommit: (
      lease:
        EventRunSheetMutationLease,
    ) => boolean;
    invalidateCommits:
      () => void;
    isBusy:
      () => boolean;
    release: (
      lease:
        EventRunSheetMutationLease,
    ) => boolean;
  }>;

export type EventRunSheetRequestGuardInput =
  Readonly<{
    expectedUserId: string;
    expectedAccountEpoch: number;
    activeUserId:
      | string
      | null;
    activeAccountEpoch: number;
    accountUserId: string;
    accountEpoch: number;
    requestEpoch: number;
    activeRequestEpoch: number;
    expectedRunSheetId?:
      string;
    activeRunSheetId?:
      string;
  }>;

type ErrorShape = {
  kind?: unknown;
};

const PRIVACY_SENSITIVE_ERROR_KINDS =
  new Set([
    "account-changed",
    "not-found",
    "permission-denied",
  ]);

export function eventRunSheetRequestCanCommit(
  input:
    EventRunSheetRequestGuardInput,
): boolean {
  if (
    !input.expectedUserId ||
    !Number.isSafeInteger(
      input.expectedAccountEpoch,
    ) ||
    input.expectedAccountEpoch <
      1 ||
    input.requestEpoch !==
      input.activeRequestEpoch ||
    input.activeUserId !==
      input.accountUserId ||
    input.accountUserId !==
      input.expectedUserId ||
    input.activeAccountEpoch !==
      input.accountEpoch ||
    input.accountEpoch !==
      input.expectedAccountEpoch
  ) {
    return false;
  }

  return (
    input.expectedRunSheetId ===
      undefined ||
    input.activeRunSheetId ===
      input.expectedRunSheetId
  );
}

export function filterEventRunSheets(
  runSheets:
    readonly EventRunSheet[],
  filter:
    EventRunSheetFilter,
): EventRunSheet[] {
  return filter ===
    "all"
    ? [
        ...runSheets,
      ]
    : runSheets.filter(
        (runSheet) =>
          runSheet.status ===
          filter,
      );
}

export function eventRunSheetStatusCopy(
  status:
    EventRunSheetStatus,
): {
  label: string;
  title: string;
  detail: string;
} {
  if (
    status ===
      "planned"
  ) {
    return {
      label:
        "PLANNED",
      title:
        "Ready to review",
      detail:
        "Metadata and source collection stay editable until Start freezes the ordered Scenes.",
    };
  }

  if (
    status ===
      "running"
  ) {
    return {
      label:
        "RUNNING",
      title:
        "Frozen run in progress",
      detail:
        "The ordered Scene identities, revisions, and display details cannot change.",
    };
  }

  return {
    label:
      "COMPLETED",
    title:
      "Retained summary",
    detail:
      "This completed private record and its frozen Scene order are immutable.",
  };
}

export function eventRunSheetMutationIsBlocked(
  input: {
    isLoading: boolean;
    hasFreshSnapshot: boolean;
    isOffline: boolean;
    isBusy: boolean;
  },
): boolean {
  return (
    input.isLoading ||
    !input.hasFreshSnapshot ||
    input.isOffline ||
    input.isBusy
  );
}

export function shouldDiscardEventRunSheetSnapshot(
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

export function createEventRunSheetMutationLeaseGate():
  EventRunSheetMutationLeaseGate {
  let nextOwner =
    0;

  let activeOwner:
    | number
    | null = null;

  let commitEpoch =
    0;

  return {
    acquire: () => {
      if (
        activeOwner !==
        null
      ) {
        return null;
      }

      nextOwner +=
        1;
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
        commitEpoch +=
          1;
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
