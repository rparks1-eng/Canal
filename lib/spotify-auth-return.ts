import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";

import {
  assertSpotifyAccountScopeCurrent,
  captureSpotifyAccountScope,
} from "./spotify-auth";

import type {
  SpotifyAccountScope,
} from "./spotify-auth";

const SPOTIFY_RETURN_ROUTE_KEY =
  "@canal/spotify-return-route";

const SPOTIFY_RETURN_STATE_VERSION =
  2;

export type SpotifyReturnRoute =
  | "/connect-music"
  | "/music-services";

export type SpotifyAuthAttempt =
  SpotifyAccountScope & {
    attemptId: string;
  };

export type SpotifyAuthStatusEvent = {
  readonly accountIdentity: string;
  readonly attempt:
    SpotifyAuthAttempt;
  readonly eventId: string;
  readonly kind:
    | "cleanup-required"
    | "locked";
  readonly message: string;
};

export type SpotifyAuthPreparationOwner = {
  readonly accountIdentity: string;
  readonly epoch: number;
};

export type SpotifyAuthPreparationLease = {
  readonly accountIdentity: string;
  readonly leaseId: number;
};

export type SpotifyAuthOperationLease =
  SpotifyAuthPreparationLease & {
    readonly attemptId: string;
    readonly lifecycleToken: number;
    readonly ownerId: string;
    readonly sessionGeneration: string;
    readonly spotifyAccountGeneration: number;
    readonly surfaceInstanceId: string;
  };

export type SpotifyAuthPromptResult = {
  response:
    AuthSession.AuthSessionResult;
  codeVerifier:
    string | null;
  requestState: string;
};

export type PreparedSpotifyAuthAttempt = {
  readonly attempt:
    SpotifyAuthAttempt;
  readonly codeVerifier: string;
  readonly request:
    SpotifyAuthRequestLike;
  readonly requestState: string;
  readonly requestUrl: string;
};

export type SpotifyAuthRequestLike = {
  codeVerifier?:
    string;
  state: string;
  url:
    | string
    | null;
  promptAsync: (
    discovery:
      AuthSession.DiscoveryDocument,
  ) => Promise<
    AuthSession.AuthSessionResult
  >;
};

type SpotifyAuthRequestLoader = (
  config:
    AuthSession.AuthRequestConfig,
  discovery:
    AuthSession.DiscoveryDocument,
) => Promise<SpotifyAuthRequestLike>;

type SpotifyAuthPreparationGuard =
  () => boolean;

type SpotifyReturnState =
  SpotifyAuthAttempt & {
    version: 2;
    route: SpotifyReturnRoute;
  };

let returnStateMutationTail:
  Promise<void> =
  Promise.resolve();

let activePreparationLease:
  SpotifyAuthPreparationLease | null =
  null;

let activeOperationLease:
  SpotifyAuthOperationLease | null =
  null;

let nextPreparationLeaseId =
  0;

let nextSurfaceInstanceId =
  0;

const announcedCleanupStatusEvents =
  new Map<string, string>();

async function runReturnStateMutation<
  Result,
>(
  mutation:
    () => Promise<Result>,
): Promise<Result> {
  const previousMutation =
    returnStateMutationTail;

  let releaseMutation:
    () => void =
      () => {};

  returnStateMutationTail =
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

function isSpotifyReturnRoute(
  value: unknown,
): value is SpotifyReturnRoute {
  return (
    value ===
      "/connect-music" ||
    value ===
      "/music-services"
  );
}

function normalizeSpotifyReturnState(
  value: string | null,
): SpotifyReturnState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        value,
      ) as Partial<SpotifyReturnState>;

    if (
      parsed.version !==
        SPOTIFY_RETURN_STATE_VERSION ||
      !isSpotifyReturnRoute(
        parsed.route,
      ) ||
      typeof parsed.attemptId !==
        "string" ||
      !parsed.attemptId.trim() ||
      typeof parsed.ownerId !==
        "string" ||
      !parsed.ownerId.trim() ||
      typeof parsed.sessionGeneration !==
        "string" ||
      !parsed.sessionGeneration.trim() ||
      typeof parsed.spotifyAccountGeneration !==
        "number" ||
      !Number.isSafeInteger(
        parsed.spotifyAccountGeneration,
      ) ||
      parsed.spotifyAccountGeneration <
        0
    ) {
      return null;
    }

    return {
      version: 2,
      route:
        parsed.route,
      attemptId:
        parsed.attemptId,
      ownerId:
        parsed.ownerId,
      sessionGeneration:
        parsed.sessionGeneration,
      spotifyAccountGeneration:
        parsed.spotifyAccountGeneration,
    };
  } catch {
    return null;
  }
}

export function isSameSpotifyAuthAttempt(
  first:
    SpotifyAuthAttempt | null,
  second:
    SpotifyAuthAttempt | null,
): boolean {
  return (
    Boolean(first) &&
    Boolean(second) &&
    first?.attemptId ===
      second?.attemptId &&
    first?.ownerId ===
      second?.ownerId &&
    first?.sessionGeneration ===
      second?.sessionGeneration &&
    first?.spotifyAccountGeneration ===
      second?.spotifyAccountGeneration
  );
}

export function isSpotifyAuthAttemptForScope(
  attempt:
    SpotifyAuthAttempt,
  scope:
    SpotifyAccountScope,
): boolean {
  return (
    attempt.ownerId ===
      scope.ownerId &&
    attempt.sessionGeneration ===
      scope.sessionGeneration &&
    attempt.spotifyAccountGeneration ===
      scope.spotifyAccountGeneration
  );
}

export function rebindSpotifyAuthAttemptAuthority(
  attempt:
    SpotifyAuthAttempt,
  authority: {
    accountGeneration: number;
    configured: boolean;
    ownerId: string | null;
  },
): SpotifyAuthAttempt {
  if (
    !authority.configured ||
    authority.ownerId !==
      attempt.ownerId ||
    !Number.isSafeInteger(
      authority.accountGeneration,
    ) ||
    authority.accountGeneration <
      attempt.spotifyAccountGeneration
  ) {
    throw new SpotifyAuthStateMismatchError();
  }

  return Object.freeze({
    ...attempt,
    spotifyAccountGeneration:
      authority.accountGeneration,
  });
}

export function isSpotifyAuthAttemptAfterProviderRotation(
  previous:
    SpotifyAuthAttempt,
  replacement:
    SpotifyAuthAttempt,
): boolean {
  return (
    previous.attemptId !==
      replacement.attemptId &&
    previous.ownerId ===
      replacement.ownerId &&
    previous.sessionGeneration ===
      replacement.sessionGeneration &&
    replacement.spotifyAccountGeneration >
      previous.spotifyAccountGeneration
  );
}

export async function createSpotifyAuthAttempt(): Promise<
  SpotifyAuthAttempt
> {
  const accountScope =
    await captureSpotifyAccountScope();

  return {
    ...accountScope,
    attemptId:
      Crypto.randomUUID(),
  };
}

export class SpotifyAuthStateMismatchError extends Error {
  constructor() {
    super(
      "Canal could not verify the Spotify authorization response. Start again with the current account.",
    );

    this.name =
      "SpotifyAuthStateMismatchError";
  }
}

export class SpotifyAuthPreparationCancelledError extends Error {
  constructor() {
    super(
      "Canal stopped an outdated Spotify authorization preparation.",
    );

    this.name =
      "SpotifyAuthPreparationCancelledError";
  }
}

function assertSpotifyAuthPreparationActive(
  canCommit:
    SpotifyAuthPreparationGuard,
): void {
  if (!canCommit()) {
    throw new SpotifyAuthPreparationCancelledError();
  }
}

export function createSpotifyLockedStatusEvent(
  attempt:
    SpotifyAuthAttempt,
  accountIdentity: string,
): SpotifyAuthStatusEvent {
  const normalizedIdentity =
    accountIdentity.trim();

  if (!normalizedIdentity) {
    throw new Error(
      "Canal cannot publish Spotify status without an account identity.",
    );
  }

  const immutableAttempt =
    Object.freeze({
      ...attempt,
    });

  return Object.freeze({
    accountIdentity:
      normalizedIdentity,
    attempt:
      immutableAttempt,
    eventId: [
      "spotify-auth",
      "locked",
      encodeURIComponent(
        normalizedIdentity,
      ),
      immutableAttempt.attemptId,
      immutableAttempt
        .spotifyAccountGeneration,
    ].join(":"),
    kind: "locked",
    message:
      "Spotify authorization is already in progress. Try again.",
  });
}

export function createSpotifyCleanupStatusEvent(
  cleanup: {
    cleanupId: string;
    ownerId: string;
    sessionGeneration: string;
    spotifyAccountGeneration: number;
  },
  accountIdentity: string,
): SpotifyAuthStatusEvent {
  const normalizedIdentity =
    accountIdentity.trim();

  return Object.freeze({
    accountIdentity:
      normalizedIdentity,
    attempt: Object.freeze({
      attemptId:
        cleanup.cleanupId,
      ownerId:
        cleanup.ownerId,
      sessionGeneration:
        cleanup.sessionGeneration,
      spotifyAccountGeneration:
        cleanup.spotifyAccountGeneration,
    }),
    eventId: [
      "cleanup-required",
      encodeURIComponent(
        normalizedIdentity,
      ),
      cleanup.cleanupId,
    ].join(":"),
    kind:
      "cleanup-required",
    message:
      "Spotify account cleanup must finish before another account can connect. Retry cleanup for this Canal account.",
  });
}

export function announceSpotifyAuthStatusEvent(
  event:
    SpotifyAuthStatusEvent | null,
  currentAccountIdentity: string,
  announcedEventId:
    | string
    | null,
  announce:
    (message: string) => void,
): string | null {
  if (
    !event ||
    event.accountIdentity !==
      currentAccountIdentity ||
    event.eventId ===
      announcedEventId ||
    (
      event.kind ===
        "cleanup-required" &&
      announcedCleanupStatusEvents.get(
        event.accountIdentity,
      ) ===
        event.eventId
    )
  ) {
    return announcedEventId;
  }

  announce(
    event.message,
  );

  if (
    event.kind ===
    "cleanup-required"
  ) {
    announcedCleanupStatusEvents.set(
      event.accountIdentity,
      event.eventId,
    );

    if (
      announcedCleanupStatusEvents.size >
      64
    ) {
      const oldestIdentity =
        announcedCleanupStatusEvents
          .keys()
          .next()
          .value;

      if (
        typeof oldestIdentity ===
        "string"
      ) {
        announcedCleanupStatusEvents.delete(
          oldestIdentity,
        );
      }
    }
  }

  return event.eventId;
}

export function isSpotifyAuthPreparationOwnerCurrent(
  expected:
    SpotifyAuthPreparationOwner,
  currentAccountIdentity: string,
  currentOwner:
    SpotifyAuthPreparationOwner | null,
): boolean {
  return (
    expected.accountIdentity ===
      currentAccountIdentity &&
    currentOwner?.accountIdentity ===
      expected.accountIdentity &&
    currentOwner.epoch ===
      expected.epoch
  );
}

export function acquireSpotifyAuthPreparationLease(
  accountIdentity: string,
): SpotifyAuthPreparationLease {
  const normalizedIdentity =
    accountIdentity.trim();

  if (!normalizedIdentity) {
    throw new Error(
      "Canal cannot prepare Spotify authorization without an account identity.",
    );
  }

  nextPreparationLeaseId +=
    1;

  const lease =
    Object.freeze({
      accountIdentity:
        normalizedIdentity,
      leaseId:
        nextPreparationLeaseId,
    });

  activePreparationLease =
    lease;
  activeOperationLease =
    null;

  return lease;
}

export function createSpotifyAuthSurfaceInstanceId(
  surface: string,
): string {
  const normalizedSurface =
    surface.trim();

  if (!normalizedSurface) {
    throw new Error(
      "Canal cannot create a Spotify authorization surface without a name.",
    );
  }

  nextSurfaceInstanceId +=
    1;

  return `${normalizedSurface}:${nextSurfaceInstanceId}`;
}

export function acquireSpotifyAuthOperationLease(
  preparationLease:
    SpotifyAuthPreparationLease,
  attempt:
    SpotifyAuthAttempt,
  surfaceInstanceId: string,
  lifecycleToken: number,
): SpotifyAuthOperationLease {
  if (
    !isSpotifyAuthPreparationLeaseCurrent(
      preparationLease,
    ) ||
    !surfaceInstanceId.trim() ||
    !Number.isSafeInteger(
      lifecycleToken,
    ) ||
    lifecycleToken < 0
  ) {
    throw new Error(
      "Canal cannot start an outdated Spotify authorization operation.",
    );
  }

  const lease =
    Object.freeze({
      ...preparationLease,
      attemptId:
        attempt.attemptId,
      lifecycleToken,
      ownerId:
        attempt.ownerId,
      sessionGeneration:
        attempt.sessionGeneration,
      spotifyAccountGeneration:
        attempt.spotifyAccountGeneration,
      surfaceInstanceId:
        surfaceInstanceId.trim(),
    });

  activeOperationLease =
    lease;

  return lease;
}

export function isSpotifyAuthOperationLeaseCurrent(
  lease:
    SpotifyAuthOperationLease,
): boolean {
  return (
    isSpotifyAuthPreparationLeaseCurrent(
      lease,
    ) &&
    activeOperationLease?.leaseId ===
      lease.leaseId &&
    activeOperationLease
      .surfaceInstanceId ===
      lease.surfaceInstanceId &&
    activeOperationLease
      .lifecycleToken ===
      lease.lifecycleToken &&
    activeOperationLease
      .attemptId ===
      lease.attemptId &&
    activeOperationLease.ownerId ===
      lease.ownerId &&
    activeOperationLease
      .sessionGeneration ===
      lease.sessionGeneration &&
    activeOperationLease
      .spotifyAccountGeneration ===
      lease.spotifyAccountGeneration
  );
}

export function releaseSpotifyAuthOperationLease(
  lease:
    SpotifyAuthOperationLease,
): boolean {
  if (
    !isSpotifyAuthOperationLeaseCurrent(
      lease,
    )
  ) {
    return false;
  }

  activeOperationLease =
    null;
  activePreparationLease =
    null;

  return true;
}

export function isSpotifyAuthPreparationLeaseCurrent(
  lease:
    SpotifyAuthPreparationLease,
): boolean {
  return (
    activePreparationLease?.leaseId ===
      lease.leaseId &&
    activePreparationLease
      .accountIdentity ===
      lease.accountIdentity
  );
}

export function releaseSpotifyAuthPreparationLease(
  lease:
    SpotifyAuthPreparationLease,
): boolean {
  if (
    !isSpotifyAuthPreparationLeaseCurrent(
      lease,
    )
  ) {
    return false;
  }

  activePreparationLease =
    null;
  activeOperationLease =
    null;

  return true;
}

export async function prepareSpotifyAuthAttempt(
  route:
    SpotifyReturnRoute,
  config:
    Omit<
      AuthSession.AuthRequestConfig,
      "state"
    >,
  discovery:
    AuthSession.DiscoveryDocument,
  loadRequest:
    SpotifyAuthRequestLoader =
    (
      requestConfig,
      requestDiscovery,
    ) =>
      AuthSession.loadAsync(
        requestConfig,
        requestDiscovery,
      ),
  canCommit:
    SpotifyAuthPreparationGuard =
    () => true,
): Promise<PreparedSpotifyAuthAttempt> {
  assertSpotifyAuthPreparationActive(
    canCommit,
  );

  const attempt =
    await createSpotifyAuthAttempt();

  assertSpotifyAuthPreparationActive(
    canCommit,
  );

  const request =
    await loadRequest(
      {
        ...config,
        state:
          attempt.attemptId,
        usePKCE: true,
      },
      discovery,
    );

  assertSpotifyAuthPreparationActive(
    canCommit,
  );

  await assertSpotifyAccountScopeCurrent(
    attempt,
  );

  assertSpotifyAuthPreparationActive(
    canCommit,
  );

  if (
    request.state !==
      attempt.attemptId ||
    !request.codeVerifier ||
    !request.url
  ) {
    throw new SpotifyAuthStateMismatchError();
  }

  try {
    await saveSpotifyReturnRoute(
      route,
      attempt,
      canCommit,
    );

    assertSpotifyAuthPreparationActive(
      canCommit,
    );

    await assertSpotifyAccountScopeCurrent(
      attempt,
    );
  } catch (error) {
    await clearSpotifyReturnRoute(
      attempt,
    );

    throw error;
  }

  return Object.freeze({
    attempt:
      Object.freeze({
        ...attempt,
      }),
    codeVerifier:
      request.codeVerifier,
    request,
    requestState:
      request.state,
    requestUrl:
      request.url,
  });
}

export function promptSpotifyAuthAttempt(
  prepared:
    PreparedSpotifyAuthAttempt,
  discovery:
    AuthSession.DiscoveryDocument,
): Promise<SpotifyAuthPromptResult> {
  const response =
    prepared.request.promptAsync(
      discovery,
    );

  return response.then(
    async (
      result,
    ) => {
      await assertSpotifyAccountScopeCurrent(
        prepared.attempt,
      );

      if (
        prepared.request.state !==
          prepared.requestState ||
        prepared.request.url !==
          prepared.requestUrl ||
        prepared.request.codeVerifier !==
          prepared.codeVerifier ||
        (
          (
            result.type ===
              "success" ||
            result.type ===
              "error"
          ) &&
          (
            result.params.state !==
              prepared
                .attempt
                .attemptId ||
            result.params.state !==
              prepared.requestState
          )
        )
      ) {
        throw new SpotifyAuthStateMismatchError();
      }

      return {
        response:
          result,
        codeVerifier:
          prepared.codeVerifier,
        requestState:
          prepared.requestState,
      };
    },
  );
}

export async function saveSpotifyReturnRoute(
  route:
    SpotifyReturnRoute,
  attempt:
    SpotifyAuthAttempt,
  canCommit:
    SpotifyAuthPreparationGuard =
    () => true,
): Promise<void> {
  assertSpotifyAuthPreparationActive(
    canCommit,
  );

  await assertSpotifyAccountScopeCurrent(
    attempt,
  );

  assertSpotifyAuthPreparationActive(
    canCommit,
  );

  await runReturnStateMutation(
    async () => {
      assertSpotifyAuthPreparationActive(
        canCommit,
      );

      await assertSpotifyAccountScopeCurrent(
        attempt,
      );

      assertSpotifyAuthPreparationActive(
        canCommit,
      );

      const state:
        SpotifyReturnState = {
        version: 2,
        route,
        ...attempt,
      };

      await AsyncStorage.setItem(
        SPOTIFY_RETURN_ROUTE_KEY,
        JSON.stringify(
          state,
        ),
      );

      if (!canCommit()) {
        const persistedState =
          normalizeSpotifyReturnState(
            await AsyncStorage.getItem(
              SPOTIFY_RETURN_ROUTE_KEY,
            ),
          );

        if (
          isSameSpotifyAuthAttempt(
            persistedState,
            attempt,
          )
        ) {
          await AsyncStorage.removeItem(
            SPOTIFY_RETURN_ROUTE_KEY,
          );
        }

        throw new SpotifyAuthPreparationCancelledError();
      }

      await assertSpotifyAccountScopeCurrent(
        attempt,
      );

      assertSpotifyAuthPreparationActive(
        canCommit,
      );
    },
  );
}

export async function readSpotifyReturnRoute(): Promise<SpotifyReturnRoute> {
  try {
    const accountScope =
      await captureSpotifyAccountScope();

    return await runReturnStateMutation(
      async () => {
        const state =
          normalizeSpotifyReturnState(
            await AsyncStorage.getItem(
              SPOTIFY_RETURN_ROUTE_KEY,
            ),
          );

        await assertSpotifyAccountScopeCurrent(
          accountScope,
        );

        if (
          !state ||
          !isSpotifyAuthAttemptForScope(
            state,
            accountScope,
          )
        ) {
          return "/music-services";
        }

        return state.route;
      },
    );
  } catch {
    return "/music-services";
  }
}

export async function clearSpotifyReturnRoute(
  expectedAttempt:
    SpotifyAuthAttempt,
): Promise<boolean> {
  return runReturnStateMutation(
    async () => {
      const state =
        normalizeSpotifyReturnState(
          await AsyncStorage.getItem(
            SPOTIFY_RETURN_ROUTE_KEY,
          ),
        );

      if (
        !isSameSpotifyAuthAttempt(
          state,
          expectedAttempt,
        )
      ) {
        return false;
      }

      await AsyncStorage.removeItem(
        SPOTIFY_RETURN_ROUTE_KEY,
      );

      return true;
    },
  );
}
