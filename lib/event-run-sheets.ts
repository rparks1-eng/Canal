import {
  supabase,
} from "./supabase";

import {
  CanalAccountSessionChangedError,
  assertCanalAccountSessionGuardCurrent,
  captureCanalAccountSessionGuard,
} from "./canal-auth";

export const EVENT_RUN_SHEET_STATUSES = [
  "planned",
  "running",
  "completed",
] as const;

export type EventRunSheetStatus =
  (typeof EVENT_RUN_SHEET_STATUSES)[number];

export type EventRunSheet = {
  id: string;
  ownerId: string;
  collectionId: string;
  title: string;
  venueLabel: string;
  startsAt: string;
  timeZone: string;
  activePosition: number;
  status: EventRunSheetStatus;
  version: number;
  startedAt: string | null;
  completedAt: string | null;
  sourceCollectionTitle: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventRunSheetItem = {
  runSheetId: string;
  sceneId: string;
  sceneRevision: number;
  position: number;
  title: string;
  activityLabel: string;
  durationLabel: string;
  trackCount: number;
  createdAt: string;
};

export type EventRunSheetDetail =
  EventRunSheet & {
    items: EventRunSheetItem[];
  };

export type EventRunSheetSaveInput = {
  id?: string;
  collectionId: string;
  title: string;
  venueLabel: string;
  startsAt: string;
  timeZone: string;
  expectedVersion?: number;
};

export type EventRunSheetAccount =
  Readonly<{
    userId: string;
    accountEpoch: number;
    sessionGeneration: string;
  }>;

export type EventRunSheetAccountExpectation =
  Readonly<{
    userId?: string;
    accountEpoch?: number;
  }>;

export type EventRunSheetOptions =
  Readonly<{
    account?: EventRunSheetAccount;
  }>;

export type EventRunSheetErrorKind =
  | "account-changed"
  | "conflict"
  | "invalid-input"
  | "invalid-response"
  | "not-found"
  | "offline"
  | "permission-denied"
  | "request-failed";

export class EventRunSheetError extends Error {
  readonly kind:
    EventRunSheetErrorKind;

  readonly databaseCode:
    | string
    | null;

  readonly retryable:
    boolean;

  constructor(
    kind:
      EventRunSheetErrorKind,
    message: string,
    databaseCode:
      | string
      | null = null,
    retryable = false,
  ) {
    super(
      message,
    );

    this.name =
      "EventRunSheetError";
    this.kind =
      kind;
    this.databaseCode =
      databaseCode;
    this.retryable =
      retryable;

    Object.setPrototypeOf(
      this,
      EventRunSheetError.prototype,
    );
  }
}

export function isEventRunSheetError(
  error: unknown,
): error is EventRunSheetError {
  return (
    error instanceof
    EventRunSheetError
  );
}

type EventRunSheetRow = {
  id: unknown;
  owner_id: unknown;
  collection_id: unknown;
  title: unknown;
  venue_label: unknown;
  starts_at: unknown;
  time_zone: unknown;
  active_position: unknown;
  status: unknown;
  version: unknown;
  started_at: unknown;
  completed_at: unknown;
  source_collection_title: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type EventRunSheetItemRow = {
  run_sheet_id: unknown;
  owner_id: unknown;
  scene_id: unknown;
  scene_revision: unknown;
  position: unknown;
  scene_title: unknown;
  activity_label: unknown;
  duration_label: unknown;
  track_count: unknown;
  created_at: unknown;
};

type SupabaseError = {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
};

const RUN_SHEET_COLUMNS = [
  "id",
  "owner_id",
  "collection_id",
  "title",
  "venue_label",
  "starts_at",
  "time_zone",
  "active_position",
  "status",
  "version",
  "started_at",
  "completed_at",
  "source_collection_title",
  "created_at",
  "updated_at",
].join(
  ", ",
);

const RUN_SHEET_ITEM_COLUMNS = [
  "run_sheet_id",
  "owner_id",
  "scene_id",
  "scene_revision",
  "position",
  "scene_title",
  "activity_label",
  "duration_label",
  "track_count",
  "created_at",
].join(
  ", ",
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;

const TIME_ZONE_PATTERN =
  /^(?:UTC|[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+)$/;

const CONNECTIVITY_MESSAGE_PATTERN =
  /\b(?:abort(?:ed)?|connection|fetch|network|offline|socket|timeout|timed out)\b/i;

const MAX_TITLE_LENGTH =
  80;

const MAX_VENUE_LENGTH =
  120;

const MAX_TIME_ZONE_LENGTH =
  64;

const MAX_SCENE_ID_LENGTH =
  512;

const MAX_SCENE_TITLE_LENGTH =
  120;

const MAX_ACTIVITY_LENGTH =
  120;

const MAX_DURATION_LENGTH =
  80;

const MAX_RUN_SHEET_RESULTS =
  100;

const MAX_RUN_SHEET_ITEMS =
  50;

export async function captureEventRunSheetAccount(
  expected?:
    | string
    | EventRunSheetAccountExpectation,
): Promise<EventRunSheetAccount> {
  const expectedUserId =
    typeof expected ===
      "string"
      ? requireUuid(
          expected,
          "expected Event Run Sheet account",
        )
      : expected?.userId ===
          undefined
        ? null
        : requireUuid(
            expected.userId,
            "expected Event Run Sheet account",
          );

  const expectedAccountEpoch =
    typeof expected ===
      "object" &&
    expected !==
      null &&
    expected.accountEpoch !==
      undefined
      ? requireAccountEpoch(
          expected.accountEpoch,
          "expected Event Run Sheet account epoch",
        )
      : null;

  const account =
    await captureCanalAccountSessionGuard();

  if (
    expectedUserId !==
      null &&
    account.userId !==
      expectedUserId
  ) {
    throw accountChangedError();
  }

  if (
    expectedAccountEpoch !==
      null &&
    account.epoch !==
      expectedAccountEpoch
  ) {
    throw accountChangedError();
  }

  return {
    userId:
      account.userId,
    accountEpoch:
      account.epoch,
    sessionGeneration:
      account.sessionGeneration,
  };
}

export async function listOwnEventRunSheets(
  options:
    EventRunSheetOptions =
      {},
): Promise<EventRunSheet[]> {
  const account =
    await resolveAccount(
      options.account,
    );

  const result =
    await runAccountOperation(
      account,
      "load Event Run Sheets",
      () =>
        supabase
          .from(
            "creator_event_run_sheets",
          )
          .select(
            RUN_SHEET_COLUMNS,
          )
          .eq(
            "owner_id",
            account.userId,
          )
          .order(
            "starts_at",
            {
              ascending:
                true,
            },
          )
          .order(
            "id",
            {
              ascending:
                true,
            },
          )
          .limit(
            MAX_RUN_SHEET_RESULTS,
          ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "load Event Run Sheets",
      result.error,
    );
  }

  if (
    !Array.isArray(
      result.data,
    ) ||
    result.data.length >
      MAX_RUN_SHEET_RESULTS
  ) {
    throw invalidResponse(
      "Canal returned invalid Event Run Sheet data.",
    );
  }

  const runSheets =
    result.data.map(
      (row) =>
        normalizeRunSheetRow(
          row as unknown as
            EventRunSheetRow,
          account.userId,
        ),
    );

  rejectDuplicateValues(
    runSheets.map(
      (runSheet) =>
        runSheet.id,
    ),
    "Event Run Sheet list",
  );

  return runSheets;
}

export async function loadEventRunSheet(
  runSheetId: string,
  options:
    EventRunSheetOptions =
      {},
): Promise<EventRunSheetDetail | null> {
  const normalizedId =
    requireUuid(
      runSheetId,
      "Event Run Sheet",
    );

  const account =
    await resolveAccount(
      options.account,
    );

  const runSheetResult =
    await runAccountOperation(
      account,
      "load this Event Run Sheet",
      () =>
        supabase
          .from(
            "creator_event_run_sheets",
          )
          .select(
            RUN_SHEET_COLUMNS,
          )
          .eq(
            "id",
            normalizedId,
          )
          .eq(
            "owner_id",
            account.userId,
          )
          .maybeSingle(),
    );

  if (
    runSheetResult.error
  ) {
    throw mapDatabaseError(
      "load this Event Run Sheet",
      runSheetResult.error,
    );
  }

  if (
    !runSheetResult.data
  ) {
    return null;
  }

  const runSheet =
    normalizeRunSheetRow(
      runSheetResult.data as unknown as
        EventRunSheetRow,
      account.userId,
    );

  const itemResult =
    await runAccountOperation(
      account,
      "load this Event Run Sheet's frozen Scenes",
      () =>
        supabase
          .from(
            "creator_event_run_sheet_items",
          )
          .select(
            RUN_SHEET_ITEM_COLUMNS,
          )
          .eq(
            "run_sheet_id",
            runSheet.id,
          )
          .eq(
            "owner_id",
            account.userId,
          )
          .order(
            "position",
            {
              ascending:
                true,
            },
          )
          .limit(
            MAX_RUN_SHEET_ITEMS,
          ),
    );

  if (itemResult.error) {
    throw mapDatabaseError(
      "load this Event Run Sheet's frozen Scenes",
      itemResult.error,
    );
  }

  if (
    !Array.isArray(
      itemResult.data,
    ) ||
    itemResult.data.length >
      MAX_RUN_SHEET_ITEMS
  ) {
    throw invalidResponse(
      "Canal returned invalid frozen Event Run Sheet items.",
    );
  }

  const items =
    itemResult.data.map(
      (row) =>
        normalizeRunSheetItemRow(
          row as unknown as
            EventRunSheetItemRow,
          runSheet,
        ),
    );

  validateRunSheetItems(
    runSheet,
    items,
  );

  return {
    ...runSheet,
    items,
  };
}

export async function saveEventRunSheet(
  input: EventRunSheetSaveInput,
  options:
    EventRunSheetOptions =
      {},
): Promise<EventRunSheet> {
  const normalizedInput =
    normalizeSaveInput(
      input,
    );

  const account =
    await resolveAccount(
      options.account,
    );

  const result =
    await runAccountOperation(
      account,
      "save this Event Run Sheet",
      () =>
        supabase.rpc(
          "save_creator_event_run_sheet",
          {
            run_sheet_id_value:
              normalizedInput.id,
            collection_id_value:
              normalizedInput.collectionId,
            title_value:
              normalizedInput.title,
            venue_label_value:
              normalizedInput.venueLabel,
            starts_at_value:
              normalizedInput.startsAt,
            time_zone_value:
              normalizedInput.timeZone,
            expected_version_value:
              normalizedInput.expectedVersion,
            expected_actor_id_value:
              account.userId,
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "save this Event Run Sheet",
      result.error,
    );
  }

  const runSheet =
    normalizeRunSheetRow(
      singleRpcRow(
        result.data,
        "saved Event Run Sheet",
      ),
      account.userId,
    );

  if (
    runSheet.status !==
      "planned" ||
    (
      normalizedInput.id !==
        null &&
      runSheet.id !==
        normalizedInput.id
    )
  ) {
    throw invalidResponse(
      "Canal returned an invalid saved Event Run Sheet.",
    );
  }

  return runSheet;
}

export async function startEventRunSheet(
  runSheetId: string,
  expectedVersion: number,
  options:
    EventRunSheetOptions =
      {},
): Promise<EventRunSheet> {
  return lifecycleMutation(
    "start_creator_event_run_sheet",
    "start this Event Run Sheet",
    runSheetId,
    expectedVersion,
    undefined,
    "running",
    options,
  );
}

export async function advanceEventRunSheet(
  runSheetId: string,
  expectedPosition: number,
  expectedVersion: number,
  options:
    EventRunSheetOptions =
      {},
): Promise<EventRunSheet> {
  return lifecycleMutation(
    "advance_creator_event_run_sheet",
    "advance this Event Run Sheet",
    runSheetId,
    expectedVersion,
    expectedPosition,
    "running",
    options,
  );
}

export async function completeEventRunSheet(
  runSheetId: string,
  expectedPosition: number,
  expectedVersion: number,
  options:
    EventRunSheetOptions =
      {},
): Promise<EventRunSheet> {
  return lifecycleMutation(
    "complete_creator_event_run_sheet",
    "complete this Event Run Sheet",
    runSheetId,
    expectedVersion,
    expectedPosition,
    "completed",
    options,
  );
}

export async function deleteEventRunSheet(
  runSheetId: string,
  expectedVersion: number,
  options:
    EventRunSheetOptions =
      {},
): Promise<void> {
  const normalizedId =
    requireUuid(
      runSheetId,
      "Event Run Sheet",
    );

  const normalizedVersion =
    requirePositiveInteger(
      expectedVersion,
      "expected Event Run Sheet version",
    );

  const account =
    await resolveAccount(
      options.account,
    );

  const result =
    await runAccountOperation(
      account,
      "delete this Event Run Sheet",
      () =>
        supabase.rpc(
          "delete_creator_event_run_sheet",
          {
            run_sheet_id_value:
              normalizedId,
            expected_version_value:
              normalizedVersion,
            expected_actor_id_value:
              account.userId,
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "delete this Event Run Sheet",
      result.error,
    );
  }

  if (
    result.data !==
      true
  ) {
    throw invalidResponse(
      "Canal could not confirm the Event Run Sheet deletion.",
    );
  }
}

async function lifecycleMutation(
  functionName:
    | "start_creator_event_run_sheet"
    | "advance_creator_event_run_sheet"
    | "complete_creator_event_run_sheet",
  action: string,
  runSheetId: string,
  expectedVersion: number,
  expectedPosition:
    | number
    | undefined,
  expectedStatus:
    | "running"
    | "completed",
  options:
    EventRunSheetOptions,
): Promise<EventRunSheet> {
  const normalizedId =
    requireUuid(
      runSheetId,
      "Event Run Sheet",
    );

  const normalizedVersion =
    requirePositiveInteger(
      expectedVersion,
      "expected Event Run Sheet version",
    );

  const normalizedPosition =
    expectedPosition ===
      undefined
      ? undefined
      : requirePosition(
          expectedPosition,
        );

  const account =
    await resolveAccount(
      options.account,
    );

  const parameters:
    Record<
      string,
      unknown
    > = {
      run_sheet_id_value:
        normalizedId,
      expected_version_value:
        normalizedVersion,
      expected_actor_id_value:
        account.userId,
    };

  if (
    normalizedPosition !==
      undefined
  ) {
    parameters.expected_position_value =
      normalizedPosition;
  }

  const result =
    await runAccountOperation(
      account,
      action,
      () =>
        supabase.rpc(
          functionName,
          parameters,
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      action,
      result.error,
    );
  }

  const runSheet =
    normalizeRunSheetRow(
      singleRpcRow(
        result.data,
        `${expectedStatus} Event Run Sheet`,
      ),
      account.userId,
    );

  if (
    runSheet.id !==
      normalizedId ||
    runSheet.status !==
      expectedStatus ||
    runSheet.version !==
      normalizedVersion +
        1
  ) {
    throw invalidResponse(
      `Canal returned an invalid ${expectedStatus} Event Run Sheet.`,
    );
  }

  return runSheet;
}

function normalizeSaveInput(
  input: EventRunSheetSaveInput,
): {
  id: string | null;
  collectionId: string;
  title: string;
  venueLabel: string;
  startsAt: string;
  timeZone: string;
  expectedVersion:
    | number
    | null;
} {
  const id =
    input.id ===
      undefined
      ? null
      : requireUuid(
          input.id,
          "Event Run Sheet",
        );

  const expectedVersion =
    input.expectedVersion ===
      undefined
      ? null
      : requirePositiveInteger(
          input.expectedVersion,
          "expected Event Run Sheet version",
        );

  if (
    (
      id ===
        null &&
      expectedVersion !==
        null
    ) ||
    (
      id !==
        null &&
      expectedVersion ===
        null
    )
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      "Existing Event Run Sheets require an exact expected version.",
    );
  }

  return {
    id,
    collectionId:
      requireUuid(
        input.collectionId,
        "Scene collection",
      ),
    title:
      normalizeBoundedText(
        input.title,
        "Event Run Sheet title",
        MAX_TITLE_LENGTH,
      ),
    venueLabel:
      normalizeBoundedText(
        input.venueLabel,
        "venue label",
        MAX_VENUE_LENGTH,
      ),
    startsAt:
      normalizeTimestamp(
        input.startsAt,
        "Event Run Sheet start time",
      ),
    timeZone:
      normalizeTimeZone(
        input.timeZone,
      ),
    expectedVersion,
  };
}

function normalizeRunSheetRow(
  row: EventRunSheetRow,
  expectedOwnerId: string,
): EventRunSheet {
  const id =
    requiredUuid(
      row.id,
    );

  const ownerId =
    requiredUuid(
      row.owner_id,
    );

  const collectionId =
    requiredUuid(
      row.collection_id,
    );

  const title =
    cleanBoundedText(
      row.title,
      MAX_TITLE_LENGTH,
    );

  const venueLabel =
    cleanBoundedText(
      row.venue_label,
      MAX_VENUE_LENGTH,
    );

  const startsAt =
    validTimestamp(
      row.starts_at,
    );

  const timeZone =
    cleanTimeZone(
      row.time_zone,
    );

  const status =
    isEventRunSheetStatus(
      row.status,
    )
      ? row.status
      : null;

  const version =
    positiveInteger(
      row.version,
    );

  const activePosition =
    boundedPosition(
      row.active_position,
    );

  const startedAt =
    nullableTimestamp(
      row.started_at,
    );

  const completedAt =
    nullableTimestamp(
      row.completed_at,
    );

  const sourceCollectionTitle =
    nullableBoundedText(
      row.source_collection_title,
      MAX_TITLE_LENGTH,
    );

  const createdAt =
    validTimestamp(
      row.created_at,
    );

  const updatedAt =
    validTimestamp(
      row.updated_at,
    );

  if (
    !id ||
    !ownerId ||
    ownerId !==
      expectedOwnerId ||
    !collectionId ||
    !title ||
    !venueLabel ||
    !startsAt ||
    !timeZone ||
    !status ||
    version ===
      null ||
    activePosition ===
      null ||
    startedAt ===
      undefined ||
    completedAt ===
      undefined ||
    sourceCollectionTitle ===
      undefined ||
    !createdAt ||
    !updatedAt ||
    !validLifecycleState({
      status,
      activePosition,
      startedAt,
      completedAt,
      sourceCollectionTitle,
    })
  ) {
    throw invalidResponse(
      "Canal returned an invalid or cross-account Event Run Sheet.",
    );
  }

  return {
    id,
    ownerId,
    collectionId,
    title,
    venueLabel,
    startsAt,
    timeZone,
    activePosition,
    status,
    version,
    startedAt,
    completedAt,
    sourceCollectionTitle,
    createdAt,
    updatedAt,
  };
}

function normalizeRunSheetItemRow(
  row: EventRunSheetItemRow,
  runSheet: EventRunSheet,
): EventRunSheetItem {
  const runSheetId =
    requiredUuid(
      row.run_sheet_id,
    );

  const ownerId =
    requiredUuid(
      row.owner_id,
    );

  const sceneId =
    cleanBoundedText(
      row.scene_id,
      MAX_SCENE_ID_LENGTH,
    );

  const sceneRevision =
    positiveInteger(
      row.scene_revision,
    );

  const position =
    boundedPosition(
      row.position,
    );

  const title =
    cleanBoundedText(
      row.scene_title,
      MAX_SCENE_TITLE_LENGTH,
    );

  const activityLabel =
    cleanBoundedText(
      row.activity_label,
      MAX_ACTIVITY_LENGTH,
    );

  const durationLabel =
    cleanBoundedText(
      row.duration_label,
      MAX_DURATION_LENGTH,
    );

  const trackCount =
    boundedInteger(
      row.track_count,
      0,
      500,
    );

  const createdAt =
    validTimestamp(
      row.created_at,
    );

  if (
    runSheetId !==
      runSheet.id ||
    ownerId !==
      runSheet.ownerId ||
    !sceneId ||
    sceneRevision ===
      null ||
    position ===
      null ||
    !title ||
    !activityLabel ||
    !durationLabel ||
    trackCount ===
      null ||
    !createdAt
  ) {
    throw invalidResponse(
      "Canal returned an invalid frozen Event Run Sheet item.",
    );
  }

  return {
    runSheetId,
    sceneId,
    sceneRevision,
    position,
    title,
    activityLabel,
    durationLabel,
    trackCount,
    createdAt,
  };
}

function validateRunSheetItems(
  runSheet: EventRunSheet,
  items: EventRunSheetItem[],
): void {
  rejectDuplicateValues(
    items.map(
      (item) =>
        item.sceneId,
    ),
    "frozen Event Run Sheet Scene IDs",
  );

  rejectDuplicateValues(
    items.map(
      (item) =>
        item.position.toString(),
    ),
    "frozen Event Run Sheet positions",
  );

  const positionsAreContiguous =
    items.every(
      (
        item,
        index,
      ) =>
        item.position ===
        index,
    );

  if (
    runSheet.status ===
      "planned"
  ) {
    if (
      items.length !==
      0
    ) {
      throw invalidResponse(
        "A planned Event Run Sheet cannot have frozen items.",
      );
    }

    return;
  }

  if (
    items.length <
      1 ||
    items.length >
      MAX_RUN_SHEET_ITEMS ||
    !positionsAreContiguous ||
    runSheet.activePosition >=
      items.length
  ) {
    throw invalidResponse(
      "The frozen Event Run Sheet order is invalid.",
    );
  }
}

function validLifecycleState(
  input: {
    status: EventRunSheetStatus;
    activePosition: number;
    startedAt: string | null;
    completedAt: string | null;
    sourceCollectionTitle: string | null;
  },
): boolean {
  if (
    input.status ===
      "planned"
  ) {
    return (
      input.activePosition ===
        0 &&
      input.startedAt ===
        null &&
      input.completedAt ===
        null &&
      input.sourceCollectionTitle ===
        null
    );
  }

  if (
    !input.startedAt ||
    !input.sourceCollectionTitle
  ) {
    return false;
  }

  if (
    input.status ===
      "running"
  ) {
    return (
      input.completedAt ===
      null
    );
  }

  return Boolean(
    input.completedAt &&
      Date.parse(
        input.completedAt,
      ) >=
        Date.parse(
          input.startedAt,
        ),
  );
}

function singleRpcRow(
  value: unknown,
  label: string,
): EventRunSheetRow {
  if (
    Array.isArray(
      value,
    ) &&
    value.length !==
      1
  ) {
    throw invalidResponse(
      `Canal returned an invalid ${label}.`,
    );
  }

  const row =
    Array.isArray(
      value,
    )
      ? value[0]
      : value;

  if (
    typeof row !==
      "object" ||
    row ===
      null ||
    Array.isArray(
      row,
    )
  ) {
    throw invalidResponse(
      `Canal returned an invalid ${label}.`,
    );
  }

  return row as
    EventRunSheetRow;
}

async function resolveAccount(
  account:
    | EventRunSheetAccount
    | undefined,
): Promise<EventRunSheetAccount> {
  if (!account) {
    return captureEventRunSheetAccount();
  }

  const resolved = {
    userId:
      requireUuid(
        account.userId,
        "Event Run Sheet account",
      ),
    accountEpoch:
      requireAccountEpoch(
        account.accountEpoch,
        "Event Run Sheet account epoch",
      ),
    sessionGeneration:
      requireSessionGeneration(
        account.sessionGeneration,
        "Event Run Sheet account session generation",
      ),
  };

  await assertAccount(
    resolved,
  );

  return resolved;
}

async function runAccountOperation<
  Result,
>(
  account: EventRunSheetAccount,
  action: string,
  operation: () => PromiseLike<Result>,
): Promise<Result> {
  await assertAccount(
    account,
  );

  let result:
    Result;

  try {
    result =
      await operation();
  } catch (error) {
    await assertAccount(
      account,
    );

    throw mapDatabaseError(
      action,
      error,
    );
  }

  await assertAccount(
    account,
  );

  return result;
}

async function assertAccount(
  account: EventRunSheetAccount,
): Promise<void> {
  try {
    await assertCanalAccountSessionGuardCurrent({
      userId:
        account.userId,
      epoch:
        account.accountEpoch,
      sessionGeneration:
        account.sessionGeneration,
    });
  } catch (error) {
    if (
      error instanceof
      CanalAccountSessionChangedError
    ) {
      throw accountChangedError();
    }

    throw mapDatabaseError(
      "verify the current Event Run Sheet account",
      error,
    );
  }
}

function requireAccountEpoch(
  value: unknown,
  label: string,
): number {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    (value as number) <
      1
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      `${label} is invalid.`,
    );
  }

  return value as number;
}

function requireSessionGeneration(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim() ||
    value.length >
      512
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      `${label} is invalid.`,
    );
  }

  return value;
}

function normalizeBoundedText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  const normalized =
    typeof value ===
      "string"
      ? value.trim()
      : "";

  if (
    normalized.length ===
      0 ||
    Array.from(
      normalized,
    ).length >
      maximumLength ||
    CONTROL_CHARACTER_PATTERN.test(
      normalized,
    )
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      `${label} must be between 1 and ${maximumLength} characters without control characters.`,
    );
  }

  return normalized;
}

function cleanBoundedText(
  value: unknown,
  maximumLength: number,
): string {
  if (
    typeof value !==
      "string"
  ) {
    return "";
  }

  const normalized =
    value.trim();

  return (
    normalized.length >
      0 &&
    Array.from(
      normalized,
    ).length <=
      maximumLength &&
    !CONTROL_CHARACTER_PATTERN.test(
      normalized,
    )
  )
    ? normalized
    : "";
}

function nullableBoundedText(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (
    value ===
      null
  ) {
    return null;
  }

  const normalized =
    cleanBoundedText(
      value,
      maximumLength,
    );

  return normalized ||
    undefined;
}

function normalizeTimeZone(
  value: unknown,
): string {
  const normalized =
    typeof value ===
      "string"
      ? value.trim()
      : "";

  if (
    normalized.length ===
      0 ||
    normalized.length >
      MAX_TIME_ZONE_LENGTH ||
    !TIME_ZONE_PATTERN.test(
      normalized,
    )
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      "Choose a valid IANA time zone.",
    );
  }

  return normalized;
}

function cleanTimeZone(
  value: unknown,
): string {
  if (
    typeof value !==
      "string"
  ) {
    return "";
  }

  const normalized =
    value.trim();

  return (
    normalized.length <=
      MAX_TIME_ZONE_LENGTH &&
    TIME_ZONE_PATTERN.test(
      normalized,
    )
  )
    ? normalized
    : "";
}

function normalizeTimestamp(
  value: unknown,
  label: string,
): string {
  const normalized =
    validTimestamp(
      value,
    );

  if (!normalized) {
    throw new EventRunSheetError(
      "invalid-input",
      `${label} is invalid.`,
    );
  }

  return new Date(
    normalized,
  ).toISOString();
}

function validTimestamp(
  value: unknown,
): string {
  return (
    typeof value ===
      "string" &&
    Number.isFinite(
      Date.parse(
        value,
      ),
    )
  )
    ? value
    : "";
}

function nullableTimestamp(
  value: unknown,
): string | null | undefined {
  if (
    value ===
      null
  ) {
    return null;
  }

  const normalized =
    validTimestamp(
      value,
    );

  return normalized ||
    undefined;
}

function requireUuid(
  value: string,
  label: string,
): string {
  const normalized =
    value.trim();

  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      `${label} ID is invalid.`,
    );
  }

  return normalized;
}

function requiredUuid(
  value: unknown,
): string {
  return (
    typeof value ===
      "string" &&
    UUID_PATTERN.test(
      value.trim(),
    )
  )
    ? value.trim()
    : "";
}

function requirePositiveInteger(
  value: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <
      1
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      `The ${label} is invalid.`,
    );
  }

  return value;
}

function requirePosition(
  value: number,
): number {
  const normalized =
    boundedInteger(
      value,
      0,
      49,
    );

  if (
    normalized ===
      null
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      "The expected Event Run Sheet position is invalid.",
    );
  }

  return normalized;
}

function positiveInteger(
  value: unknown,
): number | null {
  return boundedInteger(
    value,
    1,
    Number.MAX_SAFE_INTEGER,
  );
}

function boundedPosition(
  value: unknown,
): number | null {
  return boundedInteger(
    value,
    0,
    49,
  );
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return (
    typeof value ===
      "number" &&
    Number.isSafeInteger(
      value,
    ) &&
    value >=
      minimum &&
    value <=
      maximum
  )
    ? value
    : null;
}

function isEventRunSheetStatus(
  value: unknown,
): value is EventRunSheetStatus {
  return (
    value ===
      "planned" ||
    value ===
      "running" ||
    value ===
      "completed"
  );
}

function rejectDuplicateValues(
  values:
    readonly string[],
  label: string,
): void {
  if (
    new Set(
      values,
    ).size !==
    values.length
  ) {
    throw invalidResponse(
      `Canal returned duplicate ${label}.`,
    );
  }
}

function mapDatabaseError(
  action: string,
  error: unknown,
): EventRunSheetError {
  if (
    error instanceof
    EventRunSheetError
  ) {
    return error;
  }

  const shape =
    error &&
    typeof error ===
      "object"
      ? error as
          SupabaseError
      : {
          message:
            String(
              error,
            ),
        };

  const code =
    typeof shape.code ===
      "string"
      ? shape.code
      : null;

  const message =
    typeof shape.message ===
      "string"
      ? shape.message
      : "Unknown database error";

  if (
    code ===
      "40001" ||
    code ===
      "23505" ||
    code ===
      "40P01"
  ) {
    return new EventRunSheetError(
      "conflict",
      message,
      code,
      true,
    );
  }

  if (
    code ===
      "42501"
  ) {
    return new EventRunSheetError(
      "permission-denied",
      `Canal does not have permission to ${action}.`,
      code,
    );
  }

  if (
    code ===
      "P0002"
  ) {
    return new EventRunSheetError(
      "not-found",
      "This Event Run Sheet is unavailable.",
      code,
    );
  }

  if (
    code ===
      "22023"
  ) {
    return new EventRunSheetError(
      "invalid-input",
      message,
      code,
    );
  }

  if (
    CONNECTIVITY_MESSAGE_PATTERN.test(
      [
        message,
        shape.details ??
          "",
        shape.hint ??
          "",
      ].join(
        " ",
      ),
    )
  ) {
    return new EventRunSheetError(
      "offline",
      `Canal could not ${action} because the network request failed. Reconnect and try again.`,
      code ??
        "FETCH_ERROR",
      true,
    );
  }

  return new EventRunSheetError(
    "request-failed",
    `Canal could not ${action}: ${message}`,
    code,
  );
}

function invalidResponse(
  message: string,
): EventRunSheetError {
  return new EventRunSheetError(
    "invalid-response",
    message,
  );
}

function accountChangedError(): EventRunSheetError {
  return new EventRunSheetError(
    "account-changed",
    "The signed-in Canal account changed while the Event Run Sheet request was in progress. Reload and try again.",
  );
}
