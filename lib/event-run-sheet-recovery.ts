import type {
  ConnectivityStatus,
} from "./connectivity";

import {
  classifyRecoveryIssue,
} from "./recovery-issue";

import type {
  RecoveryIssue,
} from "./recovery-issue";

type ErrorShape = {
  kind?: unknown;
  message?: unknown;
};

export function eventRunSheetRecoveryIssue(
  error: unknown,
  connectivityStatus:
    ConnectivityStatus,
  context:
    | "hub"
    | "plan"
    | "run",
): RecoveryIssue {
  const shape =
    error &&
    typeof error ===
      "object"
      ? error as
          ErrorShape
      : {};

  const kind =
    typeof shape.kind ===
      "string"
      ? shape.kind
      : "";

  const message =
    error instanceof Error
      ? error.message
      : typeof shape.message ===
          "string"
        ? shape.message
        : "";

  if (
    kind ===
      "offline" ||
    connectivityStatus ===
      "offline"
  ) {
    return {
      kind:
        "offline",
      title:
        "Event Run Sheets are offline",
      message:
        "Reconnect to load current private run data. Canal does not queue lifecycle changes while offline.",
      action:
        "retry",
      actionLabel:
        "Check connection",
    };
  }

  if (
    kind ===
      "account-changed"
  ) {
    return {
      kind:
        "canal-session",
      title:
        "Account changed",
      message:
        "Canal discarded the previous account's Event Run Sheet response. Reload for the current account.",
      action:
        "retry",
      actionLabel:
        "Load current account",
    };
  }

  if (
    kind ===
      "conflict"
  ) {
    return {
      kind:
        "service",
      title:
        "Run Sheet changed",
      message:
        message ||
        "Another device updated this Event Run Sheet. Reload its current version before continuing.",
      action:
        "retry",
      actionLabel:
        "Reload current version",
    };
  }

  if (
    kind ===
      "not-found" ||
    kind ===
      "permission-denied"
  ) {
    return {
      kind:
        "service",
      title:
        "Run Sheet unavailable",
      message:
        message ||
        "This private Event Run Sheet is missing or unavailable to the current account.",
      action:
        "retry",
      actionLabel:
        "Check access",
    };
  }

  const defaultMessage =
    context ===
      "hub"
      ? "Canal could not load your private Event Run Sheets."
      : context ===
          "plan"
        ? "Canal could not save this Event Run Sheet plan."
        : "Canal could not update this running Event Run Sheet.";

  return classifyRecoveryIssue(
    message
      ? error
      : new Error(
          defaultMessage,
        ),
    {
      service:
        "canal",
      connectivityStatus,
    },
  );
}
