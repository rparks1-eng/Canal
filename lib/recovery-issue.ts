export type RecoveryIssueKind =
  | "offline"
  | "canal-session"
  | "spotify-auth"
  | "spotify-permission"
  | "rate-limited"
  | "service";

export type RecoveryAction =
  | "retry"
  | "sign-in"
  | "reconnect-spotify";

export type RecoveryIssue = {
  kind: RecoveryIssueKind;
  title: string;
  message: string;
  action: RecoveryAction;
  actionLabel: string;
  retryAfterMs?: number;
};

type ErrorShape = {
  message?: unknown;
  name?: unknown;
  status?: unknown;
  code?: unknown;
  retryAfterSeconds?: unknown;
  reason?: unknown;
  authorizationInvalid?: unknown;
};

export type RecoveryContext = {
  service?:
    | "canal"
    | "spotify";
  connectivityStatus?:
    | "unknown"
    | "online"
    | "offline";
};

function errorShape(
  error: unknown,
): ErrorShape {
  if (
    error &&
    typeof error ===
      "object"
  ) {
    return error as ErrorShape;
  }

  return {};
}

function errorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  if (
    typeof error ===
    "string"
  ) {
    return error;
  }

  const shape =
    errorShape(
      error,
    );

  if (
    typeof shape.message ===
    "string"
  ) {
    return shape.message;
  }

  return "";
}

function numericValue(
  value: unknown,
): number | undefined {
  const parsed =
    typeof value ===
      "number"
      ? value
      : typeof value ===
          "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : undefined;
}

function formatRetryDelay(
  seconds: number,
): string {
  const units = [
    {
      label: "day",
      seconds: 24 * 60 * 60,
    },
    {
      label: "hour",
      seconds: 60 * 60,
    },
    {
      label: "minute",
      seconds: 60,
    },
    {
      label: "second",
      seconds: 1,
    },
  ] as const;

  const unit =
    units.find(
      (candidate) =>
        seconds >=
        candidate.seconds,
    ) ??
    units[
      units.length -
        1
    ];

  const amount =
    Math.max(
      1,
      Math.ceil(
        seconds /
          unit.seconds,
      ),
    );

  return `${amount} ${unit.label}${amount === 1 ? "" : "s"}`;
}

export function classifyRecoveryIssue(
  error: unknown,
  context: RecoveryContext = {},
): RecoveryIssue {
  const shape =
    errorShape(
      error,
    );

  const message =
    errorMessage(
      error,
    );

  const normalized =
    message.toLowerCase();

  const status =
    numericValue(
      shape.status,
    );

  const retryAfterSeconds =
    numericValue(
      shape.retryAfterSeconds,
    );

  const rateLimitReason =
    typeof shape.reason ===
      "string"
      ? shape.reason
          .trim()
          .toUpperCase()
      : "";

  const isSecureStorageConfigurationError =
    context.service ===
      "spotify" &&
    (
      normalized.includes(
        "required entitlement",
      ) ||
      normalized.includes(
        "errsecmissingentitlement",
      ) ||
      normalized.includes(
        "getvaluewithkeyasync",
      )
    );

  if (
    isSecureStorageConfigurationError
  ) {
    return {
      kind: "service",
      title:
        "Spotify session unavailable",
      message:
        "This Canal build cannot securely read the saved Spotify session. Install the current development build, then reconnect once if needed.",
      action: "retry",
      actionLabel:
        "Check again",
    };
  }

  if (
    context.service ===
      "spotify" &&
    (
      status === 403 ||
      normalized.includes(
        "insufficient scope",
      ) ||
      normalized.includes(
        "permission",
      )
    )
  ) {
    return {
      kind:
        "spotify-permission",
      title:
        "Spotify permission needed",
      message:
        "Reconnect Spotify and approve library and playlist access so Canal can build and export Scenes.",
      action:
        "reconnect-spotify",
      actionLabel:
        "Reconnect Spotify",
    };
  }

  if (
    context.service ===
      "spotify" &&
    (
      status === 401 ||
      shape.authorizationInvalid ===
        true ||
      normalized.includes(
        "authorization expired",
      ) ||
      normalized.includes(
        "connected again",
      ) ||
      normalized.includes(
        "not connected",
      )
    )
  ) {
    return {
      kind:
        "spotify-auth",
      title:
        "Reconnect Spotify",
      message:
        "Your Spotify authorization has expired. Reconnect to keep building and exporting Scenes.",
      action:
        "reconnect-spotify",
      actionLabel:
        "Reconnect Spotify",
    };
  }

  if (
    status === 429 ||
    normalized.includes(
      "rate limit",
    ) ||
    normalized.includes(
      "rate-limiting",
    ) ||
    normalized.includes(
      "too many requests",
    )
  ) {
    return {
      kind:
        "rate-limited",
      title:
        context.service ===
          "spotify"
          ? rateLimitReason ===
              "QUOTA_EXCEEDED"
            ? "Spotify quota reached"
            : "Spotify needs a moment"
          : "Canal needs a moment",
      message:
        retryAfterSeconds !==
          undefined &&
        retryAfterSeconds >
          0
          ? `${
              rateLimitReason ===
                "QUOTA_EXCEEDED"
                ? "Spotify’s app quota is exhausted. "
                : ""
            }Try again in about ${formatRetryDelay(
              retryAfterSeconds,
            )}.`
          : `${
              context.service ===
                "spotify"
                ? "Spotify"
                : "Canal"
            } is temporarily limiting requests. Try again shortly.`,
      action:
        "retry",
      actionLabel:
        "Try again",
      retryAfterMs:
        retryAfterSeconds &&
        retryAfterSeconds >
          0
          ? retryAfterSeconds *
            1000
          : undefined,
    };
  }

  if (
    context.service ===
      "canal" &&
    (
      status === 401 ||
      normalized.includes(
        "sign in",
      ) ||
      normalized.includes(
        "session is missing",
      )
    )
  ) {
    return {
      kind:
        "canal-session",
      title:
        "Sign in required",
      message:
        "Sign in to reconnect this screen to your Canal account.",
      action:
        "sign-in",
      actionLabel:
        "Go to sign in",
    };
  }

  const isOffline =
    context.connectivityStatus ===
      "offline" ||
    (
      status === undefined &&
      (
        normalized.includes(
          "network request failed",
        ) ||
        normalized.includes(
          "failed to fetch",
        ) ||
        normalized.includes(
          "networkerror",
        ) ||
        normalized.includes(
          "load failed",
        ) ||
        normalized.includes(
          "offline",
        )
      )
    );

  if (isOffline) {
    return {
      kind: "offline",
      title:
        "You’re offline",
      message:
        context.service ===
          "spotify"
          ? "Canal will keep saved music available. Reconnect to refresh Spotify."
          : "Your work stays on this device. Reconnect to sync it with Canal.",
      action:
        "retry",
      actionLabel:
        "Check connection",
    };
  }

  return {
    kind: "service",
    title:
      context.service ===
        "spotify"
        ? "Spotify couldn’t sync"
        : "Canal couldn’t refresh",
    message:
      message ||
      "The service is temporarily unavailable.",
    action:
      "retry",
    actionLabel:
      "Try again",
  };
}
