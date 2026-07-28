import type {
  StoredScene,
} from "./scenes";

import {
  normalizeStoredScene,
} from "./scenes";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

export type SceneCollaborationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked";

export type SceneCollaborationResponse =
  | "accepted"
  | "declined";

export type SceneCollaborationAccount =
  Readonly<{
    userId: string;
  }>;

export type SceneCollaboration = {
  sceneOwnerId: string;
  sceneId: string;
  collaboratorId: string;
  status: SceneCollaborationStatus;
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
};

export type CollaborativeSceneSave = {
  ownerId: string;
  sceneId: string;
  revision: number;
  scene: StoredScene;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type SceneCollaborationOptions = {
  account?:
    SceneCollaborationAccount;
};

export type ListIncomingSceneCollaborationsOptions =
  SceneCollaborationOptions & {
    statuses?:
      readonly SceneCollaborationStatus[];
    limit?: number;
  };

export type ListSceneCollaboratorsOptions =
  SceneCollaborationOptions & {
    limit?: number;
  };

type SceneCollaboratorRow = {
  scene_owner_id: unknown;
  scene_id: unknown;
  collaborator_id: unknown;
  status: unknown;
  invited_by: unknown;
  created_at: unknown;
  updated_at: unknown;
  responded_at: unknown;
};

type CollaborativeSceneRow = {
  user_id: unknown;
  id: unknown;
  payload: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
  deleted_at: unknown;
};

type SupabaseOperationError = {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
};

const COLLABORATOR_COLUMNS = [
  "scene_owner_id",
  "scene_id",
  "collaborator_id",
  "status",
  "invited_by",
  "created_at",
  "updated_at",
  "responded_at",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HANDLE_PATTERN =
  /^[a-z0-9_]{3,24}$/;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;

const DEFAULT_INCOMING_STATUSES:
  readonly SceneCollaborationStatus[] = [
    "pending",
    "accepted",
  ];

const MAX_SCENE_ID_LENGTH =
  200;

const MAX_SCENE_TRACKS =
  200;

const MAX_SCENE_PAYLOAD_BYTES =
  256 * 1024;

export class SceneRevisionConflictError extends Error {
  readonly kind =
    "scene-revision-conflict";

  readonly expectedRevision: number;

  readonly currentRevision:
    | number
    | null;

  readonly details:
    | string
    | null;

  constructor(
    expectedRevision: number,
    currentRevision:
      | number
      | null,
    details:
      | string
      | null = null,
  ) {
    super(
      currentRevision ===
        null
        ? "This Scene changed before your update could be saved. Reload it and try again."
        : `This Scene changed from revision ${expectedRevision} to ${currentRevision} before your update could be saved. Reload it and try again.`,
    );

    this.name =
      "SceneRevisionConflictError";

    this.expectedRevision =
      expectedRevision;

    this.currentRevision =
      currentRevision;

    this.details =
      details;

    Object.setPrototypeOf(
      this,
      SceneRevisionConflictError.prototype,
    );
  }
}

export function isSceneRevisionConflictError(
  error: unknown,
): error is SceneRevisionConflictError {
  return (
    error instanceof
    SceneRevisionConflictError
  );
}

export function normalizeSceneCollaboratorHandle(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .replace(
        /^@/,
        "",
      )
      .toLowerCase();

  if (
    !HANDLE_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "Enter the collaborator's exact Canal handle using 3–24 letters, numbers, or underscores.",
    );
  }

  return normalized;
}

export async function captureSceneCollaborationAccount(
  expectedUserId?: string,
): Promise<SceneCollaborationAccount> {
  const userId =
    await currentUserId();

  if (
    expectedUserId &&
    userId !==
      requireUuid(
        expectedUserId,
        "collaboration account",
      )
  ) {
    throw sceneCollaborationAccountChangedError();
  }

  return {
    userId,
  };
}

export async function listIncomingSceneCollaborations(
  options:
    ListIncomingSceneCollaborationsOptions =
      {},
): Promise<SceneCollaboration[]> {
  const account =
    await resolveAccount(
      options.account,
    );

  const statuses =
    normalizeStatuses(
      options.statuses ??
        DEFAULT_INCOMING_STATUSES,
    );

  const result =
    await runAccountOperation(
      account,
      () =>
        supabase
          .from(
            "scene_collaborators",
          )
          .select(
            COLLABORATOR_COLUMNS,
          )
          .eq(
            "collaborator_id",
            account.userId,
          )
          .in(
            "status",
            statuses,
          )
          .order(
            "updated_at",
            {
              ascending:
                false,
            },
          )
          .limit(
            normalizeLimit(
              options.limit,
            ),
          ),
    );

  if (result.error) {
    throw operationError(
      "load incoming Scene collaborations",
      result.error,
    );
  }

  return normalizeCollaborationRows(
    result.data,
  );
}

export async function listSceneCollaborators(
  sceneOwnerId: string,
  sceneId: string,
  options:
    ListSceneCollaboratorsOptions =
      {},
): Promise<SceneCollaboration[]> {
  const ownerId =
    requireUuid(
      sceneOwnerId,
      "Scene owner",
    );

  const normalizedSceneId =
    requireSceneId(
      sceneId,
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
            "scene_collaborators",
          )
          .select(
            COLLABORATOR_COLUMNS,
          )
          .eq(
            "scene_owner_id",
            ownerId,
          )
          .eq(
            "scene_id",
            normalizedSceneId,
          )
          .order(
            "created_at",
            {
              ascending:
                true,
            },
          )
          .limit(
            normalizeLimit(
              options.limit,
            ),
          ),
    );

  if (result.error) {
    throw operationError(
      "load this Scene's collaborators",
      result.error,
    );
  }

  return normalizeCollaborationRows(
    result.data,
  );
}

export async function loadCollaborativeScene(
  sceneOwnerId: string,
  sceneId: string,
  options:
    SceneCollaborationOptions =
      {},
): Promise<CollaborativeSceneSave> {
  const ownerId =
    requireUuid(
      sceneOwnerId,
      "Scene owner",
    );

  const normalizedSceneId =
    requireSceneId(
      sceneId,
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
            "scenes",
          )
          .select(
            "user_id, id, payload, revision, created_at, updated_at, deleted_at",
          )
          .eq(
            "user_id",
            ownerId,
          )
          .eq(
            "id",
            normalizedSceneId,
          )
          .limit(
            1,
          ),
    );

  if (result.error) {
    throw operationError(
      "load this collaborative Scene",
      result.error,
    );
  }

  const rows =
    result.data;

  if (
    !Array.isArray(
      rows,
    ) ||
    rows.length !==
      1
  ) {
    throw new Error(
      "This collaborative Scene is unavailable.",
    );
  }

  const scene =
    normalizeCollaborativeSceneRow(
      requireRecord(
        rows[0],
        "collaborative Scene",
      ) as CollaborativeSceneRow,
    );

  if (scene.deletedAt) {
    throw new Error(
      "This collaborative Scene is unavailable.",
    );
  }

  return scene;
}

export async function inviteSceneCollaborator(
  sceneOwnerId: string,
  sceneId: string,
  collaboratorHandle: string,
  options:
    SceneCollaborationOptions =
      {},
): Promise<SceneCollaboration> {
  const ownerId =
    requireUuid(
      sceneOwnerId,
      "Scene owner",
    );

  const normalizedSceneId =
    requireSceneId(
      sceneId,
    );

  const normalizedHandle =
    normalizeSceneCollaboratorHandle(
      collaboratorHandle,
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
          "invite_scene_collaborator",
          {
            scene_owner_id_value:
              ownerId,
            scene_id_value:
              normalizedSceneId,
            collaborator_handle_value:
              normalizedHandle,
          },
        ),
    );

  if (result.error) {
    throw operationError(
      "invite this Scene collaborator",
      result.error,
    );
  }

  return normalizeCollaborationRow(
    singleRpcRow(
      result.data,
      "collaboration invitation",
    ) as SceneCollaboratorRow,
  );
}

export async function respondToSceneCollaboration(
  sceneOwnerId: string,
  sceneId: string,
  response: SceneCollaborationResponse,
  options:
    SceneCollaborationOptions =
      {},
): Promise<SceneCollaboration> {
  const ownerId =
    requireUuid(
      sceneOwnerId,
      "Scene owner",
    );

  const normalizedSceneId =
    requireSceneId(
      sceneId,
    );

  const normalizedResponse =
    requireResponse(
      response,
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
          "respond_to_scene_collaboration",
          {
            scene_owner_id_value:
              ownerId,
            scene_id_value:
              normalizedSceneId,
            response_value:
              normalizedResponse,
          },
        ),
    );

  if (result.error) {
    throw operationError(
      "respond to this Scene collaboration",
      result.error,
    );
  }

  return normalizeCollaborationRow(
    singleRpcRow(
      result.data,
      "collaboration response",
    ) as SceneCollaboratorRow,
  );
}

export async function revokeSceneCollaborator(
  sceneOwnerId: string,
  sceneId: string,
  collaboratorId: string,
  options:
    SceneCollaborationOptions =
      {},
): Promise<SceneCollaboration> {
  const ownerId =
    requireUuid(
      sceneOwnerId,
      "Scene owner",
    );

  const normalizedSceneId =
    requireSceneId(
      sceneId,
    );

  const normalizedCollaboratorId =
    requireUuid(
      collaboratorId,
      "collaborator",
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
          "revoke_scene_collaborator",
          {
            scene_owner_id_value:
              ownerId,
            scene_id_value:
              normalizedSceneId,
            collaborator_id_value:
              normalizedCollaboratorId,
          },
        ),
    );

  if (result.error) {
    throw operationError(
      "revoke this Scene collaborator",
      result.error,
    );
  }

  return normalizeCollaborationRow(
    singleRpcRow(
      result.data,
      "revoked collaboration",
    ) as SceneCollaboratorRow,
  );
}

export async function saveCollaborativeScene(
  sceneOwnerId: string,
  sceneId: string,
  expectedRevision: number,
  scenePayload:
    Record<string, unknown>,
  options:
    SceneCollaborationOptions =
      {},
): Promise<CollaborativeSceneSave> {
  const ownerId =
    requireUuid(
      sceneOwnerId,
      "Scene owner",
    );

  const normalizedSceneId =
    requireSceneId(
      sceneId,
    );

  const revision =
    requireRevision(
      expectedRevision,
    );

  const payload =
    requireScenePayload(
      scenePayload,
      ownerId,
      normalizedSceneId,
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
          "update_collaborative_scene",
          {
            scene_owner_id_value:
              ownerId,
            scene_id_value:
              normalizedSceneId,
            expected_revision_value:
              revision,
            scene_payload_value:
              payload,
          },
        ),
    );

  if (result.error) {
    if (
      isRevisionConflict(
        result.error,
      )
    ) {
      throw new SceneRevisionConflictError(
        revision,
        parseCurrentRevision(
          result.error.details,
        ),
        result.error.details ??
          null,
      );
    }

    throw operationError(
      "save this collaborative Scene",
      result.error,
    );
  }

  return normalizeCollaborativeSceneRow(
    singleRpcRow(
      result.data,
      "collaborative Scene",
    ) as CollaborativeSceneRow,
  );
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
      "You must be signed into Canal to manage Scene collaboration.",
    );
  }

  return requireUuid(
    user.id,
    "signed-in user",
  );
}

async function resolveAccount(
  account:
    | SceneCollaborationAccount
    | undefined,
): Promise<SceneCollaborationAccount> {
  if (!account) {
    return captureSceneCollaborationAccount();
  }

  const resolved = {
    userId:
      requireUuid(
        account.userId,
        "collaboration account",
      ),
  };

  await assertAccount(
    resolved,
  );

  return resolved;
}

async function assertAccount(
  expected:
    SceneCollaborationAccount,
): Promise<void> {
  const actualUserId =
    await currentUserId();

  if (
    actualUserId !==
    expected.userId
  ) {
    throw sceneCollaborationAccountChangedError();
  }
}

async function runAccountOperation<
  Result,
>(
  account:
    SceneCollaborationAccount,
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

function sceneCollaborationAccountChangedError(): Error {
  return new Error(
    "The signed-in Canal account changed while Scene collaboration was loading or saving. Please try again.",
  );
}

function normalizeCollaborationRows(
  value: unknown,
): SceneCollaboration[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "Canal received an invalid Scene collaboration list.",
    );
  }

  return value.map(
    (row) =>
      normalizeCollaborationRow(
        requireRecord(
          row,
          "Scene collaboration",
        ) as SceneCollaboratorRow,
      ),
  );
}

function normalizeCollaborationRow(
  row: SceneCollaboratorRow,
): SceneCollaboration {
  const sceneOwnerId =
    requireUuidValue(
      row.scene_owner_id,
      "Scene owner",
    );

  const collaboratorId =
    requireUuidValue(
      row.collaborator_id,
      "collaborator",
    );

  if (
    sceneOwnerId ===
    collaboratorId
  ) {
    throw new Error(
      "Canal received an invalid self-collaboration.",
    );
  }

  return {
    sceneOwnerId,

    sceneId:
      requireSceneIdValue(
        row.scene_id,
      ),

    collaboratorId,

    status:
      requireStatus(
        row.status,
      ),

    invitedBy:
      requireUuidValue(
        row.invited_by,
        "inviter",
      ),

    createdAt:
      requireTimestamp(
        row.created_at,
        "created",
      ),

    updatedAt:
      requireTimestamp(
        row.updated_at,
        "updated",
      ),

    respondedAt:
      row.responded_at ===
        null
        ? null
        : requireTimestamp(
            row.responded_at,
            "responded",
          ),
  };
}

function normalizeCollaborativeSceneRow(
  row:
    CollaborativeSceneRow,
): CollaborativeSceneSave {
  const ownerId =
    requireUuidValue(
      row.user_id,
      "Scene owner",
    );

  const sceneId =
    requireSceneIdValue(
      row.id,
    );

  const revision =
    requireRevisionValue(
      row.revision,
    );

  const createdAt =
    requireTimestamp(
      row.created_at,
      "created",
    );

  const updatedAt =
    requireTimestamp(
      row.updated_at,
      "updated",
    );

  const payload =
    requireRecord(
      row.payload,
      "collaborative Scene payload",
    );

  const scene =
    normalizeStoredScene({
      ...payload,
      id:
        sceneId,
      ownerId,
      createdAt,
      updatedAt,
    });

  if (!scene) {
    throw new Error(
      "Canal received an invalid collaborative Scene.",
    );
  }

  return {
    ownerId,
    sceneId,
    revision,
    scene,
    createdAt,
    updatedAt,

    deletedAt:
      row.deleted_at ===
        null
        ? null
        : requireTimestamp(
            row.deleted_at,
            "deleted",
          ),
  };
}

function singleRpcRow(
  value: unknown,
  label: string,
): Record<
  string,
  unknown
> {
  const candidate =
    Array.isArray(
      value,
    )
      ? value.length ===
          1
        ? value[0]
        : null
      : value;

  return requireRecord(
    candidate,
    label,
  );
}

function requireScenePayload(
  value:
    Record<string, unknown>,
  ownerId: string,
  sceneId: string,
): Record<string, unknown> {
  const payload =
    requireRecord(
      value,
      "Scene payload",
    );

  if (
    typeof payload.id ===
      "string" &&
    requireSceneId(
      payload.id,
    ) !==
      sceneId
  ) {
    throw new Error(
      "The Scene payload ID does not match the collaborative Scene.",
    );
  }

  if (
    typeof payload.ownerId ===
      "string" &&
    requireUuid(
      payload.ownerId,
      "Scene payload owner",
    ) !==
      ownerId
  ) {
    throw new Error(
      "The Scene payload owner does not match the collaborative Scene owner.",
    );
  }

  if (
    typeof payload.name !==
      "string" ||
    !payload.name.trim()
  ) {
    throw new Error(
      "A collaborative Scene must have a name.",
    );
  }

  if (
    !Array.isArray(
      payload.tracks,
    ) ||
    payload.tracks.length >
      MAX_SCENE_TRACKS
  ) {
    throw new Error(
      `A collaborative Scene must contain no more than ${MAX_SCENE_TRACKS} tracks.`,
    );
  }

  let serialized: string;

  try {
    serialized =
      JSON.stringify(
        payload,
      );
  } catch {
    throw new Error(
      "The collaborative Scene contains data that cannot be saved.",
    );
  }

  if (
    !serialized ||
    utf8ByteLength(
      serialized,
    ) >
      MAX_SCENE_PAYLOAD_BYTES
  ) {
    throw new Error(
      "The collaborative Scene is too large to save.",
    );
  }

  return payload;
}

function utf8ByteLength(
  value: string,
): number {
  let bytes =
    0;

  for (
    const character of
      value
  ) {
    const codePoint =
      character.codePointAt(
        0,
      ) ?? 0;

    if (
      codePoint <=
      0x7f
    ) {
      bytes +=
        1;
    } else if (
      codePoint <=
      0x7ff
    ) {
      bytes +=
        2;
    } else if (
      codePoint <=
      0xffff
    ) {
      bytes +=
        3;
    } else {
      bytes +=
        4;
    }
  }

  return bytes;
}

function normalizeStatuses(
  values:
    readonly SceneCollaborationStatus[],
): SceneCollaborationStatus[] {
  if (
    values.length ===
    0
  ) {
    throw new Error(
      "Choose at least one Scene collaboration status.",
    );
  }

  return Array.from(
    new Set(
      values.map(
        requireStatus,
      ),
    ),
  );
}

function requireStatus(
  value: unknown,
): SceneCollaborationStatus {
  if (
    value ===
      "pending" ||
    value ===
      "accepted" ||
    value ===
      "declined" ||
    value ===
      "revoked"
  ) {
    return value;
  }

  throw new Error(
    "Canal received an invalid Scene collaboration status.",
  );
}

function requireResponse(
  value: unknown,
): SceneCollaborationResponse {
  if (
    value ===
      "accepted" ||
    value ===
      "declined"
  ) {
    return value;
  }

  throw new Error(
    "A Scene collaboration response must be accepted or declined.",
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
      `A valid ${label} ID is required.`,
    );
  }

  return normalized;
}

function requireUuidValue(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !==
      "string"
  ) {
    throw new Error(
      `Canal received an invalid ${label} ID.`,
    );
  }

  return requireUuid(
    value,
    label,
  );
}

function requireSceneId(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      MAX_SCENE_ID_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "A valid Scene ID is required.",
    );
  }

  return normalized;
}

function requireSceneIdValue(
  value: unknown,
): string {
  if (
    typeof value !==
      "string"
  ) {
    throw new Error(
      "Canal received an invalid Scene ID.",
    );
  }

  return requireSceneId(
    value,
  );
}

function requireRevision(
  value: number,
): number {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value < 1
  ) {
    throw new Error(
      "A positive Scene revision is required.",
    );
  }

  return value;
}

function requireRevisionValue(
  value: unknown,
): number {
  if (
    typeof value ===
      "number"
  ) {
    return requireRevision(
      value,
    );
  }

  if (
    typeof value ===
      "string" &&
    /^\d+$/.test(
      value,
    )
  ) {
    return requireRevision(
      Number(
        value,
      ),
    );
  }

  throw new Error(
    "Canal received an invalid Scene revision.",
  );
}

function requireTimestamp(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim() ||
    !Number.isFinite(
      Date.parse(
        value,
      ),
    )
  ) {
    throw new Error(
      `Canal received an invalid ${label} timestamp.`,
    );
  }

  return value;
}

function requireRecord(
  value: unknown,
  label: string,
): Record<
  string,
  unknown
> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `Canal received an invalid ${label}.`,
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function normalizeLimit(
  value?: number,
): number {
  if (
    value ===
    undefined
  ) {
    return 100;
  }

  if (
    !Number.isFinite(
      value,
    )
  ) {
    throw new Error(
      "A valid collaboration result limit is required.",
    );
  }

  return Math.max(
    1,
    Math.min(
      100,
      Math.round(
        value,
      ),
    ),
  );
}

function isRevisionConflict(
  error:
    SupabaseOperationError,
): boolean {
  return (
    error.code ===
      "40001" &&
    error.message.includes(
      "SCENE_REVISION_CONFLICT",
    )
  );
}

function parseCurrentRevision(
  details:
    | string
    | null
    | undefined,
): number | null {
  const match =
    details?.match(
      /current(?:\s+revision)?\s*[:=]?\s*(\d+)/i,
    );

  if (!match) {
    return null;
  }

  const revision =
    Number(
      match[1],
    );

  return Number.isSafeInteger(
    revision,
  ) &&
    revision > 0
    ? revision
    : null;
}

function operationError(
  action: string,
  error:
    SupabaseOperationError,
): Error {
  return new Error(
    `Canal could not ${action}: ${error.message}`,
  );
}
