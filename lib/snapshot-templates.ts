import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

export const SNAPSHOT_TEMPLATE_THEMES = [
  "sunset",
  "midnight",
  "paper",
] as const;

export type SnapshotTemplateTheme =
  (typeof SNAPSHOT_TEMPLATE_THEMES)[number];

export type SnapshotTemplate = {
  id: string;
  ownerId: string;
  name: string;
  brandLabel: string;
  theme: SnapshotTemplateTheme;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SnapshotTemplateSaveInput = {
  id?: string;
  name: string;
  brandLabel: string;
  theme: SnapshotTemplateTheme;
  isDefault: boolean;
};

export type SnapshotTemplateAccount =
  Readonly<{
    userId: string;
  }>;

export type SnapshotTemplateErrorKind =
  | "account-changed"
  | "invalid-input"
  | "invalid-response"
  | "not-found"
  | "permission-denied"
  | "request-failed";

export class SnapshotTemplateError extends Error {
  readonly kind:
    SnapshotTemplateErrorKind;

  readonly databaseCode:
    | string
    | null;

  constructor(
    kind:
      SnapshotTemplateErrorKind,
    message: string,
    databaseCode:
      | string
      | null = null,
  ) {
    super(
      message,
    );

    this.name =
      "SnapshotTemplateError";

    this.kind =
      kind;

    this.databaseCode =
      databaseCode;

    Object.setPrototypeOf(
      this,
      SnapshotTemplateError.prototype,
    );
  }
}

type SnapshotTemplateRow = {
  id: unknown;
  owner_id: unknown;
  name: unknown;
  brand_label: unknown;
  theme: unknown;
  is_default: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type SupabaseError = {
  code?: string | null;
  message: string;
};

const TEMPLATE_COLUMNS = [
  "id",
  "owner_id",
  "name",
  "brand_label",
  "theme",
  "is_default",
  "created_at",
  "updated_at",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;

const MAX_TEMPLATE_NAME_LENGTH =
  60;

const MAX_BRAND_LABEL_LENGTH =
  32;

const MAX_TEMPLATE_RESULTS =
  20;

export function isSnapshotTemplateTheme(
  value: unknown,
): value is SnapshotTemplateTheme {
  return (
    typeof value ===
      "string" &&
    (
      SNAPSHOT_TEMPLATE_THEMES as
        readonly string[]
    ).includes(
      value,
    )
  );
}

export async function captureSnapshotTemplateAccount(
  expectedUserId?: string,
): Promise<SnapshotTemplateAccount> {
  const userId =
    await currentUserId();

  if (
    expectedUserId !==
      undefined &&
    userId !==
      requireUuid(
        expectedUserId,
        "expected Snapshot template account",
      )
  ) {
    throw accountChangedError();
  }

  return {
    userId,
  };
}

export async function listOwnSnapshotTemplates(
  options: {
    account?: SnapshotTemplateAccount;
  } = {},
): Promise<SnapshotTemplate[]> {
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
            "creator_snapshot_templates",
          )
          .select(
            TEMPLATE_COLUMNS,
          )
          .eq(
            "owner_id",
            account.userId,
          )
          .order(
            "is_default",
            {
              ascending:
                false,
            },
          )
          .order(
            "updated_at",
            {
              ascending:
                false,
            },
          )
          .limit(
            MAX_TEMPLATE_RESULTS,
          ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "load Snapshot templates",
      result.error,
    );
  }

  if (
    !Array.isArray(
      result.data,
    )
  ) {
    throw invalidResponse(
      "Canal returned invalid Snapshot template data.",
    );
  }

  return result.data.map(
    (row) =>
      normalizeTemplateRow(
        row as unknown as
          SnapshotTemplateRow,
        account.userId,
      ),
  );
}

export async function saveSnapshotTemplate(
  input: SnapshotTemplateSaveInput,
  options: {
    account?: SnapshotTemplateAccount;
  } = {},
): Promise<SnapshotTemplate> {
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
          "save_creator_snapshot_template",
          {
            template_id_value:
              normalizedInput.id,
            name_value:
              normalizedInput.name,
            brand_label_value:
              normalizedInput.brandLabel,
            theme_value:
              normalizedInput.theme,
            is_default_value:
              normalizedInput.isDefault,
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "save this Snapshot template",
      result.error,
    );
  }

  return normalizeTemplateRow(
    singleRpcRow(
      result.data,
      "saved Snapshot template",
    ),
    account.userId,
  );
}

export async function deleteSnapshotTemplate(
  templateId: string,
  options: {
    account?: SnapshotTemplateAccount;
  } = {},
): Promise<void> {
  const normalizedTemplateId =
    requireUuid(
      templateId,
      "Snapshot template",
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
          "delete_creator_snapshot_template",
          {
            template_id_value:
              normalizedTemplateId,
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "delete this Snapshot template",
      result.error,
    );
  }

  if (result.data !== true) {
    throw invalidResponse(
      "Canal could not confirm the Snapshot template deletion.",
    );
  }
}

function normalizeSaveInput(
  input: SnapshotTemplateSaveInput,
): {
  id: string | null;
  name: string;
  brandLabel: string;
  theme: SnapshotTemplateTheme;
  isDefault: boolean;
} {
  const name =
    normalizeBoundedText(
      input.name,
      "Snapshot template name",
      MAX_TEMPLATE_NAME_LENGTH,
    );

  const brandLabel =
    normalizeBoundedText(
      input.brandLabel,
      "Snapshot brand label",
      MAX_BRAND_LABEL_LENGTH,
    );

  if (
    !isSnapshotTemplateTheme(
      input.theme,
    )
  ) {
    throw new SnapshotTemplateError(
      "invalid-input",
      "Choose a supported Snapshot template theme.",
    );
  }

  if (
    typeof input.isDefault !==
      "boolean"
  ) {
    throw new SnapshotTemplateError(
      "invalid-input",
      "Snapshot template default status is invalid.",
    );
  }

  return {
    id:
      input.id ===
        undefined
        ? null
        : requireUuid(
            input.id,
            "Snapshot template",
          ),
    name,
    brandLabel,
    theme:
      input.theme,
    isDefault:
      input.isDefault,
  };
}

function normalizeTemplateRow(
  row: SnapshotTemplateRow,
  expectedOwnerId: string,
): SnapshotTemplate {
  const id =
    requiredUuid(
      row.id,
    );

  const ownerId =
    requiredUuid(
      row.owner_id,
    );

  const name =
    cleanBoundedText(
      row.name,
      MAX_TEMPLATE_NAME_LENGTH,
    );

  const brandLabel =
    cleanBoundedText(
      row.brand_label,
      MAX_BRAND_LABEL_LENGTH,
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
    !name ||
    !brandLabel ||
    !isSnapshotTemplateTheme(
      row.theme,
    ) ||
    typeof row.is_default !==
      "boolean" ||
    !createdAt ||
    !updatedAt
  ) {
    throw invalidResponse(
      "Canal returned an invalid or cross-account Snapshot template.",
    );
  }

  return {
    id,
    ownerId,
    name,
    brandLabel,
    theme:
      row.theme,
    isDefault:
      row.is_default,
    createdAt,
    updatedAt,
  };
}

function singleRpcRow(
  value: unknown,
  label: string,
): SnapshotTemplateRow {
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
    SnapshotTemplateRow;
}

async function resolveAccount(
  account:
    | SnapshotTemplateAccount
    | undefined,
): Promise<SnapshotTemplateAccount> {
  if (!account) {
    return captureSnapshotTemplateAccount();
  }

  const expectedUserId =
    requireUuid(
      account.userId,
      "Snapshot template account",
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
  account: SnapshotTemplateAccount,
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
      "verify the current Snapshot template account",
      error,
    );
  }

  if (!user) {
    throw new SnapshotTemplateError(
      "permission-denied",
      "You must be signed into Canal to manage Snapshot templates.",
      "42501",
    );
  }

  return requireUuid(
    user.id,
    "signed-in user",
  );
}

async function assertAccount(
  account: SnapshotTemplateAccount,
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
    throw new SnapshotTemplateError(
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
    return "";
  }

  return normalized;
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
    throw new SnapshotTemplateError(
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

function validTimestamp(
  value: unknown,
): string {
  if (
    typeof value !==
      "string" ||
    !Number.isFinite(
      Date.parse(
        value,
      ),
    )
  ) {
    return "";
  }

  return value;
}

function mapDatabaseError(
  action: string,
  error: SupabaseError,
): SnapshotTemplateError {
  const code =
    error.code ??
    null;

  if (
    code ===
      "42501"
  ) {
    return new SnapshotTemplateError(
      "permission-denied",
      `Canal does not have permission to ${action}.`,
      code,
    );
  }

  if (
    code ===
      "P0002"
  ) {
    return new SnapshotTemplateError(
      "not-found",
      "This Snapshot template is unavailable.",
      code,
    );
  }

  if (
    code ===
      "22023"
  ) {
    return new SnapshotTemplateError(
      "invalid-input",
      error.message,
      code,
    );
  }

  return new SnapshotTemplateError(
    "request-failed",
    `Canal could not ${action}: ${error.message}`,
    code,
  );
}

function invalidResponse(
  message: string,
): SnapshotTemplateError {
  return new SnapshotTemplateError(
    "invalid-response",
    message,
  );
}

function accountChangedError(): SnapshotTemplateError {
  return new SnapshotTemplateError(
    "account-changed",
    "The signed-in Canal account changed while Snapshot templates were loading or saving. Please try again.",
  );
}
