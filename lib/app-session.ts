import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  CanalAccountSessionChangedError,
  runCanalAccountSessionMutation,
} from "./canal-auth";

import type {
  CanalAccountSessionGuard,
  CanalAccountSessionStatus,
} from "./canal-auth";

import {
  createCanalAccountCleanupRecord,
  listCanalAccountCleanupRecords,
  persistCanalAccountCleanupRecord,
  removeCanalAccountCleanupRecord,
  updateCanalAccountCleanupRecord,
} from "./account-cleanup";

import type {
  CanalAccountCleanupRecord,
  CanalAccountCleanupTarget,
} from "./account-cleanup";

import {
  clearPlayerSessionForOwner,
} from "./canal-player";

import {
  invalidateSceneStudio,
} from "./scene-studio-lifecycle";

import {
  captureSpotifyCanalAccountGuard,
  clearSpotifySession,
  readSpotifyConnectionStateForAccount,
  retrySpotifySessionCleanup,
  SPOTIFY_SESSION_CLEANUP_TARGETS,
} from "./spotify-auth";

import type {
  SpotifyCanalAccountGuard,
  SpotifyConnectionStateForAccount,
  SpotifySessionCleanupResult,
} from "./spotify-auth";

const APP_SESSION_KEY =
  "@canal/app-session";

type StoredAppSession = {
  signedIn: boolean;
  signedInAt?: string;
};

export type CanalAccountActionRecovery =
  | "cleanup"
  | "none"
  | "signout";

export type CanalAccountActionResult = {
  userId: string;
  spotifyDisconnected: boolean;
  signedOut: boolean;
  cleanupIncomplete:
    CanalAccountCleanupRecord | null;
  cleanupPersisted: boolean;
  recovery:
    CanalAccountActionRecovery;
};

export class CanalLogoutIncompleteError extends Error {
  result:
    CanalAccountActionResult;
  canalSessionStatus:
    CanalAccountSessionStatus;
  spotifyConnectionState:
    SpotifyConnectionStateForAccount;

  constructor(
    result:
      CanalAccountActionResult,
    canalSessionStatus:
      CanalAccountSessionStatus,
    spotifyConnectionState:
      SpotifyConnectionStateForAccount,
    cause?: unknown,
  ) {
    const message =
      canalSessionStatus ===
        "same-account"
        ? "Spotify is disconnected, but this device is still signed in to Canal. Retry Log Out."
        : canalSessionStatus ===
            "account-changed"
          ? "The Canal account changed. Spotify cleanup finished only for the original account, and the current account was not logged out."
          : canalSessionStatus ===
              "signed-out"
            ? "Canal finished logging out locally."
            : "Spotify is disconnected, but Canal could not verify whether this device finished logging out. Check the current account before retrying.";

    super(
      message,
      {
        cause,
      },
    );

    this.name =
      "CanalLogoutIncompleteError";

    this.result =
      result;
    this.canalSessionStatus =
      canalSessionStatus;
    this.spotifyConnectionState =
      spotifyConnectionState;
  }
}

export async function markAppSignedIn(): Promise<void> {
  const session: StoredAppSession = {
    signedIn: true,

    signedInAt:
      new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    APP_SESSION_KEY,
    JSON.stringify(session),
  );
}

export async function readAppSignedIn(): Promise<boolean> {
  const serialized =
    await AsyncStorage.getItem(
      APP_SESSION_KEY,
    );

  if (!serialized) {
    return false;
  }

  try {
    const parsed =
      JSON.parse(
        serialized,
      ) as Partial<StoredAppSession>;

    return parsed.signedIn === true;
  } catch {
    return false;
  }
}

export async function resolveAppSignedIn(): Promise<boolean> {
  const appSignedIn =
    await readAppSignedIn();

  if (appSignedIn) {
    return true;
  }

  try {
    const {
      getValidSpotifySession,
    } = await import(
      "./spotify-auth"
    );

    const spotifySession =
      await getValidSpotifySession();

    if (spotifySession) {
      await markAppSignedIn();

      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function bootstrapConnectedMusic(): Promise<void> {
  try {
    const {
      getValidSpotifySession,
    } = await import(
      "./spotify-auth"
    );

    const spotifySession =
      await getValidSpotifySession();

    if (!spotifySession) {
      return;
    }

    const {
      readSpotifyLibrarySnapshot,
      syncSpotifyLibrary,
    } = await import(
      "./spotify-library"
    );

    const snapshot =
      await readSpotifyLibrarySnapshot();

    if (!snapshot) {
      await syncSpotifyLibrary();
    }
  } catch (error) {
    console.warn(
      "Canal could not bootstrap the Spotify library:",
      error,
    );
  }
}

async function captureOwnedSpotifyGuard(
  accountGuard:
    CanalAccountSessionGuard,
): Promise<SpotifyCanalAccountGuard> {
  const spotifyGuard =
    await captureSpotifyCanalAccountGuard();

  if (
    spotifyGuard.ownerId !==
    accountGuard.userId
  ) {
    throw new CanalAccountSessionChangedError();
  }

  return spotifyGuard;
}

function hasSpotifyCleanupTargets(
  record:
    CanalAccountCleanupRecord,
): boolean {
  return record.targets.some(
    (target) =>
      target.startsWith(
        "spotify-",
      ),
  );
}

function actionResult(
  userId: string,
  options: {
    spotifyDisconnected: boolean;
    signedOut?: boolean;
    cleanupIncomplete?:
      CanalAccountCleanupRecord | null;
    cleanupPersisted?: boolean;
    recovery?:
      CanalAccountActionRecovery;
  },
): CanalAccountActionResult {
  return {
    userId,
    spotifyDisconnected:
      options.spotifyDisconnected,
    signedOut:
      options.signedOut ??
      false,
    cleanupIncomplete:
      options.cleanupIncomplete ??
      null,
    cleanupPersisted:
      options.cleanupPersisted ??
      true,
    recovery:
      options.recovery ??
      "none",
  };
}

async function prepareCleanupRecord(
  accountGuard:
    CanalAccountSessionGuard,
  spotifyGuard:
    SpotifyCanalAccountGuard,
  action:
    "canal-logout" | "spotify-disconnect",
  targets:
    readonly CanalAccountCleanupTarget[],
): Promise<CanalAccountCleanupRecord> {
  const record =
    createCanalAccountCleanupRecord(
      {
        ownerId:
          accountGuard.userId,
        sessionGeneration:
          accountGuard.sessionGeneration,
        sourceSpotifyAccountGeneration:
          spotifyGuard.accountGeneration,
        sourceSpotifyProfileId:
          null,
        spotifyAccountGeneration:
          spotifyGuard.configured
            ? spotifyGuard.accountGeneration +
              1
            : spotifyGuard.accountGeneration,
      },
      action,
      targets,
    );

  /*
   * This durable intent must exist before authority rotation or
   * any local deletion. A storage failure therefore fails closed.
   */
  await persistCanalAccountCleanupRecord(
    record,
  );

  return record;
}

async function persistCleanupProgress(
  record:
    CanalAccountCleanupRecord,
): Promise<{
  record:
    CanalAccountCleanupRecord;
  persisted: boolean;
}> {
  try {
    await persistCanalAccountCleanupRecord(
      record,
    );

    return {
      record,
      persisted: true,
    };
  } catch {
    return {
      record,
      persisted: false,
    };
  }
}

async function finishDisconnectCleanupMarker(
  record:
    CanalAccountCleanupRecord,
): Promise<{
  cleanupIncomplete:
    CanalAccountCleanupRecord | null;
  cleanupPersisted: boolean;
}> {
  const completedRecord =
    updateCanalAccountCleanupRecord(
      record,
      {
        phase:
          "cleanup-complete",
      },
    );

  const persisted =
    await persistCleanupProgress(
      completedRecord,
    );

  if (!persisted.persisted) {
    return {
      cleanupIncomplete:
        persisted.record,
      cleanupPersisted:
        false,
    };
  }

  try {
    await removeCanalAccountCleanupRecord(
      completedRecord,
    );

    return {
      cleanupIncomplete:
        null,
      cleanupPersisted:
        true,
    };
  } catch {
    return {
      cleanupIncomplete:
        completedRecord,
      cleanupPersisted:
        true,
    };
  }
}

async function clearPlayerCleanupTarget(
  record:
    CanalAccountCleanupRecord,
): Promise<{
  record:
    CanalAccountCleanupRecord;
  persisted: boolean;
}> {
  if (
    !record.targets.includes(
      "player-session",
    )
  ) {
    return {
      record,
      persisted: true,
    };
  }

  let nextRecord =
    record;

  try {
    await clearPlayerSessionForOwner(
      record.ownerId,
    );

    nextRecord =
      updateCanalAccountCleanupRecord(
        record,
        {
          targets:
            record.targets.filter(
              (target) =>
                target !==
                "player-session",
            ),
        },
      );
  } catch {
    // The owner-scoped marker retains only this playback retry.
  }

  return persistCleanupProgress(
    nextRecord,
  );
}

async function readLogoutFailureState(
  cleanupResult:
    SpotifySessionCleanupResult,
  readCurrentStatus:
    () => Promise<CanalAccountSessionStatus>,
): Promise<{
  canalSessionStatus:
    CanalAccountSessionStatus;
  spotifyConnectionState:
    SpotifyConnectionStateForAccount;
}> {
  const [
    canalSessionStatus,
    spotifyConnectionState,
  ] =
    await Promise.all([
      readCurrentStatus(),
      readSpotifyConnectionStateForAccount(
        cleanupResult.accountGuard,
      ),
    ]);

  return {
    canalSessionStatus,
    spotifyConnectionState,
  };
}

async function signOutAfterCompletedCleanup(
  userId: string,
  record:
    CanalAccountCleanupRecord,
  cleanupResult:
    SpotifySessionCleanupResult,
  readCurrentStatus:
    () => Promise<CanalAccountSessionStatus>,
  signOutLocal:
    () => Promise<void>,
): Promise<CanalAccountActionResult> {
  const signOutRecord =
    updateCanalAccountCleanupRecord(
      record,
      {
        phase:
          "signout-pending",
      },
    );

  /*
   * Persisting this phase makes every later recovery sign-out-only.
   * Confirmed provider/player cleanup is never replayed.
   */
  await persistCanalAccountCleanupRecord(
    signOutRecord,
  );

  try {
    await signOutLocal();
  } catch (error) {
    const state =
      await readLogoutFailureState(
        cleanupResult,
        readCurrentStatus,
      );

    if (
      state.canalSessionStatus ===
        "signed-out"
    ) {
      try {
        await removeCanalAccountCleanupRecord(
          signOutRecord,
        );

        return actionResult(
          userId,
          {
            spotifyDisconnected:
              state.spotifyConnectionState !==
              "connected",
            signedOut:
              true,
          },
        );
      } catch {
        return actionResult(
          userId,
          {
            spotifyDisconnected:
              state.spotifyConnectionState !==
              "connected",
            signedOut:
              true,
            cleanupIncomplete:
              signOutRecord,
            recovery:
              "cleanup",
          },
        );
      }
    }

    throw new CanalLogoutIncompleteError(
      actionResult(
        userId,
        {
          spotifyDisconnected:
            state.spotifyConnectionState !==
            "connected",
          cleanupIncomplete:
            signOutRecord,
          recovery:
            "signout",
        },
      ),
      state.canalSessionStatus,
      state.spotifyConnectionState,
      error,
    );
  }

  try {
    await removeCanalAccountCleanupRecord(
      signOutRecord,
    );

    return actionResult(
      userId,
      {
        spotifyDisconnected:
          true,
        signedOut:
          true,
      },
    );
  } catch {
    return actionResult(
      userId,
      {
        spotifyDisconnected:
          true,
        signedOut:
          true,
        cleanupIncomplete:
          signOutRecord,
        recovery:
          "cleanup",
      },
    );
  }
}

export async function disconnectSpotifyOnly(): Promise<
  CanalAccountActionResult
> {
  return runCanalAccountSessionMutation(
    async ({
      guard,
      assertCurrent,
    }) => {
      const spotifyGuard =
        await captureOwnedSpotifyGuard(
          guard,
        );

      const cleanupRecord =
        await prepareCleanupRecord(
          guard,
          spotifyGuard,
          "spotify-disconnect",
          SPOTIFY_SESSION_CLEANUP_TARGETS,
        );

      const cleanupResult =
        await clearSpotifySession(
          spotifyGuard,
          cleanupRecord,
        );

      await assertCurrent();

      await invalidateSceneStudio({
        reason: "disconnect",
        ownerId: guard.userId,
      });

      const currentRecord =
        cleanupResult.cleanupIncomplete ??
        cleanupRecord;

      if (
        hasSpotifyCleanupTargets(
          currentRecord,
        ) ||
        !cleanupResult.cleanupPersisted
      ) {
        return actionResult(
          guard.userId,
          {
            spotifyDisconnected:
              true,
            cleanupIncomplete:
              currentRecord,
            cleanupPersisted:
              cleanupResult.cleanupPersisted,
            recovery:
              "cleanup",
          },
        );
      }

      const finalized =
        await finishDisconnectCleanupMarker(
          currentRecord,
        );

      return actionResult(
        guard.userId,
        {
          spotifyDisconnected:
            true,
          cleanupIncomplete:
            finalized.cleanupIncomplete,
          cleanupPersisted:
            finalized.cleanupPersisted,
          recovery:
            finalized.cleanupIncomplete
              ? "cleanup"
              : "none",
        },
      );
    },
  );
}

export async function logoutAllMusicPlatforms(): Promise<
  CanalAccountActionResult
> {
  return runCanalAccountSessionMutation(
    async ({
      guard,
      assertCurrent,
      readCurrentStatus,
      signOutLocal,
    }) => {
      const spotifyGuard =
        await captureOwnedSpotifyGuard(
          guard,
        );

      const cleanupRecord =
        await prepareCleanupRecord(
          guard,
          spotifyGuard,
          "canal-logout",
          [
            ...SPOTIFY_SESSION_CLEANUP_TARGETS,
            "player-session",
          ],
        );

      const spotifyCleanup =
        await clearSpotifySession(
          spotifyGuard,
          cleanupRecord,
        );

      await assertCurrent();

      await invalidateSceneStudio({
        reason: "logout",
        ownerId: guard.userId,
      });

      let currentRecord =
        spotifyCleanup.cleanupIncomplete ??
        cleanupRecord;

      if (
        hasSpotifyCleanupTargets(
          currentRecord,
        ) ||
        !spotifyCleanup.cleanupPersisted
      ) {
        return actionResult(
          guard.userId,
          {
            spotifyDisconnected:
              true,
            cleanupIncomplete:
              currentRecord,
            cleanupPersisted:
              spotifyCleanup.cleanupPersisted,
            recovery:
              "cleanup",
          },
        );
      }

      const playerCleanup =
        await clearPlayerCleanupTarget(
          currentRecord,
        );

      currentRecord =
        playerCleanup.record;

      await assertCurrent();

      if (
        currentRecord.targets.length >
          0 ||
        !playerCleanup.persisted
      ) {
        return actionResult(
          guard.userId,
          {
            spotifyDisconnected:
              true,
            cleanupIncomplete:
              currentRecord,
            cleanupPersisted:
              playerCleanup.persisted,
            recovery:
              "cleanup",
          },
        );
      }

      return signOutAfterCompletedCleanup(
        guard.userId,
        currentRecord,
        spotifyCleanup,
        readCurrentStatus,
        signOutLocal,
      );
    },
  );
}

export async function retryIncompleteAccountCleanup(
  options: {
    allowSignOut?: boolean;
  } = {},
): Promise<CanalAccountActionResult | null> {
  return runCanalAccountSessionMutation(
    async ({
      guard,
      assertCurrent,
      readCurrentStatus,
      signOutLocal,
    }) => {
      const spotifyGuard =
        await captureOwnedSpotifyGuard(
          guard,
        );

      const records =
        await listCanalAccountCleanupRecords({
          ownerId:
            guard.userId,
          sessionGeneration:
            guard.sessionGeneration,
          spotifyAccountGeneration:
            spotifyGuard.accountGeneration,
        });

      let record =
        records[0] ??
        null;

      if (!record) {
        return null;
      }

      if (
        record.phase ===
          "cleanup-complete"
      ) {
        try {
          await removeCanalAccountCleanupRecord(
            record,
          );

          return actionResult(
            guard.userId,
            {
              spotifyDisconnected:
                true,
            },
          );
        } catch {
          return actionResult(
            guard.userId,
            {
              spotifyDisconnected:
                true,
              cleanupIncomplete:
                record,
              recovery:
                "cleanup",
            },
          );
        }
      }

      const placeholderSpotifyResult:
        SpotifySessionCleanupResult = {
        accountGuard:
          spotifyGuard,
        cleanupIncomplete:
          record,
        cleanupPersisted:
          true,
      };

      if (
        record.phase ===
          "cleanup-pending" &&
        hasSpotifyCleanupTargets(
          record,
        )
      ) {
        const retriedSpotify =
          await retrySpotifySessionCleanup(
            record,
            spotifyGuard,
          );

        record =
          retriedSpotify.cleanupIncomplete ??
          record;

        placeholderSpotifyResult.cleanupIncomplete =
          record;
        placeholderSpotifyResult.cleanupPersisted =
          retriedSpotify.cleanupPersisted;

        await assertCurrent();

        if (
          hasSpotifyCleanupTargets(
            record,
          ) ||
          !retriedSpotify.cleanupPersisted
        ) {
          return actionResult(
            guard.userId,
            {
              spotifyDisconnected:
                true,
              cleanupIncomplete:
                record,
              cleanupPersisted:
                retriedSpotify.cleanupPersisted,
              recovery:
                "cleanup",
            },
          );
        }
      }

      if (
        record.phase ===
          "cleanup-pending"
      ) {
        const playerCleanup =
          await clearPlayerCleanupTarget(
            record,
          );

        record =
          playerCleanup.record;

        await assertCurrent();

        if (
          record.targets.length >
            0 ||
          !playerCleanup.persisted
        ) {
          return actionResult(
            guard.userId,
            {
              spotifyDisconnected:
                true,
              cleanupIncomplete:
                record,
              cleanupPersisted:
                playerCleanup.persisted,
              recovery:
                "cleanup",
            },
          );
        }

        if (
          record.action ===
            "spotify-disconnect" ||
          record.action ===
            "authority-rotation"
        ) {
          const finalized =
            await finishDisconnectCleanupMarker(
              record,
            );

          return actionResult(
            guard.userId,
            {
              spotifyDisconnected:
                true,
              cleanupIncomplete:
                finalized.cleanupIncomplete,
              cleanupPersisted:
                finalized.cleanupPersisted,
              recovery:
                finalized.cleanupIncomplete
                  ? "cleanup"
                  : "none",
            },
          );
        }

        record =
          updateCanalAccountCleanupRecord(
            record,
            {
              phase:
                "signout-pending",
            },
          );

        await persistCanalAccountCleanupRecord(
          record,
        );
      }

      if (
        record.phase !==
          "signout-pending"
      ) {
        return actionResult(
          guard.userId,
          {
            spotifyDisconnected:
              true,
            cleanupIncomplete:
              record,
            recovery:
              "cleanup",
          },
        );
      }

      if (
        !options.allowSignOut
      ) {
        return actionResult(
          guard.userId,
          {
            spotifyDisconnected:
              true,
            cleanupIncomplete:
              record,
            recovery:
              "signout",
          },
        );
      }

      return signOutAfterCompletedCleanup(
        guard.userId,
        record,
        placeholderSpotifyResult,
        readCurrentStatus,
        signOutLocal,
      );
    },
  );
}

export function isCanalAccountChangedError(
  error: unknown,
): boolean {
  return (
    error instanceof
      CanalAccountSessionChangedError ||
    (
      error instanceof Error &&
      (
        error.name ===
          "CanalAccountSessionChangedError" ||
        error.name ===
          "SpotifySessionChangedError" ||
        error.message
          .toLowerCase()
          .includes(
            "account changed",
          )
      )
    )
  );
}

export function isCanalLogoutIncompleteError(
  error: unknown,
): error is CanalLogoutIncompleteError {
  return (
    error instanceof
      CanalLogoutIncompleteError ||
    (
      error instanceof Error &&
      error.name ===
        "CanalLogoutIncompleteError"
    )
  );
}

export async function clearLocalAccountAfterDeletion(): Promise<void> {
  try {
    const {
      clearSpotifySession,
    } = await import(
      "./spotify-auth"
    );

    await clearSpotifySession();
  } catch {
    // The remote account deletion is authoritative.
  }

  try {
    const {
      clearPlayerSession,
    } = await import(
      "./canal-player"
    );

    await clearPlayerSession();
  } catch {
    // Player state may not exist on this device.
  }

  try {
    const {
      supabase,
    } = await import(
      "./supabase"
    );

    await supabase.auth.signOut({
      scope: "local",
    });
  } catch {
    // Clearing app storage below also removes the local auth session.
  }

  await AsyncStorage.clear();
}
