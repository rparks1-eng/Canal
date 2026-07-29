import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

export type EventRunSheetStatus =
  | "planned"
  | "completed";

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
  createdAt: string;
  updatedAt: string;
};

export type EventRunSheetSaveInput = {
  id?: string;
  collectionId: string;
  title: string;
  venueLabel: string;
  startsAt: string;
  timeZone: string;
};

export type EventRunSheetAccount =
  Readonly<{
    userId: string;
  }>;

export type EventRunSheetErrorKind =
  | "account-changed"
  | "conflict"
  | "invalid-input"
  | "invalid-response"
  | "not-found"
  | "permission-denied"
  | "request-failed";

export class EventRunSheetError extends Error {
  readonly kind:
    EventRunSheetErrorKind;

  readonly databaseCode:
    | string
    | null;

  constructor(
    kind:
      EventRunSheetErrorKind,
    message: string,
    databaseCode:
      | string
      | null = null,
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

    Object.setPrototypeOf(
      this,
      EventRunSheetError.prototype,
    );
  }
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
  created_at: unknown;
  updated_at: unknown;
};

type SupabaseError = {
  code?: string | null;
  message: string;
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
  "created_at",
  "updated_at",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;

const TIME_ZONE_PATTERN =
  /^(?:UTC|[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+)$/;

const MAX_TITLE_LENGTH =
  80;

const MAX_VENUE_LENGTH =
  120;

const MAX_TIME_ZONE_LENGTH =
  64;

const MAX_RUN_SHEET_RESULTS =
  100;

export async function captureEventRunSheetAccount(
  expectedUserId?: string,
): Promise<EventRunSheetAccount> {
  const userId =
    await currentUserId();

  if (
    expectedUserId !==
      undefined &&
    userId !==
      requireUuid(
        expectedUserId,
        "expected Event Run Sheet account",
      )
  ) {
    throw accountChangedError();
  }

  return {
    userId,
  };
}

export async function listOwnEventRunSheets(
  options: {
    account?: EventRunSheetAccount;
  } = {},
): Promise<EventRunSheet[]> {
  const account =
    await resolveAccount(
      options.account,
    );

  const result =
    await runAccountOperation(
      account,
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
    )
  ) {
    throw invalidResponse(
      "Canal returned invalid Event Run Sheet data.",
    );
  }

  return result.data.map(
    (row) =>
      normalizeRunSheetRow(
        row as unknown as
          EventRunSheetRow,
        account.userId,
      ),
  );
}

export async function loadEventRunSheet(
  runSheetId: string,
  options: {
    account?: EventRunSheetAccount;
  } = {},
): Promise<EventRunSheet | null> {
  const normalizedId =
    requireUuid(
      runSheetId,
      "Event Run Sheet",
    );

  const account =
    await resolveAccount(
      options.account,
    );

  const result =
    await runAccountOperation(
      account,
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

  if (result.error) {
    throw mapDatabaseError(
      "load this Event Run Sheet",
      result.error,
    );
  }

  return result.data
    ? normalizeRunSheetRow(
        result.data as unknown as
          EventRunSheetRow,
        account.userId,
      )
    : null;
}

export async function saveEventRunSheet(
  input: EventRunSheetSaveInput,
  options: {
    account?: EventRunSheetAccount;
  } = {},
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
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "save this Event Run Sheet",
      result.error,
    );
  }

  return normalizeRunSheetRow(
    singleRpcRow(
      result.data,
      "saved Event Run Sheet",
    ),
    account.userId,
  );
}

export async function advanceEventRunSheet(
  runSheetId: string,
  expectedPosition: number,
  options: {
    account?: EventRunSheetAccount;
  } = {},
): Promise<EventRunSheet> {
  const normalizedId =
    requireUuid(
      runSheetId,
      "Event Run Sheet",
    );

  if (
    !Number.isSafeInteger(
      expectedPosition,
    ) ||
    expectedPosition < 0
  ) {
    throw new EventRunSheetError(
      "invalid-input",
      "The expected Event Run Sheet position is invalid.",
    );
  }

  const account =
    await resolveAccount(
      options.account,
    );

  const result =
    await runAccountOperation(
      account,
      () =>
        supabase.rpc(
          "advance_creator_event_run_sheet",
          {
            run_sheet_id_value:
              normalizedId,
            expected_position_value:
              expectedPosition,
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "advance this Event Run Sheet",
      result.error,
    );
  }

  return normalizeRunSheetRow(
    singleRpcRow(
      result.data,
      "advanced Event Run Sheet",
    ),
    account.userId,
  );
}

export async function deleteEventRunSheet(
  runSheetId: string,
  options: {
    account?: EventRunSheetAccount;
  } = {},
): Promise<void> {
  const normalizedId =
    requireUuid(
      runSheetId,
      "Event Run Sheet",
    );

  const account =
    await resolveAccount(
      options.account,
    );

  const result =
    await runAccountOperation(
      account,
      () =>
        supabase.rpc(
          "delete_creator_event_run_sheet",
          {
            run_sheet_id_value:
              normalizedId,
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "delete this Event Run Sheet",
      result.error,
    );
  }

  if (result.data !== true) {
    throw invalidResponse(
      "Canal could not confirm the Event Run Sheet deletion.",
    );
  }
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
} {
  const startsAt =
    normalizeTimestamp(
      input.startsAt,
      "Event Run Sheet start time",
    );

  return {
    id:
      input.id ===
        undefined
        ? null
        : requireUuid(
            input.id,
            "Event Run Sheet",
          ),
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
    startsAt,
    timeZone:
      normalizeTimeZone(
        input.timeZone,
      ),
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
    !Number.isSafeInteger(
      row.active_position,
    ) ||
    (
      row.active_position as
        number
    ) < 0 ||
    (
      row.status !==
        "planned" &&
      row.status !==
        "completed"
    ) ||
    !createdAt ||
    !updatedAt
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
    activePosition:
      row.active_position as
        number,
    status:
      row.status,
    createdAt,
    updatedAt,
  };
}

function singleRpcRow(
  value: unknown,
  label: string,
): EventRunSheetRow {
  const row =
    Array.isArray(
      value,
    )
      ? value[0]
      : value;

  if (
    typeof row !==
      "object" ||
    row === null
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

  const expectedUserId =
    requireUuid(
      account.userId,
      "Event Run Sheet account",
    );

  await assertAccount({
    userId:
      expectedUserId,
  });

  return {
    userId:
      expectedUserId,
  };
}

async function runAccountOperation<
  Result,
>(
  account: EventRunSheetAccount,
  operation: () => PromiseLike<Result>,
): Promise<Result> {
  await assertAccount(
    account,
  );

  const result =
    await operation();

  await assertAccount(
    account,
  );

  return result;
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
    throw mapDatabaseError(
      "verify the current Event Run Sheet account",
      error,
    );
  }

  if (!user) {
    throw new EventRunSheetError(
      "permission-denied",
      "You must be signed into Canal to manage Event Run Sheets.",
      "42501",
    );
  }

  return requireUuid(
    user.id,
    "signed-in user",
  );
}

async function assertAccount(
  account: EventRunSheetAccount,
): Promise<void> {
  const actualUserId =
    await currentUserId();

  if (
    actualUserId !==
    account.userId
  ) {
    throw accountChangedError();
  }
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

  return normalized;
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

function mapDatabaseError(
  action: string,
  error: SupabaseError,
): EventRunSheetError {
  const code =
    error.code ??
    null;

  if (
    code ===
      "40001"
  ) {
    return new EventRunSheetError(
      "conflict",
      error.message,
      code,
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
      error.message,
      code,
    );
  }

  return new EventRunSheetError(
    "request-failed",
    `Canal could not ${action}: ${error.message}`,
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
    "The signed-in Canal account changed while Event Run Sheets were loading or saving. Please try again.",
  );
}
