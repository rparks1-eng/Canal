import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  Platform,
} from "react-native";

import {
  CANAL_REQUIRED_SPOTIFY_SCOPES,
  CANAL_SPOTIFY_EXPORT_SCOPES,
  getSpotifyClientId,
} from "./spotify-config";
import {
  isSupabaseConfigured,
  supabase,
} from "./supabase";

import {
  getSpotifyCacheAuthorityNamespace,
  getSpotifyCacheNamespace,
  STORAGE_KEYS,
} from "./storage-keys";

import {
  createCanalAccountCleanupRecord,
  listCanalAccountCleanupRecords,
  persistCanalAccountCleanupRecord,
  readCanalAccountCleanupRecord,
  removeCanalAccountCleanupRecord,
  updateCanalAccountCleanupRecord,
} from "./account-cleanup";

import type {
  CanalAccountCleanupRecord,
  CanalAccountCleanupTarget,
} from "./account-cleanup";

import {
  getCanalAccountSessionGeneration,
  readCanalAccountSessionGeneration,
  recordCanalAccountSession,
} from "./canal-auth";

export type SpotifyImage = {
  url: string;
  height?: number | null;
  width?: number | null;
};

export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  email?: string;
  country?: string;
  product?: string;
  images?: SpotifyImage[];

  external_urls?: {
    spotify?: string;
  };

  followers?: {
    total?: number;
  };

  [key: string]: unknown;
};

export type SpotifySession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  expiresIn?: number;
  tokenType: string;
  scope: string;
  profile: SpotifyProfile;

  [key: string]: unknown;
};

export type SpotifyConnectionGuard = {
  profileId: string;
  connectionGeneration: number;
  connectionAuthority: number;
  canalOwnerId: string | null;
  canalAccountGeneration: number;
};

export type SpotifyGuardedSession = {
  session: SpotifySession;
  connectionGuard: SpotifyConnectionGuard;
};

export type SpotifyCanalAccountGuard = {
  ownerId: string | null;
  accountGeneration: number;
  configured: boolean;
};

export type SpotifyAccountScope = {
  ownerId: string;
  sessionGeneration: string;
  spotifyAccountGeneration: number;
};

export type SpotifyCacheScope =
  SpotifyAccountScope & {
    spotifyProfileId: string;
  };

export type SpotifySessionCleanupResult = {
  accountGuard:
    SpotifyCanalAccountGuard;
  cleanupIncomplete:
    CanalAccountCleanupRecord | null;
  cleanupPersisted: boolean;
};

export type SpotifyConnectionStateForAccount =
  | "account-changed"
  | "connected"
  | "disconnected"
  | "unknown";

export type SaveSpotifySessionOptions = {
  syncLibrary?: boolean;
  accountGuard?:
    SpotifyCanalAccountGuard;
  operationCommitGuard?:
    () => boolean;
  onLibrarySyncError?:
    (error: unknown) => void;
};

type SpotifyProviderRotationCommit = {
  accountGuard:
    SpotifyCanalAccountGuard;
  complete: () => Promise<void>;
  rollback: () => Promise<void>;
};

type SpotifySessionPersistenceCommit = {
  rollback: () => Promise<void>;
};

export class SpotifyProviderCleanupIncompleteError extends Error {
  readonly accountGuard:
    SpotifyCanalAccountGuard;
  readonly cleanupRecord:
    CanalAccountCleanupRecord;

  constructor(
    accountGuard:
      SpotifyCanalAccountGuard,
    cleanupRecord:
      CanalAccountCleanupRecord,
  ) {
    super(
      "Canal must finish the prior Spotify provider cache cleanup before connecting the replacement account.",
    );

    this.name =
      "SpotifyProviderCleanupIncompleteError";
    this.accountGuard =
      Object.freeze({
        ...accountGuard,
      });
    this.cleanupRecord =
      Object.freeze({
        ...cleanupRecord,
        cacheKeys: [
          ...cleanupRecord.cacheKeys,
        ],
        targets: [
          ...cleanupRecord.targets,
        ],
      });
  }
}

export type SpotifyAccessIssue =
  | "authorization"
  | "permission";

export class SpotifyAccessError extends Error {
  issue: SpotifyAccessIssue;
  status: 401 | 403;
  missingScopes: string[];
  authorizationInvalid: boolean;

  constructor(
    issue: SpotifyAccessIssue,
    message: string,
    missingScopes: string[] = [],
  ) {
    super(message);

    this.name =
      "SpotifyAccessError";

    this.issue =
      issue;

    this.status =
      issue ===
        "permission"
        ? 403
        : 401;

    this.missingScopes =
      missingScopes;

    this.authorizationInvalid =
      issue ===
      "authorization";
  }
}

export const SPOTIFY_ASYNC_STORAGE_KEY =
  "@canal/spotify-session";

export const SPOTIFY_SECURE_STORAGE_KEY =
  "canal.spotify-session";

export const SPOTIFY_ACCOUNT_AUTHORITY_KEY =
  "@canal/credential-account-authority";

const SPOTIFY_SESSION_ENVELOPE_VERSION =
  2;

const SPOTIFY_ACCOUNT_AUTHORITY_VERSION =
  2;

export const SPOTIFY_SESSION_CLEANUP_TARGETS:
  readonly CanalAccountCleanupTarget[] = [
  "spotify-async-session",
  "spotify-secure-session",
  "spotify-library-snapshot",
  "spotify-return-route",
  "spotify-cache-scan",
];

type SpotifyAccountAuthority = {
  version: number;
  ownerId: string | null;
  sessionGeneration:
    string | null;
  generation: number;
};

type PersistedSpotifySessionEnvelope = {
  version: number;
  ownerId: string;
  accountGeneration: number;
  session: SpotifySession;
};

let memorySession:
  SpotifySession | null = null;

let memorySessionAccountGuard:
  SpotifyCanalAccountGuard | null =
    null;

let refreshInFlight:
  | {
      connectionGeneration: number;
      connectionAuthority: number;
      promise:
        Promise<SpotifySession>;
    }
  | null =
    null;

let spotifyConnectionGeneration =
  0;

let spotifyConnectionAuthority =
  0;

let sessionMutationTail:
  Promise<void> =
    Promise.resolve();

export function getSpotifyConnectionGeneration(): number {
  return spotifyConnectionGeneration;
}

function advanceSpotifyConnectionAuthority(): void {
  spotifyConnectionGeneration +=
    1;
  spotifyConnectionAuthority +=
    1;
}

function accountGuardFromConnectionGuard(
  connectionGuard:
    SpotifyConnectionGuard,
): SpotifyCanalAccountGuard {
  return {
    ownerId:
      connectionGuard.canalOwnerId,
    accountGeneration:
      connectionGuard.canalAccountGeneration,
    configured:
      isSupabaseConfigured,
  };
}

function isSpotifyConnectionGuardCurrentUnlocked(
  connectionGuard:
    SpotifyConnectionGuard,
): boolean {
  return (
    connectionGuard
      .connectionGeneration ===
      spotifyConnectionGeneration &&
    connectionGuard
      .connectionAuthority ===
      spotifyConnectionAuthority &&
    Boolean(memorySession) &&
    memorySession?.profile.id ===
      connectionGuard.profileId &&
    isSameCanalAccountGuard(
      memorySessionAccountGuard,
      accountGuardFromConnectionGuard(
        connectionGuard,
      ),
    )
  );
}

async function assertSpotifyConnectionGuardCurrentUnlocked(
  connectionGuard:
    SpotifyConnectionGuard,
): Promise<void> {
  await assertCanalAccountGuardCurrentUnlocked(
    accountGuardFromConnectionGuard(
      connectionGuard,
    ),
  );

  if (
    !isSpotifyConnectionGuardCurrentUnlocked(
      connectionGuard,
    )
  ) {
    throw new SpotifySessionChangedError();
  }
}

function captureSpotifyConnectionGuardUnlocked(
  session: SpotifySession,
): SpotifyConnectionGuard {
  if (
    !memorySession ||
    memorySession !==
      session ||
    !memorySessionAccountGuard
  ) {
    throw new SpotifySessionChangedError();
  }

  return {
    profileId:
      session.profile.id,
    connectionGeneration:
      spotifyConnectionGeneration,
    connectionAuthority:
      spotifyConnectionAuthority,
    canalOwnerId:
      memorySessionAccountGuard.ownerId,
    canalAccountGeneration:
      memorySessionAccountGuard.accountGeneration,
  };
}

async function runSessionMutation<
  Result,
>(
  mutation:
    () => Promise<Result>,
): Promise<Result> {
  const previousMutation =
    sessionMutationTail;

  let releaseMutation:
    () => void =
      () => {};

  sessionMutationTail =
    new Promise<void>(
      (resolve) => {
        releaseMutation =
          resolve;
      },
    );

  await previousMutation;

  try {
    return await mutation();
  } finally {
    releaseMutation();
  }
}

function isSameCanalAccountGuard(
  first:
    SpotifyCanalAccountGuard | null,
  second:
    SpotifyCanalAccountGuard | null,
): boolean {
  return (
    Boolean(first) &&
    Boolean(second) &&
    first?.configured ===
      second?.configured &&
    first?.ownerId ===
      second?.ownerId &&
    first?.accountGeneration ===
      second?.accountGeneration
  );
}

function normalizeSpotifyAccountAuthority(
  value: unknown,
): SpotifyAccountAuthority | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<SpotifyAccountAuthority>;

  if (
    (
      candidate.version !==
        1 &&
      candidate.version !==
        SPOTIFY_ACCOUNT_AUTHORITY_VERSION
    ) ||
    (
      candidate.ownerId !==
        null &&
      typeof candidate.ownerId !==
        "string"
    ) ||
    typeof candidate.generation !==
      "number" ||
    !Number.isSafeInteger(
      candidate.generation,
    ) ||
    candidate.generation < 1
  ) {
    return null;
  }

  return {
    version:
      SPOTIFY_ACCOUNT_AUTHORITY_VERSION,
    ownerId:
      candidate.ownerId,
    sessionGeneration:
      (
        candidate.version ===
          SPOTIFY_ACCOUNT_AUTHORITY_VERSION &&
        typeof candidate.sessionGeneration ===
          "string" &&
        candidate.sessionGeneration.trim()
      )
        ? candidate.sessionGeneration.trim()
        : `legacy-authority:${candidate.generation}`,
    generation:
      candidate.generation,
  };
}

async function readSpotifyAccountAuthority(): Promise<{
  authority:
    SpotifyAccountAuthority | null;
  existed: boolean;
}> {
  const serialized =
    await AsyncStorage.getItem(
      SPOTIFY_ACCOUNT_AUTHORITY_KEY,
    );

  if (!serialized) {
    return {
      authority: null,
      existed: false,
    };
  }

  try {
    return {
      authority:
        normalizeSpotifyAccountAuthority(
          JSON.parse(
            serialized,
          ),
        ),
      existed: true,
    };
  } catch {
    return {
      authority: null,
      existed: true,
    };
  }
}

type CurrentCanalAccountIdentity = {
  ownerId: string | null;
  sessionGeneration:
    string | null;
};

async function readCurrentCanalAccountIdentity(): Promise<
  CurrentCanalAccountIdentity
> {
  if (!isSupabaseConfigured) {
    return {
      ownerId: null,
      sessionGeneration:
        null,
    };
  }

  const {
    data: {
      session,
    },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const ownerId =
    session?.user.id;

  const normalizedOwnerId =
    (
    typeof ownerId ===
      "string" &&
    ownerId.length > 0
  )
    ? ownerId
    : null;

  const sessionGeneration =
    readCanalAccountSessionGeneration(
      session,
    );

  recordCanalAccountSession(
    normalizedOwnerId,
    sessionGeneration,
  );

  return {
    ownerId:
      normalizedOwnerId,
    sessionGeneration:
      normalizedOwnerId
        ? (
            sessionGeneration ??
            getCanalAccountSessionGeneration()
          )
        : null,
  };
}

async function persistSpotifyAccountAuthority(
  authority: SpotifyAccountAuthority,
): Promise<void> {
  await AsyncStorage.setItem(
    SPOTIFY_ACCOUNT_AUTHORITY_KEY,
    JSON.stringify(
      authority,
    ),
  );
}

function assertOperationCommitCurrent(
  operationCommitGuard?:
    () => boolean,
): void {
  if (
    operationCommitGuard &&
    !operationCommitGuard()
  ) {
    throw new SpotifySessionChangedError();
  }
}

async function restoreAsyncStorageValueIfExact(
  key: string,
  expectedCurrentValue:
    string | null,
  previousValue:
    string | null,
): Promise<void> {
  if (
    expectedCurrentValue ===
      previousValue
  ) {
    return;
  }

  const currentValue =
    await AsyncStorage.getItem(
      key,
    );

  if (
    currentValue !==
      expectedCurrentValue
  ) {
    return;
  }

  if (previousValue === null) {
    await AsyncStorage.removeItem(
      key,
    );
  } else {
    await AsyncStorage.setItem(
      key,
      previousValue,
    );
  }
}

async function restoreSecureStorageValueIfExact(
  expectedCurrentValue:
    string | null,
  previousValue:
    string | null,
): Promise<void> {
  if (
    Platform.OS ===
      "web"
  ) {
    return;
  }

  if (
    expectedCurrentValue ===
      previousValue
  ) {
    return;
  }

  const currentValue =
    await SecureStore.getItemAsync(
      SPOTIFY_SECURE_STORAGE_KEY,
    );

  if (
    currentValue !==
      expectedCurrentValue
  ) {
    return;
  }

  if (previousValue === null) {
    await SecureStore.deleteItemAsync(
      SPOTIFY_SECURE_STORAGE_KEY,
    );
  } else {
    await SecureStore.setItemAsync(
      SPOTIFY_SECURE_STORAGE_KEY,
      previousValue,
    );
  }
}

async function completeAutomaticAuthorityCleanup(
  sourceAuthority:
    SpotifyAccountAuthority | null,
): Promise<void> {
  const sourceOwnerId =
    sourceAuthority?.ownerId ??
    "legacy-unowned";

  const sourceSessionGeneration =
    sourceAuthority
      ?.sessionGeneration ??
    `legacy-authority:${sourceAuthority?.generation ?? 0}`;

  const sourceGeneration =
    sourceAuthority?.generation ??
    0;

  const sourceSpotifyProfileId =
    await readSpotifyProfileIdForGuardUnlocked({
      ownerId:
        sourceAuthority?.ownerId ??
        null,
      accountGeneration:
        sourceGeneration,
      configured:
        Boolean(
          sourceAuthority,
        ),
    });

  const requestedRecord =
    createCanalAccountCleanupRecord(
      {
        ownerId:
          sourceOwnerId,
        sessionGeneration:
          sourceSessionGeneration,
        sourceSpotifyAccountGeneration:
          sourceGeneration,
        sourceSpotifyProfileId:
          sourceSpotifyProfileId,
        spotifyAccountGeneration:
          sourceGeneration + 1,
      },
      "authority-rotation",
      SPOTIFY_SESSION_CLEANUP_TARGETS,
    );

  let durableRecord =
    await readCanalAccountCleanupRecord(
      requestedRecord,
    );

  if (!durableRecord) {
    await persistCanalAccountCleanupRecord(
      requestedRecord,
    );

    durableRecord =
      await readCanalAccountCleanupRecord(
        requestedRecord,
      );
  }

  if (!durableRecord) {
    throw new Error(
      "Canal could not safely record the previous account cleanup before changing Spotify ownership.",
    );
  }

  memorySession =
    null;
  memorySessionAccountGuard =
    null;
  refreshInFlight =
    null;

  if (
    durableRecord.phase ===
      "cleanup-pending" &&
    hasSpotifyCleanupTargets(
      durableRecord,
    )
  ) {
    const cleanupResult =
      await performSpotifyCleanupTargets(
        durableRecord,
      );

    durableRecord =
      cleanupResult.record;

    if (
      hasSpotifyCleanupTargets(
        durableRecord,
      ) ||
      !cleanupResult.persisted
    ) {
      throw new Error(
        "Canal must finish the previous account's Spotify cleanup before loading this account.",
      );
    }
  }

  const completedRecord =
    durableRecord.phase ===
      "cleanup-complete"
      ? durableRecord
      : updateCanalAccountCleanupRecord(
          durableRecord,
          {
            phase:
              "cleanup-complete",
          },
        );

  await persistCanalAccountCleanupRecord(
    completedRecord,
  );

  await removeCanalAccountCleanupRecord(
    completedRecord,
  );
}

async function rotateSpotifyProviderAuthorityUnlocked(
  sourceGuard:
    SpotifyCanalAccountGuard,
  sourceProfileId: string,
  operationCommitGuard?:
    () => boolean,
): Promise<SpotifyProviderRotationCommit> {
  if (
    !sourceGuard.configured ||
    !sourceGuard.ownerId
  ) {
    return {
      accountGuard:
        sourceGuard,
      complete:
        async () => {},
      rollback:
        async () => {},
    };
  }

  assertOperationCommitCurrent(
    operationCommitGuard,
  );

  const currentIdentity =
    await readCurrentCanalAccountIdentity();

  assertOperationCommitCurrent(
    operationCommitGuard,
  );

  if (
    currentIdentity.ownerId !==
      sourceGuard.ownerId ||
    !currentIdentity.sessionGeneration
  ) {
    throw new SpotifySessionChangedError();
  }

  const nextGuard:
    SpotifyCanalAccountGuard = {
    ...sourceGuard,
    accountGeneration:
      sourceGuard.accountGeneration +
      1,
  };

  const requestedRecord =
    createCanalAccountCleanupRecord(
      {
        ownerId:
          sourceGuard.ownerId,
        sessionGeneration:
          currentIdentity
            .sessionGeneration,
        sourceSpotifyAccountGeneration:
          sourceGuard
            .accountGeneration,
        sourceSpotifyProfileId:
          sourceProfileId,
        spotifyAccountGeneration:
          nextGuard.accountGeneration,
      },
      "authority-rotation",
      [
        "spotify-cache-scan",
      ],
    );

  const nextAuthority:
    SpotifyAccountAuthority = {
    version:
      SPOTIFY_ACCOUNT_AUTHORITY_VERSION,
    ownerId:
      sourceGuard.ownerId,
    sessionGeneration:
      currentIdentity
        .sessionGeneration,
    generation:
      nextGuard.accountGeneration,
  };

  const previousAuthorityValue =
    await AsyncStorage.getItem(
      SPOTIFY_ACCOUNT_AUTHORITY_KEY,
    );

  assertOperationCommitCurrent(
    operationCommitGuard,
  );

  const nextAuthorityValue =
    JSON.stringify(
      nextAuthority,
    );

  const previousMemorySession =
    memorySession;

  const previousMemoryAccountGuard =
    memorySessionAccountGuard;

  let markerPersisted =
    false;

  let authorityPersisted =
    false;

  const rollback =
    async (): Promise<void> => {
      if (authorityPersisted) {
        await restoreAsyncStorageValueIfExact(
          SPOTIFY_ACCOUNT_AUTHORITY_KEY,
          nextAuthorityValue,
          previousAuthorityValue,
        );
      }

      if (
        memorySession ===
          null &&
        memorySessionAccountGuard ===
          null
      ) {
        memorySession =
          previousMemorySession;
        memorySessionAccountGuard =
          previousMemoryAccountGuard;
      }

      if (markerPersisted) {
        const currentRecord =
          await readCanalAccountCleanupRecord(
            requestedRecord,
          );

        if (
          currentRecord?.cleanupId ===
            requestedRecord.cleanupId
        ) {
          await removeCanalAccountCleanupRecord(
            currentRecord,
          );
        }
      }
    };

  try {
    await persistCanalAccountCleanupRecord(
      requestedRecord,
    );
    markerPersisted =
      true;

    assertOperationCommitCurrent(
      operationCommitGuard,
    );

    const durableRecord =
      await readCanalAccountCleanupRecord(
        requestedRecord,
      );

    assertOperationCommitCurrent(
      operationCommitGuard,
    );

    if (!durableRecord) {
      throw new Error(
        "Canal could not safely record the prior Spotify provider cleanup.",
      );
    }

    await persistSpotifyAccountAuthority(
      nextAuthority,
    );
    authorityPersisted =
      true;

    assertOperationCommitCurrent(
      operationCommitGuard,
    );

    const persistedAuthority =
      (
        await readSpotifyAccountAuthority()
      ).authority;

    assertOperationCommitCurrent(
      operationCommitGuard,
    );

    if (
      persistedAuthority?.ownerId !==
        nextAuthority.ownerId ||
      persistedAuthority.sessionGeneration !==
        nextAuthority.sessionGeneration ||
      persistedAuthority.generation !==
        nextAuthority.generation
    ) {
      throw new Error(
        "Canal could not verify the rotated Spotify provider authority.",
      );
    }

    advanceSpotifyConnectionAuthority();
    memorySession =
      null;
    memorySessionAccountGuard =
      null;
    refreshInFlight =
      null;

    return {
      accountGuard:
        nextGuard,
      rollback,
      complete:
        async () => {
          assertOperationCommitCurrent(
            operationCommitGuard,
          );

          const cleanupResult =
            await performSpotifyCleanupTargets(
              durableRecord,
              {
                operationCommitGuard,
              },
            );

          assertOperationCommitCurrent(
            operationCommitGuard,
          );

          if (
            hasSpotifyCleanupTargets(
              cleanupResult.record,
            ) ||
            !cleanupResult.persisted
          ) {
            throw new SpotifyProviderCleanupIncompleteError(
              nextGuard,
              cleanupResult.persisted
                ? cleanupResult.record
                : durableRecord,
            );
          }

          const completedRecord =
            updateCanalAccountCleanupRecord(
              cleanupResult.record,
              {
                phase:
                  "cleanup-complete",
              },
            );

          try {
            assertOperationCommitCurrent(
              operationCommitGuard,
            );

            await persistCanalAccountCleanupRecord(
              completedRecord,
            );

            assertOperationCommitCurrent(
              operationCommitGuard,
            );

            await removeCanalAccountCleanupRecord(
              completedRecord,
            );

            assertOperationCommitCurrent(
              operationCommitGuard,
            );

            markerPersisted =
              false;
          } catch (error) {
            if (
              error instanceof
              SpotifySessionChangedError
            ) {
              throw error;
            }

            const recoverableRecord =
              (
                await readCanalAccountCleanupRecord(
                  completedRecord,
                )
              ) ??
              completedRecord;

            throw new SpotifyProviderCleanupIncompleteError(
              nextGuard,
              recoverableRecord,
            );
          }
        },
    };
  } catch (error) {
    await rollback();
    throw error;
  }
}

async function readSpotifyProfileIdForGuardUnlocked(
  accountGuard:
    SpotifyCanalAccountGuard,
): Promise<string | null> {
  if (
    memorySession &&
    isSameCanalAccountGuard(
      memorySessionAccountGuard,
      accountGuard,
    )
  ) {
    return memorySession.profile.id;
  }

  try {
    let serialized:
      | string
      | null =
      null;

    if (
      Platform.OS !==
      "web"
    ) {
      serialized =
        await SecureStore.getItemAsync(
          SPOTIFY_SECURE_STORAGE_KEY,
        );
    }

    if (!serialized) {
      serialized =
        await AsyncStorage.getItem(
          SPOTIFY_ASYNC_STORAGE_KEY,
        );
    }

    if (!serialized) {
      return null;
    }

    const parsed: unknown =
      JSON.parse(
        serialized,
      );

    const envelope =
      normalizePersistedSpotifySessionEnvelope(
        parsed,
      );

    if (
      accountGuard.configured
    ) {
      if (
        !envelope ||
        envelope.ownerId !==
          accountGuard.ownerId ||
        envelope.accountGeneration !==
          accountGuard.accountGeneration
      ) {
        return null;
      }

      return envelope.session.profile.id;
    }

    return (
      envelope?.session.profile.id ??
      normalizeSession(
        parsed,
      )?.profile.id ??
      null
    );
  } catch {
    return null;
  }
}

async function resolveCurrentCanalAccountGuardUnlocked(
  options: {
    forceRotate?: boolean;
  } = {},
): Promise<{
  guard:
    SpotifyCanalAccountGuard;
  persistedStateUsable: boolean;
  sessionGeneration:
    string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      guard: {
        ownerId: null,
        accountGeneration: 0,
        configured: false,
      },
      persistedStateUsable: true,
      sessionGeneration: null,
    };
  }

  const currentIdentity =
    await readCurrentCanalAccountIdentity();

  const ownerId =
    currentIdentity.ownerId;

  const {
    authority,
    existed,
  } =
    await readSpotifyAccountAuthority();

  const shouldRotate =
    options.forceRotate ===
      true ||
    !authority ||
    authority.ownerId !==
      ownerId ||
    authority.sessionGeneration !==
      currentIdentity.sessionGeneration;

  if (!shouldRotate) {
    return {
      guard: {
        ownerId,
        accountGeneration:
          authority.generation,
        configured: true,
      },
      persistedStateUsable:
        existed,
      sessionGeneration:
        currentIdentity
          .sessionGeneration,
    };
  }

  const nextAuthority:
    SpotifyAccountAuthority = {
    version:
      SPOTIFY_ACCOUNT_AUTHORITY_VERSION,
    ownerId,
    sessionGeneration:
      currentIdentity
        .sessionGeneration,
    generation:
      (
        authority?.generation ??
        0
      ) + 1,
  };

  await completeAutomaticAuthorityCleanup(
    authority,
  );

  await persistSpotifyAccountAuthority(
    nextAuthority,
  );

  advanceSpotifyConnectionAuthority();

  return {
    guard: {
      ownerId,
      accountGeneration:
        nextAuthority.generation,
      configured: true,
    },
    persistedStateUsable: false,
    sessionGeneration:
      currentIdentity
        .sessionGeneration,
  };
}

async function assertCanalAccountGuardCurrentUnlocked(
  expected:
    SpotifyCanalAccountGuard,
): Promise<void> {
  const {
    guard,
  } =
    await resolveCurrentCanalAccountGuardUnlocked();

  if (
    !isSameCanalAccountGuard(
      expected,
      guard,
    )
  ) {
    throw new SpotifySessionChangedError();
  }
}

export async function captureSpotifyCanalAccountGuard(): Promise<
  SpotifyCanalAccountGuard
> {
  return runSessionMutation(
    async () => {
      const {
        guard,
      } =
        await resolveCurrentCanalAccountGuardUnlocked();

      if (
        guard.configured &&
        !guard.ownerId
      ) {
        throw new SpotifyAccessError(
          "authorization",
          "Sign in to Canal before connecting Spotify.",
        );
      }

      return guard;
    },
  );
}

export async function captureSpotifyAccountScope(): Promise<
  SpotifyAccountScope
> {
  return runSessionMutation(
    async () => {
      const {
        guard,
        sessionGeneration,
      } =
        await resolveCurrentCanalAccountGuardUnlocked();

      if (
        !guard.ownerId ||
        !sessionGeneration
      ) {
        throw new SpotifyAccessError(
          "authorization",
          "Sign in to Canal before using Spotify.",
        );
      }

      return {
        ownerId:
          guard.ownerId,
        sessionGeneration,
        spotifyAccountGeneration:
          guard.accountGeneration,
      };
    },
  );
}

export async function assertSpotifyAccountScopeCurrent(
  expected:
    SpotifyAccountScope,
): Promise<void> {
  await runSessionMutation(
    async () => {
      const {
        guard,
        sessionGeneration,
      } =
        await resolveCurrentCanalAccountGuardUnlocked();

      if (
        guard.ownerId !==
          expected.ownerId ||
        sessionGeneration !==
          expected.sessionGeneration ||
        guard.accountGeneration !==
          expected.spotifyAccountGeneration
      ) {
        throw new SpotifySessionChangedError();
      }
    },
  );
}

export async function captureSpotifyCacheScope(): Promise<
  SpotifyCacheScope
> {
  return runSessionMutation(
    async () => {
      const {
        guard,
        sessionGeneration,
      } =
        await resolveCurrentCanalAccountGuardUnlocked();

      const currentSession =
        await hydrateSpotifySession();

      if (
        !guard.ownerId ||
        !sessionGeneration ||
        !currentSession
          ?.profile.id
      ) {
        throw new SpotifySessionChangedError();
      }

      return {
        ownerId:
          guard.ownerId,
        sessionGeneration,
        spotifyAccountGeneration:
          guard.accountGeneration,
        spotifyProfileId:
          currentSession
            .profile.id,
      };
    },
  );
}

export async function assertSpotifyCacheScopeCurrent(
  expected:
    SpotifyCacheScope,
): Promise<void> {
  await runSessionMutation(
    async () => {
      const {
        guard,
        sessionGeneration,
      } =
        await resolveCurrentCanalAccountGuardUnlocked();

      const currentSession =
        await hydrateSpotifySession();

      if (
        guard.ownerId !==
          expected.ownerId ||
        sessionGeneration !==
          expected.sessionGeneration ||
        guard.accountGeneration !==
          expected.spotifyAccountGeneration ||
        currentSession
          ?.profile.id !==
          expected.spotifyProfileId
      ) {
        throw new SpotifySessionChangedError();
      }
    },
  );
}

export class SpotifySessionChangedError extends Error {
  constructor() {
    super(
      "Spotify connection changed while Canal was working. Try again with the current account.",
    );

    this.name =
      "SpotifySessionChangedError";
  }
}

export function getMissingSpotifyScopes(
  scope:
    | string
    | null
    | undefined,
  requiredScopes:
    readonly string[] =
      CANAL_REQUIRED_SPOTIFY_SCOPES,
): string[] {
  const granted =
    new Set(
      (
        scope ?? ""
      )
        .split(
          /\s+/,
        )
        .map(
          (value) =>
            value.trim(),
        )
        .filter(
          Boolean,
        ),
    );

  return requiredScopes.filter(
    (required) =>
      !granted.has(
        required,
      ),
  );
}

export function hasRequiredSpotifyScopes(
  session:
    Pick<
      SpotifySession,
      "scope"
    >,
): boolean {
  return (
    getMissingSpotifyScopes(
      session.scope,
    ).length === 0
  );
}

function normalizeSession(
  value: unknown,
): SpotifySession | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<SpotifySession>;

  if (
    typeof candidate.accessToken !==
      "string" ||
    !candidate.accessToken
  ) {
    return null;
  }

  if (
    !candidate.profile ||
    typeof candidate.profile.id !==
      "string"
  ) {
    return null;
  }

  const expiresAt =
    typeof candidate.expiresAt ===
      "number"
      ? candidate.expiresAt
      : Date.now() +
        55 * 60 * 1000;

  return {
    ...candidate,

    accessToken:
      candidate.accessToken,

    refreshToken:
      typeof candidate.refreshToken ===
        "string"
        ? candidate.refreshToken
        : undefined,

    expiresAt,

    tokenType:
      typeof candidate.tokenType ===
        "string"
        ? candidate.tokenType
        : "Bearer",

    scope:
      typeof candidate.scope ===
        "string"
        ? candidate.scope
        : "",

    profile:
      candidate.profile,
  };
}

function normalizePersistedSpotifySessionEnvelope(
  value: unknown,
): PersistedSpotifySessionEnvelope | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<PersistedSpotifySessionEnvelope>;

  if (
    candidate.version !==
      SPOTIFY_SESSION_ENVELOPE_VERSION ||
    typeof candidate.ownerId !==
      "string" ||
    !candidate.ownerId ||
    typeof candidate.accountGeneration !==
      "number" ||
    !Number.isSafeInteger(
      candidate.accountGeneration,
    ) ||
    candidate.accountGeneration < 1
  ) {
    return null;
  }

  const session =
    normalizeSession(
      candidate.session,
    );

  if (!session) {
    return null;
  }

  return {
    version:
      SPOTIFY_SESSION_ENVELOPE_VERSION,
    ownerId:
      candidate.ownerId,
    accountGeneration:
      candidate.accountGeneration,
    session,
  };
}

async function removePersistedSpotifySessionBestEffort(): Promise<void> {
  try {
    await AsyncStorage.removeItem(
      SPOTIFY_ASYNC_STORAGE_KEY,
    );
  } catch {
    // A later account check still rejects non-authoritative data.
  }

  if (
    Platform.OS !==
    "web"
  ) {
    try {
      await SecureStore.deleteItemAsync(
        SPOTIFY_SECURE_STORAGE_KEY,
      );
    } catch {
      // The account authority makes a leftover keychain value unusable.
    }
  }
}

function isSpotifyCleanupTarget(
  target:
    CanalAccountCleanupTarget,
): boolean {
  return (
    target ===
      "spotify-async-session" ||
    target ===
      "spotify-secure-session" ||
    target ===
      "spotify-library-snapshot" ||
    target ===
      "spotify-return-route" ||
    target ===
      "spotify-cache-scan" ||
    target ===
      "spotify-cache-entries"
  );
}

function hasSpotifyCleanupTargets(
  record:
    CanalAccountCleanupRecord,
): boolean {
  return record.targets.some(
    isSpotifyCleanupTarget,
  );
}

function cacheKeyBelongsToCleanupSource(
  key: string,
  record:
    CanalAccountCleanupRecord,
): boolean {
  if (
    !key.startsWith(
      STORAGE_KEYS
        .spotifyCachePrefix,
    )
  ) {
    return false;
  }

  const scopedProfileNamespace =
    record.sourceSpotifyProfileId
      ? getSpotifyCacheNamespace({
          ownerId:
            record.ownerId,
          sessionGeneration:
            record
              .sessionGeneration,
          spotifyAccountGeneration:
            record
              .sourceSpotifyAccountGeneration,
          spotifyProfileId:
            record
              .sourceSpotifyProfileId,
        })
      : null;

  const scopedAuthorityNamespace =
    getSpotifyCacheAuthorityNamespace({
      ownerId:
        record.ownerId,
      sessionGeneration:
        record.sessionGeneration,
      spotifyAccountGeneration:
        record
          .sourceSpotifyAccountGeneration,
    });

  const previousScopedNamespace =
    (
      STORAGE_KEYS
        .spotifyCachePrefix +
      [
        "v2",
        encodeURIComponent(
          record.ownerId,
        ),
        encodeURIComponent(
          record
            .sessionGeneration,
        ),
        record
          .sourceSpotifyAccountGeneration,
        "",
      ].join(":")
    );

  return (
    key.startsWith(
      scopedAuthorityNamespace,
    ) ||
    (
      scopedProfileNamespace !==
        null &&
      key.startsWith(
        scopedProfileNamespace,
      )
    ) ||
    key.startsWith(
      previousScopedNamespace,
    ) ||
    (
      !key.startsWith(
        `${STORAGE_KEYS.spotifyCachePrefix}v2:`,
      ) &&
      !key.startsWith(
        `${STORAGE_KEYS.spotifyCachePrefix}v3:`,
      )
    )
  );
}

function serializedValueBelongsToCleanupSource(
  serialized: string | null,
  record:
    CanalAccountCleanupRecord,
): boolean {
  if (
    !serialized ||
    record.ownerId ===
      "legacy-unowned"
  ) {
    return true;
  }

  try {
    const value =
      JSON.parse(
        serialized,
      ) as {
        ownerId?: unknown;
        accountGeneration?: unknown;
        spotifyAccountGeneration?: unknown;
        sessionGeneration?: unknown;
      };

    const accountGeneration =
      typeof value.accountGeneration ===
        "number"
        ? value.accountGeneration
        : value
              .spotifyAccountGeneration;

    if (
      typeof value.ownerId !==
        "string" ||
      typeof accountGeneration !==
        "number"
    ) {
      return true;
    }

    return (
      value.ownerId ===
        record.ownerId &&
      accountGeneration ===
        record
          .sourceSpotifyAccountGeneration &&
      (
        typeof value.sessionGeneration !==
          "string" ||
        value.sessionGeneration ===
          record.sessionGeneration
      )
    );
  } catch {
    return true;
  }
}

async function performSpotifyCleanupTargets(
  record:
    CanalAccountCleanupRecord,
  options: {
    operationCommitGuard?:
      () => boolean;
  } = {},
): Promise<{
  record:
    CanalAccountCleanupRecord;
  persisted: boolean;
}> {
  const cacheBackup =
    new Map<
      string,
      string
    >();

  const restoreCacheBackup =
    async (): Promise<void> => {
      for (
        const [
          key,
          value,
        ] of cacheBackup
      ) {
        const currentValue =
          await AsyncStorage.getItem(
            key,
          );

        if (
          currentValue ===
            null
        ) {
          await AsyncStorage.setItem(
            key,
            value,
          );
        }
      }
    };

  const assertCleanupCommitCurrent =
    async (): Promise<void> => {
      try {
        assertOperationCommitCurrent(
          options.operationCommitGuard,
        );
      } catch (error) {
        await restoreCacheBackup();
        throw error;
      }
    };

  await assertCleanupCommitCurrent();

  const remainingTargets =
    new Set(
      record.targets,
    );

  const removeAsyncStorageTarget =
    async (
      target:
        CanalAccountCleanupTarget,
      key: string,
      ownerScoped = false,
    ): Promise<void> => {
      if (
        !remainingTargets.has(
          target,
        )
      ) {
        return;
      }

      try {
        await assertCleanupCommitCurrent();

        if (ownerScoped) {
          const serialized =
            await AsyncStorage.getItem(
              key,
            );

          await assertCleanupCommitCurrent();

          if (
            !serializedValueBelongsToCleanupSource(
              serialized,
              record,
            )
          ) {
            remainingTargets.delete(
              target,
            );

            return;
          }
        }

        await AsyncStorage.removeItem(
          key,
        );

        await assertCleanupCommitCurrent();

        remainingTargets.delete(
          target,
        );
      } catch (error) {
        if (
          error instanceof
          SpotifySessionChangedError
        ) {
          throw error;
        }

        // The durable marker retains this exact retry target.
      }
    };

  await removeAsyncStorageTarget(
    "spotify-async-session",
    SPOTIFY_ASYNC_STORAGE_KEY,
    true,
  );

  if (
    remainingTargets.has(
      "spotify-secure-session",
    )
  ) {
    if (
      Platform.OS ===
      "web"
    ) {
      remainingTargets.delete(
        "spotify-secure-session",
      );
    } else {
      try {
        await assertCleanupCommitCurrent();

        const serialized =
          await SecureStore.getItemAsync(
            SPOTIFY_SECURE_STORAGE_KEY,
          );

        await assertCleanupCommitCurrent();

        if (
          !serializedValueBelongsToCleanupSource(
            serialized,
            record,
          )
        ) {
          remainingTargets.delete(
            "spotify-secure-session",
          );
        } else {
        await SecureStore.deleteItemAsync(
          SPOTIFY_SECURE_STORAGE_KEY,
        );

        await assertCleanupCommitCurrent();

        remainingTargets.delete(
          "spotify-secure-session",
        );
        }
      } catch (error) {
        if (
          error instanceof
          SpotifySessionChangedError
        ) {
          throw error;
        }

        // The durable marker retains this exact retry target.
      }
    }
  }

  await removeAsyncStorageTarget(
    "spotify-library-snapshot",
    STORAGE_KEYS
      .spotifyLibrarySnapshot,
    true,
  );

  await removeAsyncStorageTarget(
    "spotify-return-route",
    STORAGE_KEYS
      .spotifyReturnRoute,
    true,
  );

  let cacheKeys =
    record.cacheKeys.filter(
      (key) =>
        cacheKeyBelongsToCleanupSource(
          key,
          record,
        ),
    );

  if (
    remainingTargets.has(
      "spotify-cache-scan",
    )
  ) {
    try {
      await assertCleanupCommitCurrent();

      const allKeys =
        await AsyncStorage.getAllKeys();

      await assertCleanupCommitCurrent();

      cacheKeys =
        Array.from(
          new Set([
            ...cacheKeys,
            ...allKeys.filter(
              (key) =>
                cacheKeyBelongsToCleanupSource(
                  key,
                  record,
                ),
            ),
          ]),
        );

      remainingTargets.delete(
        "spotify-cache-scan",
      );

      if (
        cacheKeys.length >
        0
      ) {
        remainingTargets.add(
          "spotify-cache-entries",
        );
      }
    } catch (error) {
      if (
        error instanceof
        SpotifySessionChangedError
      ) {
        throw error;
      }

      // Retry must enumerate only for this same account/session generation.
    }
  }

  if (
    remainingTargets.has(
      "spotify-cache-entries",
    )
  ) {
    const failedCacheKeys:
      string[] = [];

    if (
      cacheKeys.length >
      0
    ) {
      try {
        await assertCleanupCommitCurrent();

        for (
          const key of
          cacheKeys
        ) {
          const value =
            await AsyncStorage.getItem(
              key,
            );

          await assertCleanupCommitCurrent();

          if (value !== null) {
            cacheBackup.set(
              key,
              value,
            );
          }
        }

        await AsyncStorage.multiRemove(
          cacheKeys,
        );

        await assertCleanupCommitCurrent();
      } catch (error) {
        if (
          error instanceof
          SpotifySessionChangedError
        ) {
          throw error;
        }

        for (
          const key of
          cacheKeys
        ) {
          try {
            await assertCleanupCommitCurrent();

            await AsyncStorage.removeItem(
              key,
            );

            await assertCleanupCommitCurrent();
          } catch (fallbackError) {
            if (
              fallbackError instanceof
              SpotifySessionChangedError
            ) {
              throw fallbackError;
            }

            failedCacheKeys.push(
              key,
            );
          }
        }
      }
    }

    try {
      await assertCleanupCommitCurrent();

      const survivingCacheKeys =
        (
          await AsyncStorage.getAllKeys()
        ).filter(
          (key) =>
            cacheKeyBelongsToCleanupSource(
              key,
              record,
          ),
        );

      await assertCleanupCommitCurrent();

      cacheKeys =
        Array.from(
          new Set([
            ...failedCacheKeys,
            ...survivingCacheKeys,
          ]),
        );

      if (
        cacheKeys.length ===
        0
      ) {
        remainingTargets.delete(
          "spotify-cache-entries",
        );
      }
    } catch (error) {
      if (
        error instanceof
        SpotifySessionChangedError
      ) {
        throw error;
      }

      cacheKeys =
        Array.from(
          new Set([
            ...cacheKeys,
            ...failedCacheKeys,
          ]),
        );
    }
  }

  const updatedRecord =
    updateCanalAccountCleanupRecord(
      record,
      {
        targets:
          Array.from(
            remainingTargets,
          ),
        cacheKeys,
      },
  );

  try {
    await assertCleanupCommitCurrent();

    await persistCanalAccountCleanupRecord(
      updatedRecord,
    );

    await assertCleanupCommitCurrent();

    return {
      record:
        updatedRecord,
      persisted: true,
    };
  } catch (error) {
    if (
      error instanceof
      SpotifySessionChangedError
    ) {
      throw error;
    }

    return {
      record:
        updatedRecord,
      persisted: false,
    };
  }
}

async function persistSession(
  session: SpotifySession,
  accountGuard:
    SpotifyCanalAccountGuard,
  operationCommitGuard?:
    () => boolean,
): Promise<SpotifySessionPersistenceCommit> {
  assertOperationCommitCurrent(
    operationCommitGuard,
  );

  await assertCanalAccountGuardCurrentUnlocked(
    accountGuard,
  );

  assertOperationCommitCurrent(
    operationCommitGuard,
  );

  const persistedValue:
    | SpotifySession
    | PersistedSpotifySessionEnvelope =
    accountGuard.configured
      ? (
          accountGuard.ownerId
            ? {
                version:
                  SPOTIFY_SESSION_ENVELOPE_VERSION,
                ownerId:
                  accountGuard.ownerId,
                accountGeneration:
                  accountGuard.accountGeneration,
                session,
              }
            : (() => {
                throw new SpotifySessionChangedError();
              })()
        )
      : session;

  const serialized =
    JSON.stringify(
      persistedValue,
    );

  const previousAsyncValue =
    await AsyncStorage.getItem(
      SPOTIFY_ASYNC_STORAGE_KEY,
    );

  assertOperationCommitCurrent(
    operationCommitGuard,
  );

  const previousSecureValue =
    Platform.OS ===
      "web"
      ? null
      : await SecureStore.getItemAsync(
          SPOTIFY_SECURE_STORAGE_KEY,
        );

  assertOperationCommitCurrent(
    operationCommitGuard,
  );

  const previousMemorySession =
    memorySession;

  const previousMemoryAccountGuard =
    memorySessionAccountGuard;

  let secureValueWritten =
    false;

  let asyncValueRemoved =
    false;

  let memoryValueWritten =
    false;

  const rollback =
    async (): Promise<void> => {
      if (secureValueWritten) {
        await restoreSecureStorageValueIfExact(
          serialized,
          previousSecureValue,
        );
      }

      if (asyncValueRemoved) {
        await restoreAsyncStorageValueIfExact(
          SPOTIFY_ASYNC_STORAGE_KEY,
          null,
          previousAsyncValue,
        );
      }

      if (
        memoryValueWritten &&
        memorySession ===
          session &&
        isSameCanalAccountGuard(
          memorySessionAccountGuard,
          accountGuard,
        )
      ) {
        memorySession =
          previousMemorySession;
        memorySessionAccountGuard =
          previousMemoryAccountGuard;
      }
    };

  if (Platform.OS === "web") {
    try {
      assertOperationCommitCurrent(
        operationCommitGuard,
      );

      await AsyncStorage.removeItem(
        SPOTIFY_ASYNC_STORAGE_KEY,
      );
      asyncValueRemoved =
        true;

      assertOperationCommitCurrent(
        operationCommitGuard,
      );

      await assertCanalAccountGuardCurrentUnlocked(
        accountGuard,
      );

      assertOperationCommitCurrent(
        operationCommitGuard,
      );

      memorySession =
        session;
      memorySessionAccountGuard =
        accountGuard;
      memoryValueWritten =
        true;

      assertOperationCommitCurrent(
        operationCommitGuard,
      );

      return {
        rollback,
      };
    } catch (error) {
      await rollback();
      throw error;
    }
  }

  try {
    assertOperationCommitCurrent(
      operationCommitGuard,
    );

    await SecureStore.setItemAsync(
      SPOTIFY_SECURE_STORAGE_KEY,
      serialized,
    );
    secureValueWritten =
      true;

    assertOperationCommitCurrent(
      operationCommitGuard,
    );

    await assertCanalAccountGuardCurrentUnlocked(
      accountGuard,
    );

    assertOperationCommitCurrent(
      operationCommitGuard,
    );
  } catch (error) {
    memorySession =
      null;

    memorySessionAccountGuard =
      null;

    await rollback();

    throw error;
  }

  memorySession =
    session;

  memorySessionAccountGuard =
    accountGuard;
  memoryValueWritten =
    true;

  try {
    assertOperationCommitCurrent(
      operationCommitGuard,
    );

    await AsyncStorage.removeItem(
      SPOTIFY_ASYNC_STORAGE_KEY,
    );
    asyncValueRemoved =
      true;

    assertOperationCommitCurrent(
      operationCommitGuard,
    );

    await assertCanalAccountGuardCurrentUnlocked(
      accountGuard,
    );

    assertOperationCommitCurrent(
      operationCommitGuard,
    );
  } catch (error) {
    await rollback();
    throw error;
  }

  return {
    rollback,
  };
}

async function hydrateSpotifySession(): Promise<
  SpotifySession | null
> {
  const {
    guard:
      accountGuard,
    persistedStateUsable,
    sessionGeneration,
  } =
    await resolveCurrentCanalAccountGuardUnlocked();

  if (
    accountGuard.configured &&
    !accountGuard.ownerId
  ) {
    memorySession =
      null;

    memorySessionAccountGuard =
      null;

    await removePersistedSpotifySessionBestEffort();

    return null;
  }

  if (
    accountGuard.ownerId &&
    sessionGeneration
  ) {
    const pendingCleanups =
      await listCanalAccountCleanupRecords({
        ownerId:
          accountGuard.ownerId,
        sessionGeneration,
        spotifyAccountGeneration:
          accountGuard.accountGeneration,
      });

    if (
      pendingCleanups.some(
        (record) =>
          hasSpotifyCleanupTargets(
            record,
          ) ||
          record.phase ===
            "signout-pending",
      )
    ) {
      memorySession =
        null;
      memorySessionAccountGuard =
        null;

      return null;
    }
  }

  if (
    memorySession &&
    isSameCanalAccountGuard(
      memorySessionAccountGuard,
      accountGuard,
    )
  ) {
    return memorySession;
  }

  memorySession =
    null;

  memorySessionAccountGuard =
    null;

  if (
    accountGuard.configured &&
    !persistedStateUsable
  ) {
    await removePersistedSpotifySessionBestEffort();

    return null;
  }

  let serialized: string | null =
    null;

  if (Platform.OS !== "web") {
    try {
      serialized =
        await SecureStore.getItemAsync(
          SPOTIFY_SECURE_STORAGE_KEY,
        );
    } catch {
      serialized = null;
    }
  }

  let cameFromLegacyStorage =
    false;

  if (!serialized) {
    serialized =
      await AsyncStorage.getItem(
        SPOTIFY_ASYNC_STORAGE_KEY,
      );

    cameFromLegacyStorage =
      Boolean(serialized);
  }

  if (!serialized) {
    return null;
  }

  try {
    const parsed: unknown =
      JSON.parse(serialized);

    const envelope =
      normalizePersistedSpotifySessionEnvelope(
        parsed,
      );

    let normalized:
      SpotifySession | null =
      null;

    if (accountGuard.configured) {
      if (
        !envelope ||
        envelope.ownerId !==
          accountGuard.ownerId ||
        envelope.accountGeneration !==
          accountGuard.accountGeneration
      ) {
        await removePersistedSpotifySessionBestEffort();

        return null;
      }

      normalized =
        envelope.session;
    } else {
      normalized =
        envelope?.session ??
        normalizeSession(parsed) ??
        (await migrateLegacySession(
          parsed,
        ));
    }

    if (!normalized) {
      await removePersistedSpotifySessionBestEffort();

      return null;
    }

    await assertCanalAccountGuardCurrentUnlocked(
      accountGuard,
    );

    memorySession =
      normalized;

    memorySessionAccountGuard =
      accountGuard;

    if (cameFromLegacyStorage) {
      await persistSession(
        normalized,
        accountGuard,
      );
    }

    return normalized;
  } catch {
    memorySession =
      null;

    memorySessionAccountGuard =
      null;

    await removePersistedSpotifySessionBestEffort();

    return null;
  }
}

export async function readSpotifySession(): Promise<
  SpotifySession | null
> {
  return runSessionMutation(
    hydrateSpotifySession,
  );
}

export async function saveSpotifySession(
  session: SpotifySession,
  options: SaveSpotifySessionOptions = {},
): Promise<SpotifyCanalAccountGuard> {
  assertOperationCommitCurrent(
    options.operationCommitGuard,
  );

  const accountGuard =
    options.accountGuard ??
    (await captureSpotifyCanalAccountGuard());

  assertOperationCommitCurrent(
    options.operationCommitGuard,
  );

  const normalized =
    normalizeSession(session);

  if (!normalized) {
    throw new Error(
      "Canal received an invalid Spotify session.",
    );
  }

  if (
    accountGuard.ownerId
  ) {
    const pendingCleanups =
      await listCanalAccountCleanupRecords({
        ownerId:
          accountGuard.ownerId,
        sessionGeneration:
          getCanalAccountSessionGeneration(),
        spotifyAccountGeneration:
          accountGuard.accountGeneration,
      });

    if (
      pendingCleanups.some(
        (pendingCleanup) =>
        hasSpotifyCleanupTargets(
          pendingCleanup,
        ) ||
        pendingCleanup.phase ===
          "signout-pending"
      )
    ) {
      throw new Error(
        "Canal must finish the previous account cleanup before Spotify can reconnect.",
      );
    }
  }

  const saveResult =
    await runSessionMutation(
      async () => {
        assertOperationCommitCurrent(
          options.operationCommitGuard,
        );

        await assertCanalAccountGuardCurrentUnlocked(
          accountGuard,
        );

        assertOperationCommitCurrent(
          options.operationCommitGuard,
        );

        const storedSession =
          await hydrateSpotifySession();

        assertOperationCommitCurrent(
          options.operationCommitGuard,
        );

        await assertCanalAccountGuardCurrentUnlocked(
          accountGuard,
        );

        assertOperationCommitCurrent(
          options.operationCommitGuard,
        );

        const rotationCommit =
          storedSession &&
          storedSession.profile.id !==
            normalized.profile.id
            ? await rotateSpotifyProviderAuthorityUnlocked(
                accountGuard,
                storedSession
                  .profile.id,
                options.operationCommitGuard,
              )
            : {
                accountGuard,
                complete:
                  async () => {},
                rollback:
                  async () => {},
              } satisfies SpotifyProviderRotationCommit;

        const effectiveGuard =
          rotationCommit.accountGuard;

        try {
          assertOperationCommitCurrent(
            options.operationCommitGuard,
          );

          await assertCanalAccountGuardCurrentUnlocked(
            effectiveGuard,
          );

          assertOperationCommitCurrent(
            options.operationCommitGuard,
          );

          const persistenceCommit =
            await persistSession(
              normalized,
              effectiveGuard,
              options.operationCommitGuard,
            );

          assertOperationCommitCurrent(
            options.operationCommitGuard,
          );

          advanceSpotifyConnectionAuthority();

          return {
            effectiveGuard,
            rollbackPersistenceUnlocked:
              async () => {
                await persistenceCommit.rollback();
              },
            previousSession:
              storedSession,
            rotationCommit,
          };
        } catch (error) {
          await rotationCommit.rollback();
          throw error;
        }
      },
    );

  const previousSession =
    saveResult.previousSession;

  const rollbackFullCommit =
    async (): Promise<void> =>
      runSessionMutation(
        async () => {
          await saveResult
            .rotationCommit
            .rollback();
          await saveResult
            .rollbackPersistenceUnlocked();
        },
      );

  const isNewConnection =
    !previousSession ||
    previousSession.profile.id !==
      normalized.profile.id;

  const shouldSync =
    options.syncLibrary ??
    isNewConnection;

  if (shouldSync) {
    try {
      assertOperationCommitCurrent(
        options.operationCommitGuard,
      );

      const {
        syncSpotifyLibrary,
      } = await import(
        "./spotify-library"
      );

      await syncSpotifyLibrary({
        operationCommitGuard:
          options.operationCommitGuard,
      });

      assertOperationCommitCurrent(
        options.operationCommitGuard,
      );
    } catch (error) {
      if (
        options.operationCommitGuard &&
        !options.operationCommitGuard()
      ) {
        await rollbackFullCommit();

        throw new SpotifySessionChangedError();
      }

      console.warn(
        "Spotify connected, but automatic library sync failed:",
        error,
      );

      options.onLibrarySyncError?.(
        error,
      );
    }
  }

  try {
    assertOperationCommitCurrent(
      options.operationCommitGuard,
    );

    const {
      markAppSignedIn,
    } = await import(
      "./app-session"
    );

    await markAppSignedIn();

    assertOperationCommitCurrent(
      options.operationCommitGuard,
    );
  } catch {
    if (
      options.operationCommitGuard &&
      !options.operationCommitGuard()
    ) {
      await rollbackFullCommit();

      throw new SpotifySessionChangedError();
    }

    // The Spotify connection is still valid.
  }

  await runSessionMutation(
    async () => {
      try {
        assertOperationCommitCurrent(
          options.operationCommitGuard,
        );

        await saveResult
          .rotationCommit
          .complete();

        assertOperationCommitCurrent(
          options.operationCommitGuard,
        );
      } catch (error) {
        await saveResult
          .rollbackPersistenceUnlocked();

        if (
          error instanceof
          SpotifyProviderCleanupIncompleteError
        ) {
          throw error;
        }

        await saveResult
          .rotationCommit
          .rollback();

        throw error;
      }
    },
  );

  return saveResult.effectiveGuard;
}

export async function clearSpotifySession(
  expectedAccountGuard?:
    SpotifyCanalAccountGuard,
  preparedCleanupRecord?:
    CanalAccountCleanupRecord,
): Promise<SpotifySessionCleanupResult> {
  return runSessionMutation(
    async () => {
      const {
        guard:
          currentGuard,
        sessionGeneration,
      } =
        await resolveCurrentCanalAccountGuardUnlocked();

      if (
        expectedAccountGuard &&
        !isSameCanalAccountGuard(
          expectedAccountGuard,
          currentGuard,
        )
      ) {
        throw new SpotifySessionChangedError();
      }

      const guardToClear =
        expectedAccountGuard ??
        currentGuard;

      const sourceSpotifyProfileId =
        await readSpotifyProfileIdForGuardUnlocked(
          guardToClear,
        );

      await assertCanalAccountGuardCurrentUnlocked(
        guardToClear,
      );

      const nextGuard:
        SpotifyCanalAccountGuard =
        guardToClear.configured
          ? {
              ...guardToClear,
              accountGeneration:
                guardToClear.accountGeneration +
                1,
            }
          : guardToClear;

      const cleanupOwnerId =
        guardToClear.ownerId ??
        (
          guardToClear.configured
            ? "signed-out"
            : "local-unconfigured"
        );

      const requestedRecord =
        preparedCleanupRecord
          ? {
              ...preparedCleanupRecord,
              sourceSpotifyProfileId,
            }
          : createCanalAccountCleanupRecord(
              {
                ownerId:
                  cleanupOwnerId,
                sessionGeneration:
                  sessionGeneration ??
                  "local-unconfigured",
                sourceSpotifyAccountGeneration:
                  guardToClear.accountGeneration,
                sourceSpotifyProfileId,
                spotifyAccountGeneration:
                  nextGuard.accountGeneration,
              },
              "spotify-disconnect",
              SPOTIFY_SESSION_CLEANUP_TARGETS,
            );

      if (
        requestedRecord.ownerId !==
          cleanupOwnerId ||
        requestedRecord.sessionGeneration !==
          (
            sessionGeneration ??
            "local-unconfigured"
          ) ||
        requestedRecord.sourceSpotifyAccountGeneration !==
          guardToClear.accountGeneration ||
        requestedRecord.sourceSpotifyProfileId !==
          sourceSpotifyProfileId ||
        requestedRecord.spotifyAccountGeneration !==
          nextGuard.accountGeneration ||
        requestedRecord.phase !==
          "cleanup-pending"
      ) {
        throw new Error(
          "Canal refused an account cleanup marker that did not match the captured session.",
        );
      }

      if (
        !preparedCleanupRecord ||
        preparedCleanupRecord.sourceSpotifyProfileId !==
          sourceSpotifyProfileId
      ) {
        await persistCanalAccountCleanupRecord(
          requestedRecord,
        );
      }

      const durableRecord =
        await readCanalAccountCleanupRecord(
          requestedRecord,
        );

      if (!durableRecord) {
        throw new Error(
          "Canal could not safely record cleanup before disconnecting Spotify.",
        );
      }

      if (
        guardToClear.configured
      ) {
        await persistSpotifyAccountAuthority({
          version:
            SPOTIFY_ACCOUNT_AUTHORITY_VERSION,
          ownerId:
            guardToClear.ownerId,
          sessionGeneration,
          generation:
            nextGuard.accountGeneration,
        });
      }

      advanceSpotifyConnectionAuthority();

      memorySession =
        null;

      memorySessionAccountGuard =
        null;

      refreshInFlight =
        null;

      const cleanupResult =
        await performSpotifyCleanupTargets(
          durableRecord,
        );

      if (
        expectedAccountGuard
      ) {
        await assertCanalAccountGuardCurrentUnlocked(
          nextGuard,
        );
      }

      if (
        preparedCleanupRecord
      ) {
        return {
          accountGuard:
            nextGuard,
          cleanupIncomplete:
            cleanupResult.record,
          cleanupPersisted:
            cleanupResult.persisted,
        };
      }

      if (
        hasSpotifyCleanupTargets(
          cleanupResult.record,
        ) ||
        !cleanupResult.persisted
      ) {
        return {
          accountGuard:
            nextGuard,
          cleanupIncomplete:
            cleanupResult.record,
          cleanupPersisted:
            cleanupResult.persisted,
        };
      }

      const completedRecord =
        updateCanalAccountCleanupRecord(
          cleanupResult.record,
          {
            phase:
              "cleanup-complete",
          },
        );

      try {
        await persistCanalAccountCleanupRecord(
          completedRecord,
        );

        await removeCanalAccountCleanupRecord(
          completedRecord,
        );

        return {
          accountGuard:
            nextGuard,
          cleanupIncomplete:
            null,
          cleanupPersisted:
            true,
        };
      } catch {
        return {
          accountGuard:
            nextGuard,
          cleanupIncomplete:
            completedRecord,
          cleanupPersisted:
            true,
        };
      }
    },
  );
}

export async function retrySpotifySessionCleanup(
  record:
    CanalAccountCleanupRecord,
  expectedAccountGuard:
    SpotifyCanalAccountGuard,
): Promise<SpotifySessionCleanupResult> {
  return runSessionMutation(
    async () => {
      const {
        guard:
          currentGuard,
        sessionGeneration,
      } =
        await resolveCurrentCanalAccountGuardUnlocked();

      if (
        !isSameCanalAccountGuard(
          expectedAccountGuard,
          currentGuard,
        ) ||
        record.ownerId !==
          currentGuard.ownerId ||
        record.sessionGeneration !==
          sessionGeneration ||
        record.spotifyAccountGeneration !==
          currentGuard.accountGeneration
      ) {
        throw new SpotifySessionChangedError();
      }

      const durableRecord =
        await readCanalAccountCleanupRecord(
          record,
        );

      if (
        !durableRecord ||
        durableRecord.cleanupId !==
          record.cleanupId
      ) {
        throw new Error(
          "Canal could not find the cleanup marker for this account session.",
        );
      }

      if (
        durableRecord.phase !==
          "cleanup-pending" ||
        !hasSpotifyCleanupTargets(
          durableRecord,
        )
      ) {
        return {
          accountGuard:
            currentGuard,
          cleanupIncomplete:
            durableRecord,
          cleanupPersisted:
            true,
        };
      }

      const cleanupResult =
        await performSpotifyCleanupTargets(
          durableRecord,
        );

      await assertCanalAccountGuardCurrentUnlocked(
        currentGuard,
      );

      return {
        accountGuard:
          currentGuard,
        cleanupIncomplete:
          cleanupResult.record,
        cleanupPersisted:
          cleanupResult.persisted,
      };
    },
  );
}

export async function readSpotifyConnectionStateForAccount(
  expectedAccountGuard:
    SpotifyCanalAccountGuard,
): Promise<SpotifyConnectionStateForAccount> {
  try {
    return await runSessionMutation(
      async () => {
        const {
          guard:
            currentGuard,
        } =
          await resolveCurrentCanalAccountGuardUnlocked();

        if (
          !isSameCanalAccountGuard(
            expectedAccountGuard,
            currentGuard,
          )
        ) {
          return "account-changed";
        }

        const currentSession =
          await hydrateSpotifySession();

        return currentSession
          ? "connected"
          : "disconnected";
      },
    );
  } catch {
    return "unknown";
  }
}

async function refreshSpotifySession(
  session: SpotifySession,
  connectionGuard:
    SpotifyConnectionGuard,
): Promise<SpotifySession> {
  if (!session.refreshToken) {
    const error =
      new Error(
        "Spotify needs to be connected again.",
      ) as Error & {
        authorizationInvalid?: boolean;
      };

    error.authorizationInvalid =
      true;

    throw error;
  }

  const clientId =
    getSpotifyClientId();

  if (!clientId) {
    throw new Error(
      "EXPO_PUBLIC_SPOTIFY_CLIENT_ID is missing.",
    );
  }

  const body =
    new URLSearchParams({
      grant_type:
        "refresh_token",

      refresh_token:
        session.refreshToken,

      client_id:
        clientId,
    });

  const response =
    await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          body.toString(),
      },
    );

  const payload =
    (await response.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

  if (
    !response.ok ||
    !payload.access_token
  ) {
    const error =
      new Error(
        payload.error_description ||
          payload.error ||
          "Spotify session refresh failed.",
      ) as Error & {
        authorizationInvalid?: boolean;
      };

    error.authorizationInvalid =
      payload.error ===
        "invalid_grant";

    throw error;
  }

  const expiresIn =
    typeof payload.expires_in ===
      "number"
      ? payload.expires_in
      : 3600;

  const refreshedSession: SpotifySession = {
    ...session,

    accessToken:
      payload.access_token,

    refreshToken:
      payload.refresh_token ||
      session.refreshToken,

    tokenType:
      payload.token_type ||
      session.tokenType ||
      "Bearer",

    scope:
      payload.scope ||
      session.scope,

    expiresIn,

    expiresAt:
      Date.now() +
      expiresIn * 1000 -
      60_000,
  };

  await runSessionMutation(
    async () => {
      await assertSpotifyConnectionGuardCurrentUnlocked(
        connectionGuard,
      );

      await persistSession(
        refreshedSession,
        {
          ownerId:
            connectionGuard.canalOwnerId,
          accountGeneration:
            connectionGuard.canalAccountGeneration,
          configured:
            isSupabaseConfigured,
        },
      );
    },
  );

  return refreshedSession;
}

async function refreshSpotifySessionOnce(
  session: SpotifySession,
): Promise<SpotifySession | null> {
  const connectionGuard =
    await runSessionMutation(
      async () =>
        captureSpotifyConnectionGuardUnlocked(
          session,
        ),
    );

  try {
    if (
      !refreshInFlight ||
      refreshInFlight
        .connectionGeneration !==
        connectionGuard.connectionGeneration ||
      refreshInFlight
        .connectionAuthority !==
        connectionGuard.connectionAuthority
    ) {
      let promise:
        Promise<SpotifySession>;

      promise =
        refreshSpotifySession(
          session,
          connectionGuard,
        ).finally(() => {
          if (
            refreshInFlight
              ?.promise ===
            promise
          ) {
            refreshInFlight =
              null;
          }
        });

      refreshInFlight = {
        connectionGeneration:
          connectionGuard.connectionGeneration,
        connectionAuthority:
          connectionGuard.connectionAuthority,
        promise,
      };
    }

    return await refreshInFlight.promise;
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error as Error & {
          authorizationInvalid?: boolean;
        }
      ).authorizationInvalid
    ) {
      const cleared =
        await runSessionMutation(
          async () => {
            try {
              await assertSpotifyConnectionGuardCurrentUnlocked(
                connectionGuard,
              );
            } catch {
              return false;
            }

            const {
              guard,
            } =
              await resolveCurrentCanalAccountGuardUnlocked({
                forceRotate:
                  isSupabaseConfigured,
              });

            if (!guard.configured) {
              advanceSpotifyConnectionAuthority();

              memorySession =
                null;

              memorySessionAccountGuard =
                null;

              await removePersistedSpotifySessionBestEffort();
            }

            return true;
          },
        );

      if (!cleared) {
        throw new SpotifySessionChangedError();
      }

      return null;
    }

    throw error;
  }
}

export async function getValidSpotifySession(): Promise<
  SpotifySession | null
> {
  const session =
    await readSpotifySession();

  if (!session) {
    return null;
  }

  const isStillValid =
    session.expiresAt >
    Date.now() + 30_000;

  if (isStillValid) {
    return session;
  }

  return refreshSpotifySessionOnce(
    session,
  );
}

async function requireSpotifySessionScopes(
  requiredScopes:
    readonly string[],
  permissionMessage: string,
): Promise<
  SpotifySession
> {
  const session =
    await getValidSpotifySession();

  if (!session) {
    throw new SpotifyAccessError(
      "authorization",
      "Spotify needs to be connected again.",
    );
  }

  const missingScopes =
    getMissingSpotifyScopes(
      session.scope,
      requiredScopes,
    );

  if (
    missingScopes.length >
    0
  ) {
    throw new SpotifyAccessError(
      "permission",
      permissionMessage,
      missingScopes,
    );
  }

  return session;
}

async function requireGuardedSpotifySessionScopes(
  requiredScopes:
    readonly string[],
  permissionMessage: string,
): Promise<
  SpotifyGuardedSession
> {
  const expectedConnectionGeneration =
    getSpotifyConnectionGeneration();

  const session =
    await requireSpotifySessionScopes(
      requiredScopes,
      permissionMessage,
    );

  return runSessionMutation(
    async () => {
      if (
        expectedConnectionGeneration !==
          spotifyConnectionGeneration ||
        !memorySession ||
        memorySession.profile.id !==
          session.profile.id
      ) {
        throw new SpotifySessionChangedError();
      }

      const connectionGuard =
        captureSpotifyConnectionGuardUnlocked(
          memorySession,
        );

      await assertSpotifyConnectionGuardCurrentUnlocked(
        connectionGuard,
      );

      const missingScopes =
        getMissingSpotifyScopes(
          memorySession.scope,
          requiredScopes,
        );

      if (
        missingScopes.length >
        0
      ) {
        throw new SpotifyAccessError(
          "permission",
          permissionMessage,
          missingScopes,
        );
      }

      return {
        session:
          memorySession,

        connectionGuard,
      };
    },
  );
}

export function isSpotifyConnectionGuardCurrent(
  connectionGuard: SpotifyConnectionGuard,
): boolean {
  return isSpotifyConnectionGuardCurrentUnlocked(
    connectionGuard,
  );
}

export async function assertSpotifyConnectionGuardCurrent(
  connectionGuard:
    SpotifyConnectionGuard,
): Promise<void> {
  await runSessionMutation(
    () =>
      assertSpotifyConnectionGuardCurrentUnlocked(
        connectionGuard,
      ),
  );
}

export async function readGuardedSpotifySession(): Promise<
  SpotifyGuardedSession | null
> {
  return runSessionMutation(
    async () => {
      const session =
        await hydrateSpotifySession();

      if (!session) {
        return null;
      }

      const connectionGuard =
        captureSpotifyConnectionGuardUnlocked(
          session,
        );

      await assertSpotifyConnectionGuardCurrentUnlocked(
        connectionGuard,
      );

      return {
        session,
        connectionGuard,
      };
    },
  );
}

export async function requireSpotifyLibrarySession(): Promise<
  SpotifySession
> {
  return requireSpotifySessionScopes(
    CANAL_REQUIRED_SPOTIFY_SCOPES,
    "Spotify permission is required before Canal can read your library and export playlists.",
  );
}

export async function requireGuardedSpotifyLibrarySession(): Promise<
  SpotifyGuardedSession
> {
  return requireGuardedSpotifySessionScopes(
    CANAL_REQUIRED_SPOTIFY_SCOPES,
    "Spotify permission is required before Canal can read your library and export playlists.",
  );
}

export async function requireSpotifyPlaylistExportSession(): Promise<
  SpotifySession
> {
  return requireSpotifySessionScopes(
    CANAL_SPOTIFY_EXPORT_SCOPES,
    "Spotify playlist permission is required before Canal can export this Scene.",
  );
}

export async function requireGuardedSpotifyPlaylistExportSession(): Promise<
  SpotifyGuardedSession
> {
  return requireGuardedSpotifySessionScopes(
    CANAL_SPOTIFY_EXPORT_SCOPES,
    "Spotify playlist permission is required before Canal can export this Scene.",
  );
}

export async function forceRefreshSpotifySession(): Promise<
  SpotifySession | null
> {
  const session =
    await readSpotifySession();

  if (!session) {
    return null;
  }

  return refreshSpotifySessionOnce(
    session,
  );
}

export async function getSpotifyAccessToken(): Promise<string> {
  const session =
    await getValidSpotifySession();

  if (!session) {
    throw new Error(
      "Spotify is not connected.",
    );
  }

  return session.accessToken;
}

export function normalizeSpotifyApiUrl(
  input: string,
): string {
  let url: URL;

  try {
    url =
      new URL(input);
  } catch {
    throw new Error(
      "Canal blocked an invalid Spotify API URL.",
    );
  }

  const hasAllowedPath =
    url.pathname ===
      "/v1" ||
    url.pathname.startsWith(
      "/v1/",
    );

  if (
    url.protocol !==
      "https:" ||
    url.hostname !==
      "api.spotify.com" ||
    Boolean(url.username) ||
    Boolean(url.password) ||
    Boolean(url.port) ||
    Boolean(url.hash) ||
    !hasAllowedPath
  ) {
    throw new Error(
      "Canal blocked an untrusted Spotify API URL.",
    );
  }

  return url.toString();
}

export async function spotifyAuthenticatedFetch(
  input: string,
  init: RequestInit = {},
  connectionGuard?: SpotifyConnectionGuard,
): Promise<Response> {
  const safeInput =
    normalizeSpotifyApiUrl(
      input,
    );

  const session =
    await getValidSpotifySession();

  if (!session) {
    throw new Error(
      "Spotify is not connected.",
    );
  }

  const requestGuard =
    connectionGuard ??
    (await runSessionMutation(
      async () => {
        const guard =
          captureSpotifyConnectionGuardUnlocked(
            session,
          );

        await assertSpotifyConnectionGuardCurrentUnlocked(
          guard,
        );

        return guard;
      },
    ));

  const send =
    async (
      guardedSession:
        SpotifySession,
    ): Promise<Response> => {
      if (
        guardedSession.profile.id !==
        requestGuard.profileId
      ) {
        throw new SpotifySessionChangedError();
      }

      await assertSpotifyConnectionGuardCurrent(
        requestGuard,
      );

      return fetch(
        safeInput,
        {
          ...init,

          headers: {
            ...(
              init.headers as
                | Record<
                    string,
                    string
                  >
                | undefined
            ),

            Authorization:
              `Bearer ${guardedSession.accessToken}`,
          },
        },
      );
    };

  let response =
    await send(
      session,
    );

  if (
    response.status !==
    401
  ) {
    return response;
  }

  const refreshed =
    await forceRefreshSpotifySession();

  if (!refreshed) {
    return response;
  }

  response =
    await send(
      refreshed,
    );

  return response;
}

export async function fetchSpotifyProfile(
  accessToken: string,
): Promise<SpotifyProfile> {
  const response =
    await fetch(
      "https://api.spotify.com/v1/me",
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    );

  const payload =
    (await response.json()) as
      SpotifyProfile & {
        error?: {
          message?: string;
        };
      };

  if (
    !response.ok ||
    !payload.id
  ) {
    throw new Error(
      payload.error?.message ||
        "Canal could not load your Spotify profile.",
    );
  }

  return payload;
}

export function getSpotifyErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Canal could not complete the Spotify request.";
}

async function migrateLegacySession(
  value: unknown,
): Promise<SpotifySession | null> {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as {
      accessToken?: unknown;
      refreshToken?: unknown;
      expiresIn?: unknown;
      issuedAt?: unknown;
      scope?: unknown;
      tokenType?: unknown;
    };

  if (
    typeof candidate.accessToken !==
      "string" ||
    !candidate.accessToken
  ) {
    return null;
  }

  const expiresIn =
    typeof candidate.expiresIn ===
      "number"
      ? candidate.expiresIn
      : 3600;

  const issuedAt =
    typeof candidate.issuedAt ===
      "number"
      ? candidate.issuedAt
      : Math.floor(
          Date.now() / 1000,
        );

  const profile =
    await fetchSpotifyProfile(
      candidate.accessToken,
    );

  return {
    accessToken:
      candidate.accessToken,

    refreshToken:
      typeof candidate.refreshToken ===
        "string"
        ? candidate.refreshToken
        : undefined,

    expiresIn,

    expiresAt:
      issuedAt * 1000 +
      expiresIn * 1000 -
      60_000,

    scope:
      typeof candidate.scope ===
        "string"
        ? candidate.scope
        : "",

    tokenType:
      typeof candidate.tokenType ===
        "string"
        ? candidate.tokenType
        : "Bearer",

    profile,
  };
}
