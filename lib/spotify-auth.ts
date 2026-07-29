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

export type SaveSpotifySessionOptions = {
  syncLibrary?: boolean;
  accountGuard?:
    SpotifyCanalAccountGuard;
};

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
  1;

type SpotifyAccountAuthority = {
  version: number;
  ownerId: string | null;
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
      promise:
        Promise<SpotifySession>;
    }
  | null =
    null;

let spotifyConnectionGeneration =
  0;

let sessionMutationTail:
  Promise<void> =
    Promise.resolve();

export function getSpotifyConnectionGeneration(): number {
  return spotifyConnectionGeneration;
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
    candidate.version !==
      SPOTIFY_ACCOUNT_AUTHORITY_VERSION ||
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

async function readCurrentCanalOwnerId(): Promise<
  string | null
> {
  if (!isSupabaseConfigured) {
    return null;
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

  return (
    typeof ownerId ===
      "string" &&
    ownerId.length > 0
  )
    ? ownerId
    : null;
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

async function resolveCurrentCanalAccountGuardUnlocked(
  options: {
    forceRotate?: boolean;
  } = {},
): Promise<{
  guard:
    SpotifyCanalAccountGuard;
  persistedStateUsable: boolean;
}> {
  if (!isSupabaseConfigured) {
    return {
      guard: {
        ownerId: null,
        accountGeneration: 0,
        configured: false,
      },
      persistedStateUsable: true,
    };
  }

  const ownerId =
    await readCurrentCanalOwnerId();

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
      ownerId;

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
    };
  }

  const nextAuthority:
    SpotifyAccountAuthority = {
    version:
      SPOTIFY_ACCOUNT_AUTHORITY_VERSION,
    ownerId,
    generation:
      (
        authority?.generation ??
        0
      ) + 1,
  };

  await persistSpotifyAccountAuthority(
    nextAuthority,
  );

  memorySession =
    null;

  memorySessionAccountGuard =
    null;

  spotifyConnectionGeneration +=
    1;

  return {
    guard: {
      ownerId,
      accountGeneration:
        nextAuthority.generation,
      configured: true,
    },
    persistedStateUsable: false,
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

async function persistSession(
  session: SpotifySession,
  accountGuard:
    SpotifyCanalAccountGuard,
): Promise<void> {
  await assertCanalAccountGuardCurrentUnlocked(
    accountGuard,
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

  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(
      SPOTIFY_ASYNC_STORAGE_KEY,
    );

    await assertCanalAccountGuardCurrentUnlocked(
      accountGuard,
    );

    memorySession =
      session;

    memorySessionAccountGuard =
      accountGuard;

    return;
  }

  await SecureStore.setItemAsync(
    SPOTIFY_SECURE_STORAGE_KEY,
    serialized,
  );

  try {
    await assertCanalAccountGuardCurrentUnlocked(
      accountGuard,
    );
  } catch (error) {
    memorySession =
      null;

    memorySessionAccountGuard =
      null;

    await removePersistedSpotifySessionBestEffort();

    throw error;
  }

  memorySession =
    session;

  memorySessionAccountGuard =
    accountGuard;

  await AsyncStorage.removeItem(
    SPOTIFY_ASYNC_STORAGE_KEY,
  );
}

async function hydrateSpotifySession(): Promise<
  SpotifySession | null
> {
  const {
    guard:
      accountGuard,
    persistedStateUsable,
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
): Promise<void> {
  const accountGuard =
    options.accountGuard ??
    (await captureSpotifyCanalAccountGuard());

  const normalized =
    normalizeSession(session);

  if (!normalized) {
    throw new Error(
      "Canal received an invalid Spotify session.",
    );
  }

  const previousSession =
    await runSessionMutation(
      async () => {
        await assertCanalAccountGuardCurrentUnlocked(
          accountGuard,
        );

        const storedSession =
          await hydrateSpotifySession();

        await assertCanalAccountGuardCurrentUnlocked(
          accountGuard,
        );

        await persistSession(
          normalized,
          accountGuard,
        );

        spotifyConnectionGeneration +=
          1;

        return storedSession;
      },
    );

  try {
    const {
      markAppSignedIn,
    } = await import(
      "./app-session"
    );

    await markAppSignedIn();
  } catch {
    // The Spotify connection is still valid.
  }

  const isNewConnection =
    !previousSession ||
    previousSession.profile.id !==
      normalized.profile.id;

  const shouldSync =
    options.syncLibrary ??
    isNewConnection;

  if (shouldSync) {
    try {
      const {
        syncSpotifyLibrary,
      } = await import(
        "./spotify-library"
      );

      await syncSpotifyLibrary();
    } catch (error) {
      console.warn(
        "Spotify connected, but automatic library sync failed:",
        error,
      );
    }
  }
}

export async function clearSpotifySession(): Promise<void> {
  await runSessionMutation(
    async () => {
      const {
        guard,
      } =
        await resolveCurrentCanalAccountGuardUnlocked({
          forceRotate:
            isSupabaseConfigured,
        });

      if (!guard.configured) {
        spotifyConnectionGeneration +=
          1;
      }

      memorySession =
        null;

      memorySessionAccountGuard =
        null;

      await removePersistedSpotifySessionBestEffort();
    },
  );
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
        connectionGuard.connectionGeneration
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
              spotifyConnectionGeneration +=
                1;
            }

            memorySession =
              null;

            memorySessionAccountGuard =
              null;

            await removePersistedSpotifySessionBestEffort();

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
