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

export type SceneCollectionSummary = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  isPublic: boolean;
  sceneCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SceneCollectionItem = {
  collectionId: string;
  ownerId: string;
  sceneId: string;
  position: number;
  createdAt: string;
  scene: StoredScene;
};

export type SceneCollectionDetail =
  SceneCollectionSummary & {
    items: SceneCollectionItem[];
  };

export type SceneCollectionSaveInput = {
  id?: string;
  title: string;
  description: string;
  isPublic: boolean;
  sceneIds:
    readonly string[];
};

export type SceneCollectionErrorKind =
  | "account-changed"
  | "invalid-input"
  | "invalid-response"
  | "not-found"
  | "permission-denied"
  | "request-failed";

export class SceneCollectionError extends Error {
  readonly kind:
    SceneCollectionErrorKind;

  readonly databaseCode:
    | string
    | null;

  constructor(
    kind:
      SceneCollectionErrorKind,
    message: string,
    databaseCode:
      | string
      | null = null,
  ) {
    super(
      message,
    );

    this.name =
      "SceneCollectionError";

    this.kind =
      kind;

    this.databaseCode =
      databaseCode;

    Object.setPrototypeOf(
      this,
      SceneCollectionError.prototype,
    );
  }
}

export function isSceneCollectionError(
  error: unknown,
): error is SceneCollectionError {
  return (
    error instanceof
    SceneCollectionError
  );
}

export type SceneCollectionAccount =
  Readonly<{
    userId: string;
  }>;

export type ListOwnSceneCollectionsOptions =
  Readonly<{
    account?:
      SceneCollectionAccount;
  }>;

type SceneCollectionVisibility =
  | "draft"
  | "public";

type SceneCollectionRow = {
  id: unknown;
  owner_id: unknown;
  title: unknown;
  description: unknown;
  visibility: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type SceneCollectionItemRow = {
  collection_id: unknown;
  owner_id: unknown;
  scene_id: unknown;
  position: unknown;
  created_at: unknown;
};

type SceneRow = {
  user_id: unknown;
  id: unknown;
  payload: unknown;
  created_at: unknown;
  updated_at: unknown;
  deleted_at: unknown;
};

type SupabaseError = {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
};

type NormalizedCollection = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  visibility:
    SceneCollectionVisibility;
  createdAt: string;
  updatedAt: string;
};

type NormalizedCollectionItem = {
  collectionId: string;
  ownerId: string;
  sceneId: string;
  position: number;
  createdAt: string;
};

const COLLECTION_COLUMNS = [
  "id",
  "owner_id",
  "title",
  "description",
  "visibility",
  "created_at",
  "updated_at",
].join(", ");

const COLLECTION_ITEM_COLUMNS = [
  "collection_id",
  "owner_id",
  "scene_id",
  "position",
  "created_at",
].join(", ");

const SCENE_COLUMNS = [
  "user_id",
  "id",
  "payload",
  "created_at",
  "updated_at",
  "deleted_at",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;

const MAX_TITLE_LENGTH =
  80;

const MAX_DESCRIPTION_LENGTH =
  500;

const MAX_COLLECTION_SCENES =
  50;

const MAX_SCENE_ID_LENGTH =
  512;

const MAX_COLLECTION_RESULTS =
  100;

export async function listOwnSceneCollections(
  options:
    ListOwnSceneCollectionsOptions =
      {},
): Promise<SceneCollectionSummary[]> {
  const account =
    await resolveAccount(
      options.account,
    );

  return listCollectionSummaries(
    account,
    account.userId,
    false,
  );
}

export async function listPublicSceneCollections(
  ownerId: string,
): Promise<SceneCollectionSummary[]> {
  const normalizedOwnerId =
    requireUuid(
      ownerId,
      "collection owner",
    );

  const account =
    await captureAccount();

  return listCollectionSummaries(
    account,
    normalizedOwnerId,
    true,
  );
}

export async function loadSceneCollection(
  collectionId: string,
): Promise<SceneCollectionDetail> {
  const normalizedCollectionId =
    requireUuid(
      collectionId,
      "collection",
    );

  const account =
    await captureAccount();

  return loadSceneCollectionForAccount(
    normalizedCollectionId,
    account,
  );
}

export async function saveSceneCollection(
  input:
    SceneCollectionSaveInput,
): Promise<SceneCollectionDetail> {
  const normalizedInput =
    normalizeSaveInput(
      input,
    );

  const account =
    await captureAccount();

  const result =
    await runAccountOperation(
      account,
      () =>
        supabase.rpc(
          "save_creator_scene_collection",
          {
            collection_id_value:
              normalizedInput.id,
            title_value:
              normalizedInput.title,
            description_value:
              normalizedInput.description,
            visibility_value:
              normalizedInput.isPublic
                ? "public"
                : "draft",
            scene_ids_value:
              normalizedInput.sceneIds,
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "save this Scene collection",
      result.error,
    );
  }

  const savedCollection =
    normalizeCollectionRow(
      singleRpcRow(
        result.data,
        "saved Scene collection",
      ) as SceneCollectionRow,
    );

  if (
    savedCollection.ownerId !==
      account.userId
  ) {
    throw invalidResponse(
      "The saved Scene collection has an unexpected owner.",
    );
  }

  return loadSceneCollectionForAccount(
    savedCollection.id,
    account,
  );
}

export async function deleteSceneCollection(
  collectionId: string,
): Promise<boolean> {
  const normalizedCollectionId =
    requireUuid(
      collectionId,
      "collection",
    );

  const account =
    await captureAccount();

  const result =
    await runAccountOperation(
      account,
      () =>
        supabase.rpc(
          "delete_creator_scene_collection",
          {
            collection_id_value:
              normalizedCollectionId,
          },
        ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "delete this Scene collection",
      result.error,
    );
  }

  return true;
}

async function listCollectionSummaries(
  account:
    SceneCollectionAccount,
  ownerId: string,
  publicOnly: boolean,
): Promise<SceneCollectionSummary[]> {
  let query =
    supabase
      .from(
        "creator_scene_collections",
      )
      .select(
        COLLECTION_COLUMNS,
      )
      .eq(
        "owner_id",
        ownerId,
      );

  if (publicOnly) {
    query =
      query.eq(
        "visibility",
        "public",
      );
  }

  const result =
    await runAccountOperation(
      account,
      () =>
        query
          .order(
            "updated_at",
            {
              ascending:
                false,
            },
          )
          .limit(
            MAX_COLLECTION_RESULTS,
          ),
    );

  if (result.error) {
    throw mapDatabaseError(
      "load Scene collections",
      result.error,
    );
  }

  const collections =
    normalizeCollectionRows(
      result.data,
    );

  if (
    collections.some(
      (collection) =>
        collection.ownerId !==
        ownerId,
    )
  ) {
    throw invalidResponse(
      "Canal returned a Scene collection for the wrong owner.",
    );
  }

  if (
    collections.length ===
    0
  ) {
    return [];
  }

  const itemResult =
    await runAccountOperation(
      account,
      () =>
        supabase
          .from(
            "creator_scene_collection_items",
          )
          .select(
            "collection_id",
          )
          .eq(
            "owner_id",
            ownerId,
          )
          .in(
            "collection_id",
            collections.map(
              (collection) =>
                collection.id,
            ),
          ),
    );

  if (itemResult.error) {
    throw mapDatabaseError(
      "load Scene collection counts",
      itemResult.error,
    );
  }

  const counts =
    collectionItemCounts(
      itemResult.data,
      new Set(
        collections.map(
          (collection) =>
            collection.id,
        ),
      ),
    );

  return collections.map(
    (collection) =>
      collectionToSummary(
        collection,
        counts.get(
          collection.id,
        ) ??
          0,
      ),
  );
}

async function loadSceneCollectionForAccount(
  collectionId: string,
  account:
    SceneCollectionAccount,
): Promise<SceneCollectionDetail> {
  const collectionResult =
    await runAccountOperation(
      account,
      () =>
        supabase
          .from(
            "creator_scene_collections",
          )
          .select(
            COLLECTION_COLUMNS,
          )
          .eq(
            "id",
            collectionId,
          )
          .maybeSingle(),
    );

  if (collectionResult.error) {
    throw mapDatabaseError(
      "load this Scene collection",
      collectionResult.error,
    );
  }

  if (!collectionResult.data) {
    throw new SceneCollectionError(
      "not-found",
      "This Scene collection is unavailable or private.",
      "P0002",
    );
  }

  const collection =
    normalizeCollectionRow(
      collectionResult.data as
        unknown as
        SceneCollectionRow,
    );

  if (
    collection.id !==
    collectionId
  ) {
    throw invalidResponse(
      "Canal returned the wrong Scene collection.",
    );
  }

  const itemResult =
    await runAccountOperation(
      account,
      () =>
        supabase
          .from(
            "creator_scene_collection_items",
          )
          .select(
            COLLECTION_ITEM_COLUMNS,
          )
          .eq(
            "collection_id",
            collection.id,
          )
          .eq(
            "owner_id",
            collection.ownerId,
          )
          .order(
            "position",
            {
              ascending:
                true,
            },
          )
          .limit(
            MAX_COLLECTION_SCENES,
          ),
    );

  if (itemResult.error) {
    throw mapDatabaseError(
      "load this Scene collection's items",
      itemResult.error,
    );
  }

  const normalizedItems =
    normalizeCollectionItemRows(
      itemResult.data,
      collection,
    );

  if (
    normalizedItems.length ===
    0
  ) {
    return {
      ...collectionToSummary(
        collection,
        0,
      ),
      items: [],
    };
  }

  const sceneResult =
    await runAccountOperation(
      account,
      () =>
        supabase
          .from(
            "scenes",
          )
          .select(
            SCENE_COLUMNS,
          )
          .eq(
            "user_id",
            collection.ownerId,
          )
          .in(
            "id",
            normalizedItems.map(
              (item) =>
                item.sceneId,
            ),
          )
          .is(
            "deleted_at",
            null,
          ),
    );

  if (sceneResult.error) {
    throw mapDatabaseError(
      "load this Scene collection's Scenes",
      sceneResult.error,
    );
  }

  const scenes =
    normalizeSceneRows(
      sceneResult.data,
      collection.ownerId,
    );

  const items =
    normalizedItems.flatMap(
      (
        item,
      ): SceneCollectionItem[] => {
        const scene =
          scenes.get(
            item.sceneId,
          );

        if (!scene) {
          if (
            collection.ownerId ===
            account.userId
          ) {
            throw invalidResponse(
              `Collection Scene "${item.sceneId}" is missing or unavailable.`,
            );
          }

          return [];
        }

        return [
          {
            ...item,
            scene,
          },
        ];
      },
    );

  return {
    ...collectionToSummary(
      collection,
      items.length,
    ),
    items,
  };
}

async function captureAccount(): Promise<
  SceneCollectionAccount
> {
  return {
    userId:
      await currentUserId(),
  };
}

async function resolveAccount(
  account:
    | SceneCollectionAccount
    | undefined,
): Promise<SceneCollectionAccount> {
  if (
    account === undefined
  ) {
    return captureAccount();
  }

  const resolved = {
    userId:
      requireUuid(
        account.userId,
        "Scene collection account",
      ),
  };

  await assertAccount(
    resolved,
  );

  return resolved;
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
      "verify the current Scene collection account",
      error,
    );
  }

  if (!user) {
    throw new SceneCollectionError(
      "permission-denied",
      "You must be signed into Canal to manage Scene collections.",
      "42501",
    );
  }

  return requireUuid(
    user.id,
    "signed-in user",
  );
}

async function assertAccount(
  account:
    SceneCollectionAccount,
): Promise<void> {
  const actualUserId =
    await currentUserId();

  if (
    actualUserId !==
    account.userId
  ) {
    throw new SceneCollectionError(
      "account-changed",
      "The signed-in Canal account changed while Scene collections were loading or saving. Please try again.",
    );
  }
}

async function runAccountOperation<
  Result,
>(
  account:
    SceneCollectionAccount,
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

function normalizeSaveInput(
  input:
    SceneCollectionSaveInput,
): {
  id:
    | string
    | null;
  title: string;
  description: string;
  isPublic: boolean;
  sceneIds: string[];
} {
  const title =
    normalizeBoundedText(
      input.title,
      "collection title",
      1,
      MAX_TITLE_LENGTH,
    );

  const description =
    normalizeBoundedText(
      input.description,
      "collection description",
      0,
      MAX_DESCRIPTION_LENGTH,
    );

  if (
    typeof input.isPublic !==
      "boolean"
  ) {
    throw invalidInput(
      "Collection visibility must be public or draft.",
    );
  }

  if (
    !Array.isArray(
      input.sceneIds,
    ) ||
    input.sceneIds.length >
      MAX_COLLECTION_SCENES
  ) {
    throw invalidInput(
      `A collection can contain at most ${MAX_COLLECTION_SCENES} Scenes.`,
    );
  }

  const sceneIds =
    input.sceneIds.map(
      normalizeSceneId,
    );

  if (
    new Set(
      sceneIds,
    ).size !==
    sceneIds.length
  ) {
    throw invalidInput(
      "Collection Scene IDs must be unique.",
    );
  }

  if (
    input.isPublic &&
    sceneIds.length ===
      0
  ) {
    throw invalidInput(
      "A public collection must contain at least one Scene.",
    );
  }

  return {
    id:
      input.id ===
        undefined
        ? null
        : requireUuid(
            input.id,
            "collection",
          ),
    title,
    description,
    isPublic:
      input.isPublic,
    sceneIds,
  };
}

function normalizeCollectionRows(
  value: unknown,
): NormalizedCollection[] {
  if (!Array.isArray(value)) {
    throw invalidResponse(
      "Canal received an invalid Scene collection list.",
    );
  }

  return value.map(
    (row) =>
      normalizeCollectionRow(
        requireRecord(
          row,
          "Scene collection",
        ) as SceneCollectionRow,
      ),
  );
}

function normalizeCollectionRow(
  row:
    SceneCollectionRow,
): NormalizedCollection {
  return {
    id:
      requireUuidValue(
        row.id,
        "collection",
      ),
    ownerId:
      requireUuidValue(
        row.owner_id,
        "collection owner",
      ),
    title:
      requireResponseText(
        row.title,
        "collection title",
        1,
        MAX_TITLE_LENGTH,
      ),
    description:
      requireResponseText(
        row.description,
        "collection description",
        0,
        MAX_DESCRIPTION_LENGTH,
      ),
    visibility:
      requireVisibility(
        row.visibility,
      ),
    createdAt:
      requireTimestamp(
        row.created_at,
        "collection creation",
      ),
    updatedAt:
      requireTimestamp(
        row.updated_at,
        "collection update",
      ),
  };
}

function collectionToSummary(
  collection:
    NormalizedCollection,
  sceneCount: number,
): SceneCollectionSummary {
  return {
    id:
      collection.id,
    ownerId:
      collection.ownerId,
    title:
      collection.title,
    description:
      collection.description,
    isPublic:
      collection.visibility ===
      "public",
    sceneCount,
    createdAt:
      collection.createdAt,
    updatedAt:
      collection.updatedAt,
  };
}

function collectionItemCounts(
  value: unknown,
  expectedCollectionIds:
    ReadonlySet<string>,
): Map<string, number> {
  if (!Array.isArray(value)) {
    throw invalidResponse(
      "Canal received invalid Scene collection counts.",
    );
  }

  const counts =
    new Map<
      string,
      number
    >();

  for (
    const valueRow of
      value
  ) {
    const row =
      requireRecord(
        valueRow,
        "Scene collection count",
      );

    const collectionId =
      requireUuidValue(
        row.collection_id,
        "collection",
      );

    if (
      !expectedCollectionIds.has(
        collectionId,
      )
    ) {
      throw invalidResponse(
        "Canal returned a Scene count for the wrong collection.",
      );
    }

    counts.set(
      collectionId,
      (
        counts.get(
          collectionId,
        ) ??
        0
      ) +
        1,
    );
  }

  return counts;
}

function normalizeCollectionItemRows(
  value: unknown,
  collection:
    NormalizedCollection,
): NormalizedCollectionItem[] {
  if (!Array.isArray(value)) {
    throw invalidResponse(
      "Canal received an invalid Scene collection item list.",
    );
  }

  const items =
    value.map(
      (valueRow) => {
        const row =
          requireRecord(
            valueRow,
            "Scene collection item",
          ) as SceneCollectionItemRow;

        const item = {
          collectionId:
            requireUuidValue(
              row.collection_id,
              "collection",
            ),
          ownerId:
            requireUuidValue(
              row.owner_id,
              "collection owner",
            ),
          sceneId:
            requireSceneIdValue(
              row.scene_id,
            ),
          position:
            requirePosition(
              row.position,
            ),
          createdAt:
            requireTimestamp(
              row.created_at,
              "collection item creation",
            ),
        };

        if (
          item.collectionId !==
            collection.id ||
          item.ownerId !==
            collection.ownerId
        ) {
          throw invalidResponse(
            "Canal returned an item for the wrong Scene collection.",
          );
        }

        return item;
      },
    )
      .sort(
        (
          first,
          second,
        ) =>
          first.position -
          second.position,
      );

  if (
    items.length >
      MAX_COLLECTION_SCENES ||
    new Set(
      items.map(
        (item) =>
          item.sceneId,
      ),
    ).size !==
      items.length ||
    new Set(
      items.map(
        (item) =>
          item.position,
      ),
    ).size !==
      items.length
  ) {
    throw invalidResponse(
      "Canal received duplicate or excessive Scene collection items.",
    );
  }

  return items;
}

function normalizeSceneRows(
  value: unknown,
  expectedOwnerId: string,
): Map<string, StoredScene> {
  if (!Array.isArray(value)) {
    throw invalidResponse(
      "Canal received an invalid collection Scene list.",
    );
  }

  const scenes =
    new Map<
      string,
      StoredScene
    >();

  for (
    const valueRow of
      value
  ) {
    const row =
      requireRecord(
        valueRow,
        "collection Scene",
      ) as SceneRow;

    const ownerId =
      requireUuidValue(
        row.user_id,
        "Scene owner",
      );

    if (
      ownerId !==
      expectedOwnerId
    ) {
      throw invalidResponse(
        "Canal returned a Scene from the wrong collection owner.",
      );
    }

    const sceneId =
      requireSceneIdValue(
        row.id,
      );

    if (
      row.deleted_at !==
      null
    ) {
      continue;
    }

    const createdAt =
      requireTimestamp(
        row.created_at,
        "Scene creation",
      );

    const updatedAt =
      requireTimestamp(
        row.updated_at,
        "Scene update",
      );

    const payload =
      requireRecord(
        row.payload,
        "collection Scene payload",
      );

    if (
      typeof payload.name !==
        "string" ||
      !payload.name.trim() ||
      !Array.isArray(
        payload.tracks,
      )
    ) {
      throw invalidResponse(
        "Canal received an invalid collection Scene payload.",
      );
    }

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
      throw invalidResponse(
        "Canal could not normalize a collection Scene.",
      );
    }

    if (
      scenes.has(
        sceneId,
      )
    ) {
      throw invalidResponse(
        "Canal returned a duplicate collection Scene.",
      );
    }

    scenes.set(
      sceneId,
      scene,
    );
  }

  return scenes;
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
    throw invalidResponse(
      `Canal received an invalid ${label}.`,
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function normalizeBoundedText(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (
    typeof value !==
      "string"
  ) {
    throw invalidInput(
      `A valid ${label} is required.`,
    );
  }

  const normalized =
    value.trim();

  const length =
    Array.from(
      normalized,
    ).length;

  if (
    length < minimum ||
    length > maximum ||
    CONTROL_CHARACTER_PATTERN.test(
      normalized,
    )
  ) {
    throw invalidInput(
      `The ${label} must contain ${minimum}–${maximum} characters.`,
    );
  }

  return normalized;
}

function requireResponseText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (
    typeof value !==
      "string"
  ) {
    throw invalidResponse(
      `Canal received an invalid ${label}.`,
    );
  }

  const length =
    Array.from(
      value,
    ).length;

  if (
    length < minimum ||
    length > maximum ||
    CONTROL_CHARACTER_PATTERN.test(
      value,
    )
  ) {
    throw invalidResponse(
      `Canal received an invalid ${label}.`,
    );
  }

  return value;
}

function requireVisibility(
  value: unknown,
): SceneCollectionVisibility {
  if (
    value ===
      "draft" ||
    value ===
      "public"
  ) {
    return value;
  }

  throw invalidResponse(
    "Canal received an invalid Scene collection visibility.",
  );
}

function requireUuid(
  value: string,
  label: string,
): string {
  if (
    typeof value !==
      "string"
  ) {
    throw invalidInput(
      `A valid ${label} ID is required.`,
    );
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw invalidInput(
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
    throw invalidResponse(
      `Canal received an invalid ${label} ID.`,
    );
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw invalidResponse(
      `Canal received an invalid ${label} ID.`,
    );
  }

  return normalized;
}

function normalizeSceneId(
  value: string,
): string {
  if (
    typeof value !==
      "string"
  ) {
    throw invalidInput(
      "Collection Scene IDs must be non-empty strings.",
    );
  }

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
    throw invalidInput(
      "Collection Scene IDs must be non-empty strings.",
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
    throw invalidResponse(
      "Canal received an invalid collection Scene ID.",
    );
  }

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
    throw invalidResponse(
      "Canal received an invalid collection Scene ID.",
    );
  }

  return normalized;
}

function requirePosition(
  value: unknown,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0 ||
    value >=
      MAX_COLLECTION_SCENES
  ) {
    throw invalidResponse(
      "Canal received an invalid Scene collection position.",
    );
  }

  return value;
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
    throw invalidResponse(
      `Canal received an invalid ${label} timestamp.`,
    );
  }

  return value;
}

function mapDatabaseError(
  action: string,
  error:
    SupabaseError,
): SceneCollectionError {
  const code =
    error.code ??
    null;

  if (
    code ===
    "P0002"
  ) {
    return new SceneCollectionError(
      "not-found",
      `Canal could not ${action}: ${error.message}`,
      code,
    );
  }

  if (
    code ===
    "42501"
  ) {
    return new SceneCollectionError(
      "permission-denied",
      `Canal could not ${action}: ${error.message}`,
      code,
    );
  }

  if (
    code ===
    "22023"
  ) {
    return new SceneCollectionError(
      "invalid-input",
      `Canal could not ${action}: ${error.message}`,
      code,
    );
  }

  return new SceneCollectionError(
    "request-failed",
    `Canal could not ${action}: ${error.message}`,
    code,
  );
}

function invalidInput(
  message: string,
): SceneCollectionError {
  return new SceneCollectionError(
    "invalid-input",
    message,
    "22023",
  );
}

function invalidResponse(
  message: string,
): SceneCollectionError {
  return new SceneCollectionError(
    "invalid-response",
    message,
  );
}
