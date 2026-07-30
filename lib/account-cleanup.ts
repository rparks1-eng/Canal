import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  STORAGE_KEYS,
} from "./storage-keys";

export type CanalAccountCleanupAction =
  | "authority-rotation"
  | "canal-logout"
  | "spotify-disconnect";

export type CanalAccountCleanupPhase =
  | "cleanup-pending"
  | "cleanup-complete"
  | "signout-pending";

export type CanalAccountCleanupTarget =
  | "app-session-marker"
  | "player-session"
  | "spotify-async-session"
  | "spotify-cache-entries"
  | "spotify-cache-scan"
  | "spotify-library-snapshot"
  | "spotify-return-route"
  | "spotify-secure-session";

export type CanalAccountCleanupIdentity = {
  cleanupId: string;
  ownerId: string;
  sessionGeneration: string;
  sourceSpotifyAccountGeneration: number;
  sourceSpotifyProfileId:
    | string
    | null;
  spotifyAccountGeneration: number;
};

type CanalAccountCleanupSourceIdentity =
  Omit<
    CanalAccountCleanupIdentity,
    "cleanupId"
  >;

export type CanalAccountCleanupRecord =
  CanalAccountCleanupIdentity & {
    version: 2;
    action:
      CanalAccountCleanupAction;
    phase:
      CanalAccountCleanupPhase;
    targets:
      CanalAccountCleanupTarget[];
    cacheKeys: string[];
    updatedAt: string;
  };

const VALID_TARGETS:
  readonly CanalAccountCleanupTarget[] = [
  "app-session-marker",
  "player-session",
  "spotify-async-session",
  "spotify-cache-entries",
  "spotify-cache-scan",
  "spotify-library-snapshot",
  "spotify-return-route",
  "spotify-secure-session",
];

function normalizeSourceIdentity(
  value:
    CanalAccountCleanupSourceIdentity,
): CanalAccountCleanupSourceIdentity {
  const ownerId =
    value.ownerId.trim();

  const sessionGeneration =
    value.sessionGeneration.trim();

  const sourceSpotifyProfileId =
    typeof value.sourceSpotifyProfileId ===
      "string"
      ? value.sourceSpotifyProfileId.trim()
      : null;

  if (
    !ownerId ||
    !sessionGeneration ||
    ownerId.length > 256 ||
    sessionGeneration.length > 256 ||
    (
      sourceSpotifyProfileId !==
        null &&
      (
        !sourceSpotifyProfileId ||
        sourceSpotifyProfileId.length >
          256
      )
    )
  ) {
    throw new Error(
      "Canal cannot scope cleanup without a bounded account and session generation.",
    );
  }

  if (
    !Number.isSafeInteger(
      value.sourceSpotifyAccountGeneration,
    ) ||
    value.sourceSpotifyAccountGeneration <
      0 ||
    !Number.isSafeInteger(
      value.spotifyAccountGeneration,
    ) ||
    value.spotifyAccountGeneration <
      0
  ) {
    throw new Error(
      "Canal received an invalid account cleanup generation.",
    );
  }

  return {
    ownerId,
    sessionGeneration,
    sourceSpotifyAccountGeneration:
      value.sourceSpotifyAccountGeneration,
    sourceSpotifyProfileId,
    spotifyAccountGeneration:
      value.spotifyAccountGeneration,
  };
}

function buildCleanupId(
  identity:
    CanalAccountCleanupSourceIdentity,
  action:
    CanalAccountCleanupAction,
): string {
  const normalized =
    normalizeSourceIdentity(
      identity,
    );

  return [
    "v2",
    action,
    encodeURIComponent(
      normalized.ownerId,
    ),
    encodeURIComponent(
      normalized.sessionGeneration,
    ),
    normalized
      .sourceSpotifyAccountGeneration,
    normalized
      .spotifyAccountGeneration,
  ].join(":");
}

function cleanupRecordKey(
  identity:
    Pick<
      CanalAccountCleanupIdentity,
      "cleanupId"
    >,
): string {
  const cleanupId =
    identity.cleanupId.trim();

  if (!cleanupId) {
    throw new Error(
      "Canal cannot read cleanup without a stable cleanup identity.",
    );
  }

  return (
    STORAGE_KEYS
      .accountCleanupPrefix +
    encodeURIComponent(
      cleanupId,
    )
  );
}

function uniqueTargets(
  targets:
    readonly CanalAccountCleanupTarget[],
): CanalAccountCleanupTarget[] {
  return Array.from(
    new Set(
      targets,
    ),
  );
}

function uniqueCacheKeys(
  cacheKeys:
    readonly string[],
): string[] {
  return Array.from(
    new Set(
      cacheKeys.filter(
        (key) =>
          key.startsWith(
            STORAGE_KEYS
              .spotifyCachePrefix,
          ),
      ),
    ),
  );
}

export function createCanalAccountCleanupRecord(
  identity:
    CanalAccountCleanupSourceIdentity,
  action:
    CanalAccountCleanupAction,
  targets:
    readonly CanalAccountCleanupTarget[],
): CanalAccountCleanupRecord {
  const normalized =
    normalizeSourceIdentity(
      identity,
    );

  return {
    version: 2,
    cleanupId:
      buildCleanupId(
        normalized,
        action,
      ),
    ...normalized,
    action,
    phase:
      "cleanup-pending",
    targets:
      uniqueTargets(
        targets,
      ),
    cacheKeys: [],
    updatedAt:
      new Date().toISOString(),
  };
}

export function updateCanalAccountCleanupRecord(
  record:
    CanalAccountCleanupRecord,
  update: {
    phase?:
      CanalAccountCleanupPhase;
    targets?:
      readonly CanalAccountCleanupTarget[];
    cacheKeys?:
      readonly string[];
  },
): CanalAccountCleanupRecord {
  return {
    ...record,
    phase:
      update.phase ??
      record.phase,
    targets:
      uniqueTargets(
        update.targets ??
          record.targets,
      ),
    cacheKeys:
      uniqueCacheKeys(
        update.cacheKeys ??
          record.cacheKeys,
      ),
    updatedAt:
      new Date().toISOString(),
  };
}

function normalizeRecord(
  value: unknown,
): CanalAccountCleanupRecord | null {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<CanalAccountCleanupRecord>;

  if (
    candidate.version !==
      2 ||
    typeof candidate.cleanupId !==
      "string" ||
    typeof candidate.ownerId !==
      "string" ||
    typeof candidate.sessionGeneration !==
      "string" ||
    typeof candidate.sourceSpotifyAccountGeneration !==
      "number" ||
    typeof candidate.spotifyAccountGeneration !==
      "number" ||
    (
      candidate.action !==
        "authority-rotation" &&
      candidate.action !==
        "canal-logout" &&
      candidate.action !==
        "spotify-disconnect"
    ) ||
    (
      candidate.phase !==
        "cleanup-pending" &&
      candidate.phase !==
        "cleanup-complete" &&
      candidate.phase !==
        "signout-pending"
    ) ||
    !Array.isArray(
      candidate.targets,
    ) ||
    !Array.isArray(
      candidate.cacheKeys,
    )
  ) {
    return null;
  }

  let normalized:
    CanalAccountCleanupSourceIdentity;

  try {
    normalized =
      normalizeSourceIdentity({
        ownerId:
          candidate.ownerId,
        sessionGeneration:
          candidate.sessionGeneration,
        sourceSpotifyAccountGeneration:
          candidate.sourceSpotifyAccountGeneration,
        sourceSpotifyProfileId:
          typeof candidate.sourceSpotifyProfileId ===
            "string"
            ? candidate.sourceSpotifyProfileId
            : null,
        spotifyAccountGeneration:
          candidate.spotifyAccountGeneration,
      });
  } catch {
    return null;
  }

  if (
    candidate.cleanupId !==
      buildCleanupId(
        normalized,
        candidate.action,
      ) ||
    candidate.targets.some(
      (target) =>
        typeof target !==
          "string" ||
        !VALID_TARGETS.includes(
          target as
            CanalAccountCleanupTarget,
        ),
    ) ||
    candidate.cacheKeys.some(
      (key) =>
        typeof key !==
          "string" ||
        !key.startsWith(
          STORAGE_KEYS
            .spotifyCachePrefix,
        ),
    )
  ) {
    return null;
  }

  return {
    version: 2,
    cleanupId:
      candidate.cleanupId,
    ...normalized,
    action:
      candidate.action,
    phase:
      candidate.phase,
    targets:
      uniqueTargets(
        candidate.targets as
          CanalAccountCleanupTarget[],
      ),
    cacheKeys:
      uniqueCacheKeys(
        candidate.cacheKeys as
          string[],
      ),
    updatedAt:
      typeof candidate.updatedAt ===
        "string"
        ? candidate.updatedAt
        : new Date().toISOString(),
  };
}

export async function persistCanalAccountCleanupRecord(
  record:
    CanalAccountCleanupRecord,
): Promise<void> {
  await AsyncStorage.setItem(
    cleanupRecordKey(
      record,
    ),
    JSON.stringify(
      record,
    ),
  );
}

export async function readCanalAccountCleanupRecord(
  identity:
    Pick<
      CanalAccountCleanupIdentity,
      "cleanupId"
    >,
): Promise<CanalAccountCleanupRecord | null> {
  const serialized =
    await AsyncStorage.getItem(
      cleanupRecordKey(
        identity,
      ),
    );

  if (!serialized) {
    return null;
  }

  try {
    const record =
      normalizeRecord(
        JSON.parse(
          serialized,
        ),
      );

    return (
      record?.cleanupId ===
        identity.cleanupId
    )
      ? record
      : null;
  } catch {
    return null;
  }
}

export async function listCanalAccountCleanupRecords(
  filter: {
    ownerId?: string;
    sessionGeneration?: string;
    spotifyAccountGeneration?: number;
  } = {},
): Promise<CanalAccountCleanupRecord[]> {
  const keys =
    await AsyncStorage.getAllKeys();

  const records:
    CanalAccountCleanupRecord[] = [];

  for (
    const key of
    keys
  ) {
    if (
      !key.startsWith(
        STORAGE_KEYS
          .accountCleanupPrefix,
      )
    ) {
      continue;
    }

    const serialized =
      await AsyncStorage.getItem(
        key,
      );

    if (!serialized) {
      continue;
    }

    try {
      const record =
        normalizeRecord(
          JSON.parse(
            serialized,
          ),
        );

      if (
        record &&
        (
          !filter.ownerId ||
          record.ownerId ===
            filter.ownerId
        ) &&
        (
          !filter.sessionGeneration ||
          record.sessionGeneration ===
            filter.sessionGeneration
        ) &&
        (
          filter.spotifyAccountGeneration ===
            undefined ||
          record.spotifyAccountGeneration ===
            filter.spotifyAccountGeneration
        )
      ) {
        records.push(
          record,
        );
      }
    } catch {
      // Malformed local records never become cleanup authority.
    }
  }

  return records.sort(
    (
      first,
      second,
    ) =>
      first.updatedAt.localeCompare(
        second.updatedAt,
      ),
  );
}

export async function removeCanalAccountCleanupRecord(
  identity:
    Pick<
      CanalAccountCleanupIdentity,
      "cleanupId"
    >,
): Promise<void> {
  await AsyncStorage.removeItem(
    cleanupRecordKey(
      identity,
    ),
  );
}
