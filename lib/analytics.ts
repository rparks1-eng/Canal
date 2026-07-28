import AsyncStorage from "@react-native-async-storage/async-storage";

import * as Crypto from "expo-crypto";

import {
  Platform,
} from "react-native";

import {
  STORAGE_KEYS,
} from "./storage-keys";

import {
  isSupabaseConfigured,
  supabase,
} from "./supabase";

export type AnalyticsSuccessEventName =
  | "onboarding_completed"
  | "first_scene_created"
  | "scene_export_completed"
  | "snapshot_published"
  | "seven_day_return";

export type AnalyticsFailurePoint =
  | "sign_up"
  | "sign_in"
  | "social_sign_in"
  | "auth_callback"
  | "password_reset_request"
  | "password_reset_verify"
  | "password_reset_update"
  | "session_restore"
  | "onboarding_complete"
  | "scene_create"
  | "scene_export"
  | "snapshot_publish";

export type AnalyticsFailureClass =
  | "offline"
  | "authentication"
  | "permission"
  | "rate_limited"
  | "validation"
  | "configuration"
  | "service"
  | "storage"
  | "unknown";

export type AnalyticsAttempt =
  | "initial"
  | "retry";

export type AnalyticsEventInput =
  | {
      name:
        AnalyticsSuccessEventName;
      attempt?:
        AnalyticsAttempt;
    }
  | {
      name:
        "workflow_failed";
      failurePoint:
        AnalyticsFailurePoint;
      failureClass:
        AnalyticsFailureClass;
      attempt?:
        AnalyticsAttempt;
    };

export type AnalyticsControlState = {
  enabled: boolean;
  queuedEventCount: number;
  pendingCloudDeletion: boolean;
};

export type AnalyticsConsentResult =
  AnalyticsControlState & {
    cloudDeleted: boolean;
    message: string;
  };

export type AnalyticsTrackResult = {
  accepted: boolean;
  delivered: boolean;
  reason:
    | "delivered"
    | "queued"
    | "disabled"
    | "invalid"
    | "unavailable"
    | "account_changed";
};

type AnalyticsPlatform =
  | "ios"
  | "android"
  | "web";

type QueuedAnalyticsEvent = {
  schemaVersion: 1;
  eventId: string;
  userId: string;
  name:
    | AnalyticsSuccessEventName
    | "workflow_failed";
  failurePoint:
    | AnalyticsFailurePoint
    | null;
  failureClass:
    | AnalyticsFailureClass
    | null;
  attempt:
    AnalyticsAttempt;
  platform:
    AnalyticsPlatform;
  occurredAt: string;
};

type AnalyticsAccount = {
  userId: string;
  authGeneration: number;
};

const SUCCESS_EVENT_NAMES =
  new Set<AnalyticsSuccessEventName>([
    "onboarding_completed",
    "first_scene_created",
    "scene_export_completed",
    "snapshot_published",
    "seven_day_return",
  ]);

const FAILURE_POINTS =
  new Set<AnalyticsFailurePoint>([
    "sign_up",
    "sign_in",
    "social_sign_in",
    "auth_callback",
    "password_reset_request",
    "password_reset_verify",
    "password_reset_update",
    "session_restore",
    "onboarding_complete",
    "scene_create",
    "scene_export",
    "snapshot_publish",
  ]);

const FAILURE_CLASSES =
  new Set<AnalyticsFailureClass>([
    "offline",
    "authentication",
    "permission",
    "rate_limited",
    "validation",
    "configuration",
    "service",
    "storage",
    "unknown",
  ]);

const ATTEMPTS =
  new Set<AnalyticsAttempt>([
    "initial",
    "retry",
  ]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_QUEUED_EVENTS_PER_USER =
  100;

const QUEUE_RETENTION_MS =
  7 * 24 * 60 * 60 * 1000;

const SEVEN_DAY_START_MS =
  7 * 24 * 60 * 60 * 1000;

const SEVEN_DAY_END_MS =
  8 * 24 * 60 * 60 * 1000;

const CONSENT_KEY_PREFIX =
  "@canal/analytics/v1/consent/";

const DELETE_PENDING_KEY_PREFIX =
  "@canal/analytics/v1/delete-pending/";

let authGeneration =
  0;

let observedUserId:
  string | null =
    null;

let authListenerInstalled =
  false;

let operationTail:
  Promise<void> =
    Promise.resolve();

const consentGenerations =
  new Map<
    string,
    number
  >();

function consentKey(
  userId: string,
): string {
  return (
    CONSENT_KEY_PREFIX +
    userId
  );
}

function deletePendingKey(
  userId: string,
): string {
  return (
    DELETE_PENDING_KEY_PREFIX +
    userId
  );
}

function normalizePlatform(): AnalyticsPlatform {
  if (
    Platform.OS ===
    "ios"
  ) {
    return "ios";
  }

  if (
    Platform.OS ===
    "android"
  ) {
    return "android";
  }

  return "web";
}

function ensureAuthListener(): void {
  if (
    authListenerInstalled
  ) {
    return;
  }

  authListenerInstalled =
    true;

  supabase.auth.onAuthStateChange(
    (
      _event,
      session,
    ) => {
      authGeneration +=
        1;

      observedUserId =
        session?.user.id ??
        null;
    },
  );
}

function serializeAnalyticsOperation<
  Result,
>(
  operation:
    () => Promise<Result>,
): Promise<Result> {
  const result =
    operationTail.then(
      operation,
      operation,
    );

  operationTail =
    result.then(
      () => undefined,
      () => undefined,
    );

  return result;
}

function currentConsentGeneration(
  userId: string,
): number {
  return (
    consentGenerations.get(
      userId,
    ) ??
    0
  );
}

function invalidateConsentOperations(
  userId: string,
): number {
  const nextGeneration =
    currentConsentGeneration(
      userId,
    ) +
    1;

  consentGenerations.set(
    userId,
    nextGeneration,
  );

  return nextGeneration;
}

async function captureAnalyticsAccount(): Promise<AnalyticsAccount> {
  ensureAuthListener();

  const {
    data,
    error,
  } =
    await supabase.auth.getSession();

  const userId =
    data.session?.user.id ??
    "";

  if (
    error ||
    !UUID_PATTERN.test(
      userId,
    )
  ) {
    throw new Error(
      "A signed-in Canal account is required for analytics.",
    );
  }

  if (
    observedUserId ===
    null
  ) {
    observedUserId =
      userId;
  } else if (
    observedUserId !==
    userId
  ) {
    authGeneration +=
      1;

    observedUserId =
      userId;
  }

  return {
    userId,
    authGeneration,
  };
}

async function assertAnalyticsAccount(
  account: AnalyticsAccount,
): Promise<void> {
  const {
    data,
    error,
  } =
    await supabase.auth.getSession();

  if (
    error ||
    data.session?.user.id !==
      account.userId ||
    observedUserId !==
      account.userId ||
    authGeneration !==
      account.authGeneration
  ) {
    throw new Error(
      "The signed-in Canal account changed during analytics work.",
    );
  }
}

function hasExactKeys(
  value:
    Record<string, unknown>,
  expected:
    string[],
): boolean {
  const actualKeys =
    Object.keys(
      value,
    ).sort();

  const expectedKeys =
    [...expected].sort();

  return (
    actualKeys.length ===
      expectedKeys.length &&
    actualKeys.every(
      (
        key,
        index,
      ) =>
        key ===
        expectedKeys[index],
    )
  );
}

export function normalizeAnalyticsEventInput(
  value: unknown,
): AnalyticsEventInput | null {
  if (
    typeof value !==
      "object" ||
    value === null ||
    Array.isArray(
      value,
    )
  ) {
    return null;
  }

  const record =
    value as
      Record<string, unknown>;

  const attempt =
    record.attempt ===
    undefined
      ? "initial"
      : record.attempt;

  if (
    !ATTEMPTS.has(
      attempt as
        AnalyticsAttempt,
    )
  ) {
    return null;
  }

  if (
    SUCCESS_EVENT_NAMES.has(
      record.name as
        AnalyticsSuccessEventName,
    )
  ) {
    const expectedKeys =
      record.attempt ===
      undefined
        ? [
            "name",
          ]
        : [
            "attempt",
            "name",
          ];

    if (
      !hasExactKeys(
        record,
        expectedKeys,
      )
    ) {
      return null;
    }

    return {
      name:
        record.name as
          AnalyticsSuccessEventName,

      attempt:
        attempt as
          AnalyticsAttempt,
    };
  }

  if (
    record.name !==
      "workflow_failed" ||
    !FAILURE_POINTS.has(
      record.failurePoint as
        AnalyticsFailurePoint,
    ) ||
    !FAILURE_CLASSES.has(
      record.failureClass as
        AnalyticsFailureClass,
    )
  ) {
    return null;
  }

  const expectedKeys =
    record.attempt ===
    undefined
      ? [
          "failureClass",
          "failurePoint",
          "name",
        ]
      : [
          "attempt",
          "failureClass",
          "failurePoint",
          "name",
        ];

  if (
    !hasExactKeys(
      record,
      expectedKeys,
    )
  ) {
    return null;
  }

  return {
    name:
      "workflow_failed",

    failurePoint:
      record.failurePoint as
        AnalyticsFailurePoint,

    failureClass:
      record.failureClass as
        AnalyticsFailureClass,

    attempt:
      attempt as
        AnalyticsAttempt,
  };
}

function normalizeQueuedEvent(
  value: unknown,
  now:
    number,
): QueuedAnalyticsEvent | null {
  if (
    typeof value !==
      "object" ||
    value === null ||
    Array.isArray(
      value,
    )
  ) {
    return null;
  }

  const record =
    value as
      Record<string, unknown>;

  const normalizedInput =
    normalizeAnalyticsEventInput(
      record.name ===
        "workflow_failed"
        ? {
            name:
              record.name,
            failurePoint:
              record.failurePoint,
            failureClass:
              record.failureClass,
            attempt:
              record.attempt,
          }
        : {
            name:
              record.name,
            attempt:
              record.attempt,
          },
    );

  const occurredAt =
    typeof record.occurredAt ===
      "string"
      ? Date.parse(
          record.occurredAt,
        )
      : Number.NaN;

  if (
    record.schemaVersion !==
      1 ||
    typeof record.eventId !==
      "string" ||
    !UUID_PATTERN.test(
      record.eventId,
    ) ||
    typeof record.userId !==
      "string" ||
    !UUID_PATTERN.test(
      record.userId,
    ) ||
    (
      record.platform !==
        "ios" &&
      record.platform !==
        "android" &&
      record.platform !==
        "web"
    ) ||
    !Number.isFinite(
      occurredAt,
    ) ||
    occurredAt <
      now -
        QUEUE_RETENTION_MS ||
    occurredAt >
      now +
        5 * 60 * 1000 ||
    !normalizedInput
  ) {
    return null;
  }

  return {
    schemaVersion:
      1,
    eventId:
      record.eventId,
    userId:
      record.userId,
    name:
      normalizedInput.name,
    failurePoint:
      normalizedInput.name ===
      "workflow_failed"
        ? normalizedInput.failurePoint
        : null,
    failureClass:
      normalizedInput.name ===
      "workflow_failed"
        ? normalizedInput.failureClass
        : null,
    attempt:
      normalizedInput.attempt ??
      "initial",
    platform:
      record.platform,
    occurredAt:
      new Date(
        occurredAt,
      ).toISOString(),
  };
}

async function readQueue(
  now =
    Date.now(),
): Promise<QueuedAnalyticsEvent[]> {
  const storedValue =
    await AsyncStorage.getItem(
      STORAGE_KEYS.analyticsQueue,
    );

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue:
      unknown =
        JSON.parse(
          storedValue,
        );

    if (
      !Array.isArray(
        parsedValue,
      )
    ) {
      return [];
    }

    return parsedValue
      .map(
        (item) =>
          normalizeQueuedEvent(
            item,
            now,
          ),
      )
      .filter(
        (
          item,
        ): item is
          QueuedAnalyticsEvent =>
          item !== null,
      );
  } catch {
    return [];
  }
}

async function writeQueue(
  queue:
    QueuedAnalyticsEvent[],
): Promise<void> {
  if (
    queue.length ===
    0
  ) {
    await AsyncStorage.removeItem(
      STORAGE_KEYS.analyticsQueue,
    );

    return;
  }

  await AsyncStorage.setItem(
    STORAGE_KEYS.analyticsQueue,
    JSON.stringify(
      queue,
    ),
  );
}

async function readConsent(
  userId: string,
): Promise<boolean> {
  return (
    await AsyncStorage.getItem(
      consentKey(
        userId,
      ),
    )
  ) ===
    "enabled";
}

async function isCloudDeletionPending(
  userId: string,
): Promise<boolean> {
  return (
    await AsyncStorage.getItem(
      deletePendingKey(
        userId,
      ),
    )
  ) ===
    "pending";
}

async function removeQueuedEventsForUser(
  userId: string,
): Promise<void> {
  const queue =
    await readQueue();

  await writeQueue(
    queue.filter(
      (event) =>
        event.userId !==
        userId,
    ),
  );
}

async function deleteCloudEvents(
  account:
    AnalyticsAccount,
): Promise<boolean> {
  if (
    !isSupabaseConfigured
  ) {
    return true;
  }

  await assertAnalyticsAccount(
    account,
  );

  const {
    error,
  } =
    await supabase
      .from(
        "analytics_events",
      )
      .delete()
      .eq(
        "user_id",
        account.userId,
      );

  await assertAnalyticsAccount(
    account,
  );

  return !error;
}

async function flushForAccount(
  account:
    AnalyticsAccount,
  consentGeneration:
    number,
): Promise<number> {
  if (
    !isSupabaseConfigured ||
    currentConsentGeneration(
      account.userId,
    ) !==
      consentGeneration ||
    !(
      await readConsent(
        account.userId,
      )
    )
  ) {
    return 0;
  }

  let delivered =
    0;

  let queue =
    await readQueue();

  const ownEvents =
    queue.filter(
      (event) =>
        event.userId ===
        account.userId,
    );

  for (
    const event of
      ownEvents
  ) {
    if (
      currentConsentGeneration(
        account.userId,
      ) !==
        consentGeneration ||
      !(
        await readConsent(
          account.userId,
        )
      )
    ) {
      break;
    }

    await assertAnalyticsAccount(
      account,
    );

    const {
      error,
    } =
      await supabase
        .from(
          "analytics_events",
        )
        .insert({
          client_event_id:
            event.eventId,
          user_id:
            account.userId,
          event_name:
            event.name,
          failure_point:
            event.failurePoint,
          failure_class:
            event.failureClass,
          attempt:
            event.attempt,
          platform:
            event.platform,
          schema_version:
            1,
          occurred_at:
            event.occurredAt,
        });

    await assertAnalyticsAccount(
      account,
    );

    if (
      error &&
      error.code !==
        "23505"
    ) {
      break;
    }

    queue =
      queue.filter(
        (queuedEvent) =>
          queuedEvent.eventId !==
          event.eventId,
      );

    await writeQueue(
      queue,
    );

    delivered +=
      1;
  }

  return delivered;
}

export async function recordAnalyticsEvent(
  input:
    AnalyticsEventInput,
): Promise<AnalyticsTrackResult> {
  const normalizedInput =
    normalizeAnalyticsEventInput(
      input,
    );

  if (!normalizedInput) {
    return {
      accepted:
        false,
      delivered:
        false,
      reason:
        "invalid",
    };
  }

  let account:
    AnalyticsAccount;

  try {
    account =
      await captureAnalyticsAccount();
  } catch {
    return {
      accepted:
        false,
      delivered:
        false,
      reason:
        "unavailable",
    };
  }

  const consentGeneration =
    currentConsentGeneration(
      account.userId,
    );

  return serializeAnalyticsOperation(
    async () => {
      try {
        await assertAnalyticsAccount(
          account,
        );

        if (
          currentConsentGeneration(
            account.userId,
          ) !==
            consentGeneration ||
          !(
            await readConsent(
              account.userId,
            )
          )
        ) {
          return {
            accepted:
              false,
            delivered:
              false,
            reason:
              "disabled" as const,
          };
        }

        const queue =
          await readQueue();

        const otherUsers =
          queue.filter(
            (event) =>
              event.userId !==
              account.userId,
          );

        const ownEvents =
          queue
            .filter(
              (event) =>
                event.userId ===
                account.userId,
            )
            .slice(
              -(
                MAX_QUEUED_EVENTS_PER_USER -
                1
              ),
            );

        const queuedEvent:
          QueuedAnalyticsEvent = {
            schemaVersion:
              1,
            eventId:
              Crypto.randomUUID(),
            userId:
              account.userId,
            name:
              normalizedInput.name,
            failurePoint:
              normalizedInput.name ===
              "workflow_failed"
                ? normalizedInput.failurePoint
                : null,
            failureClass:
              normalizedInput.name ===
              "workflow_failed"
                ? normalizedInput.failureClass
                : null,
            attempt:
              normalizedInput.attempt ??
              "initial",
            platform:
              normalizePlatform(),
            occurredAt:
              new Date().toISOString(),
          };

        await writeQueue([
          ...otherUsers,
          ...ownEvents,
          queuedEvent,
        ]);

        await flushForAccount(
          account,
          consentGeneration,
        );

        const remainingQueue =
          await readQueue();

        const delivered =
          !remainingQueue.some(
            (event) =>
              event.eventId ===
              queuedEvent.eventId,
          );

        return {
          accepted:
            true,
          delivered,
          reason:
            delivered
              ? "delivered" as const
              : "queued" as const,
        };
      } catch (
        error
      ) {
        const message =
          error instanceof
            Error
            ? error.message
            : "";

        return {
          accepted:
            false,
          delivered:
            false,
          reason:
            message.includes(
              "account changed",
            )
              ? "account_changed" as const
              : "unavailable" as const,
        };
      }
    },
  );
}

export function recordAnalyticsFailure(
  failurePoint:
    AnalyticsFailurePoint,
  failureClass:
    AnalyticsFailureClass,
  attempt:
    AnalyticsAttempt =
      "initial",
): Promise<AnalyticsTrackResult> {
  return recordAnalyticsEvent({
    name:
      "workflow_failed",
    failurePoint,
    failureClass,
    attempt,
  });
}

export async function flushAnalyticsEvents(): Promise<number> {
  let account:
    AnalyticsAccount;

  try {
    account =
      await captureAnalyticsAccount();
  } catch {
    return 0;
  }

  const consentGeneration =
    currentConsentGeneration(
      account.userId,
    );

  return serializeAnalyticsOperation(
    async () => {
      try {
        if (
          await isCloudDeletionPending(
            account.userId,
          )
        ) {
          const deleted =
            await deleteCloudEvents(
              account,
            );

          if (deleted) {
            await AsyncStorage.removeItem(
              deletePendingKey(
                account.userId,
              ),
            );
          }
        }

        return flushForAccount(
          account,
          consentGeneration,
        );
      } catch {
        return 0;
      }
    },
  );
}

export async function readAnalyticsControlState(): Promise<AnalyticsControlState> {
  const account =
    await captureAnalyticsAccount();

  return serializeAnalyticsOperation(
    async () => {
      await assertAnalyticsAccount(
        account,
      );

      const queue =
        await readQueue();

      return {
        enabled:
          await readConsent(
            account.userId,
          ),
        queuedEventCount:
          queue.filter(
            (event) =>
              event.userId ===
              account.userId,
          ).length,
        pendingCloudDeletion:
          await isCloudDeletionPending(
            account.userId,
          ),
      };
    },
  );
}

export async function setAnalyticsConsent(
  enabled: boolean,
): Promise<AnalyticsConsentResult> {
  const account =
    await captureAnalyticsAccount();

  const consentGeneration =
    invalidateConsentOperations(
      account.userId,
    );

  return serializeAnalyticsOperation(
    async () => {
      await assertAnalyticsAccount(
        account,
      );

      if (!enabled) {
        await AsyncStorage.setItem(
          consentKey(
            account.userId,
          ),
          "disabled",
        );

        await removeQueuedEventsForUser(
          account.userId,
        );

        await AsyncStorage.setItem(
          deletePendingKey(
            account.userId,
          ),
          "pending",
        );

        const cloudDeleted =
          await deleteCloudEvents(
            account,
          ).catch(
            () =>
              false,
          );

        if (cloudDeleted) {
          await AsyncStorage.removeItem(
            deletePendingKey(
              account.userId,
            ),
          );
        }

        return {
          enabled:
            false,
          queuedEventCount:
            0,
          pendingCloudDeletion:
            !cloudDeleted,
          cloudDeleted,
          message:
            cloudDeleted
              ? "Limited usage analytics are off and your analytics history was deleted."
              : "Limited usage analytics are off. Cloud history deletion will retry when Canal reconnects.",
        };
      }

      const deletionPending =
        await isCloudDeletionPending(
          account.userId,
        );

      if (deletionPending) {
        const cloudDeleted =
          await deleteCloudEvents(
            account,
          ).catch(
            () =>
              false,
          );

        if (!cloudDeleted) {
          return {
            enabled:
              false,
            queuedEventCount:
              0,
            pendingCloudDeletion:
              true,
            cloudDeleted:
              false,
            message:
              "Canal must finish deleting the previous analytics history before analytics can be enabled.",
          };
        }

        await AsyncStorage.removeItem(
          deletePendingKey(
            account.userId,
          ),
        );
      }

      if (
        currentConsentGeneration(
          account.userId,
        ) !==
        consentGeneration
      ) {
        throw new Error(
          "The analytics preference changed during this request.",
        );
      }

      await AsyncStorage.setItem(
        consentKey(
          account.userId,
        ),
        "enabled",
      );

      return {
        enabled:
          true,
        queuedEventCount:
          0,
        pendingCloudDeletion:
          false,
        cloudDeleted:
          true,
        message:
          "Limited usage analytics are on.",
      };
    },
  );
}

export async function deleteOwnAnalyticsEvents(): Promise<AnalyticsConsentResult> {
  const account =
    await captureAnalyticsAccount();

  invalidateConsentOperations(
    account.userId,
  );

  return serializeAnalyticsOperation(
    async () => {
      await removeQueuedEventsForUser(
        account.userId,
      );

      await AsyncStorage.setItem(
        deletePendingKey(
          account.userId,
        ),
        "pending",
      );

      const cloudDeleted =
        await deleteCloudEvents(
          account,
        ).catch(
          () =>
            false,
        );

      if (cloudDeleted) {
        await AsyncStorage.removeItem(
          deletePendingKey(
            account.userId,
          ),
        );
      }

      return {
        enabled:
          await readConsent(
            account.userId,
          ),
        queuedEventCount:
          0,
        pendingCloudDeletion:
          !cloudDeleted,
        cloudDeleted,
        message:
          cloudDeleted
            ? "Your analytics history was deleted."
            : "Local analytics were deleted. Cloud history deletion will retry when Canal reconnects.",
      };
    },
  );
}

export async function recordSevenDayReturn(
  accountCreatedAt:
    string | null | undefined,
  now =
    Date.now(),
): Promise<AnalyticsTrackResult> {
  const createdAt =
    Date.parse(
      accountCreatedAt ??
        "",
    );

  const accountAge =
    now -
    createdAt;

  if (
    !Number.isFinite(
      createdAt,
    ) ||
    accountAge <
      SEVEN_DAY_START_MS ||
    accountAge >=
      SEVEN_DAY_END_MS
  ) {
    return {
      accepted:
        false,
      delivered:
        false,
      reason:
        "invalid",
    };
  }

  return recordAnalyticsEvent({
    name:
      "seven_day_return",
  });
}

export function classifyAnalyticsFailure(
  error: unknown,
): AnalyticsFailureClass {
  const message =
    error instanceof
      Error
      ? error.message
      : typeof error ===
          "string"
        ? error
        : "";

  const normalized =
    message.toLowerCase();

  if (
    normalized.includes(
      "offline",
    ) ||
    normalized.includes(
      "network",
    ) ||
    normalized.includes(
      "fetch",
    )
  ) {
    return "offline";
  }

  if (
    normalized.includes(
      "permission",
    ) ||
    normalized.includes(
      "scope",
    )
  ) {
    return "permission";
  }

  if (
    normalized.includes(
      "auth",
    ) ||
    normalized.includes(
      "session",
    ) ||
    normalized.includes(
      "sign in",
    )
  ) {
    return "authentication";
  }

  if (
    normalized.includes(
      "rate",
    ) ||
    normalized.includes(
      "429",
    )
  ) {
    return "rate_limited";
  }

  if (
    normalized.includes(
      "config",
    ) ||
    normalized.includes(
      "client id",
    )
  ) {
    return "configuration";
  }

  if (
    normalized.includes(
      "invalid",
    ) ||
    normalized.includes(
      "required",
    )
  ) {
    return "validation";
  }

  if (
    normalized.includes(
      "storage",
    ) ||
    normalized.includes(
      "save",
    )
  ) {
    return "storage";
  }

  if (normalized) {
    return "service";
  }

  return "unknown";
}
