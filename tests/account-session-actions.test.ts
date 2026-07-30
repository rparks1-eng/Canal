import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  mockAsyncStorage,
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  disconnectSpotifyOnly,
  logoutAllMusicPlatforms,
  markAppSignedIn,
  retryIncompleteAccountCleanup,
} from "../lib/app-session";

import {
  createCanalAccountCleanupRecord,
  persistCanalAccountCleanupRecord,
  readCanalAccountCleanupRecord,
  updateCanalAccountCleanupRecord,
} from "../lib/account-cleanup";

import {
  runCanalAccountSessionMutation,
} from "../lib/canal-auth";

import {
  clearPlayerSessionForOwner,
} from "../lib/canal-player";

import {
  captureSpotifyCanalAccountGuard,
  clearSpotifySession,
  readSpotifyConnectionStateForAccount,
  retrySpotifySessionCleanup,
} from "../lib/spotify-auth";

const USER_A =
  "00000000-0000-4000-8000-000000000001";

const USER_B =
  "00000000-0000-4000-8000-000000000002";

const ACCOUNT_A = {
  userId:
    USER_A,
  epoch: 7,
  sessionGeneration:
    "session:a-1",
};

const SPOTIFY_GUARD_A = {
  ownerId:
    USER_A,
  accountGeneration: 4,
  configured: true,
};

jest.mock(
  "../lib/canal-auth",
  () => ({
    CanalAccountSessionChangedError:
      class CanalAccountSessionChangedError extends Error {
        constructor() {
          super(
            "The Canal account changed while this action was running.",
          );

          this.name =
            "CanalAccountSessionChangedError";
        }
      },
    runCanalAccountSessionMutation:
      jest.fn(),
  }),
);

jest.mock(
  "../lib/spotify-auth",
  () => ({
    SPOTIFY_SESSION_CLEANUP_TARGETS: [
      "spotify-async-session",
      "spotify-secure-session",
      "spotify-library-snapshot",
      "spotify-return-route",
      "spotify-cache-scan",
      "spotify-cache-entries",
    ],
    captureSpotifyCanalAccountGuard:
      jest.fn(),
    clearSpotifySession:
      jest.fn(),
    readSpotifyConnectionStateForAccount:
      jest.fn(),
    retrySpotifySessionCleanup:
      jest.fn(),
  }),
);

jest.mock(
  "../lib/canal-player",
  () => ({
    clearPlayerSessionForOwner:
      jest.fn(),
  }),
);

const mockRunCanalMutation =
  jest.mocked(
    runCanalAccountSessionMutation,
  );

const mockMutationAssert =
  jest.fn<
    () => Promise<void>
  >();

const mockMutationReadStatus =
  jest.fn<
    () => Promise<
      | "account-changed"
      | "same-account"
      | "signed-out"
      | "unknown"
    >
  >();

const mockMutationSignOut =
  jest.fn<
    () => Promise<void>
  >();

const mockCaptureSpotifyGuard =
  jest.mocked(
    captureSpotifyCanalAccountGuard,
  );

const mockClearSpotify =
  jest.mocked(
    clearSpotifySession,
  );

const mockReadSpotifyState =
  jest.mocked(
    readSpotifyConnectionStateForAccount,
  );

const mockRetrySpotifyCleanup =
  jest.mocked(
    retrySpotifySessionCleanup,
  );

const mockClearPlayerForOwner =
  jest.mocked(
    clearPlayerSessionForOwner,
  );

function resetAsyncStorage(): void {
  mockStorage.clear();

  mockAsyncStorage.getItem
    .mockImplementation(
      async (key) =>
        mockStorage.get(
          key,
        ) ??
        null,
    );

  mockAsyncStorage.setItem
    .mockImplementation(
      async (
        key,
        value,
      ) => {
        mockStorage.set(
          key,
          value,
        );
      },
    );

  mockAsyncStorage.removeItem
    .mockImplementation(
      async (key) => {
        mockStorage.delete(
          key,
        );
      },
    );
}

function installMutationContext(
  account = ACCOUNT_A,
): void {
  mockRunCanalMutation
    .mockImplementation(
      async (mutation) =>
        mutation({
          guard:
            account,
          assertCurrent:
            mockMutationAssert,
          readCurrentStatus:
            mockMutationReadStatus,
          signOutLocal:
            mockMutationSignOut,
        }),
    );
}

describe(
  "account-scoped logout and Spotify disconnect",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
      resetAsyncStorage();

      mockMutationAssert
        .mockResolvedValue(
          undefined,
        );

      mockMutationReadStatus
        .mockResolvedValue(
          "same-account",
        );

      mockMutationSignOut
        .mockResolvedValue(
          undefined,
        );

      installMutationContext();

      mockCaptureSpotifyGuard
        .mockResolvedValue(
          SPOTIFY_GUARD_A,
        );

      mockClearSpotify
        .mockImplementation(
          async (
            guard,
            record,
          ) => {
            if (!record) {
              throw new Error(
                "Expected a prepared cleanup record.",
              );
            }

            expect(
              Array.from(
                mockStorage.keys(),
              ).some(
                (key) =>
                  key.startsWith(
                    "@canal/account-cleanup-incomplete:",
                  ),
              ),
            ).toBe(true);

            return {
              accountGuard: {
                ...guard!,
                accountGeneration:
                  guard!
                    .accountGeneration +
                  1,
              },
              cleanupIncomplete:
                updateCanalAccountCleanupRecord(
                  record,
                  {
                    targets:
                      record.targets.filter(
                        (target) =>
                          !target.startsWith(
                            "spotify-",
                          ),
                      ),
                  },
                ),
              cleanupPersisted:
                true,
            };
          },
        );

      mockRetrySpotifyCleanup
        .mockImplementation(
          async (
            record,
            guard,
          ) => ({
            accountGuard:
              guard,
            cleanupIncomplete:
              updateCanalAccountCleanupRecord(
                record,
                {
                  targets:
                    record.targets.filter(
                      (target) =>
                        !target.startsWith(
                          "spotify-",
                        ),
                    ),
                },
              ),
            cleanupPersisted:
              true,
          }),
        );

      mockReadSpotifyState
        .mockResolvedValue(
          "disconnected",
        );

      mockClearPlayerForOwner
        .mockResolvedValue(
          true,
        );
    });

    it(
      "persists owner-scoped intent before disconnect, preserves Canal login state, and removes only the completed marker",
      async () => {
        await markAppSignedIn();

        mockStorage.set(
          "@canal/scenes:user-b",
          "preserve-scenes",
        );

        const result =
          await disconnectSpotifyOnly();

        expect(
          result,
        ).toMatchObject({
          userId:
            USER_A,
          spotifyDisconnected:
            true,
          signedOut:
            false,
          cleanupIncomplete:
            null,
          recovery:
            "none",
        });

        expect(
          mockStorage.has(
            "@canal/app-session",
          ),
        ).toBe(true);

        expect(
          mockStorage.get(
            "@canal/scenes:user-b",
          ),
        ).toBe(
          "preserve-scenes",
        );

        expect(
          Array.from(
            mockStorage.keys(),
          ).filter(
            (key) =>
              key.startsWith(
                "@canal/account-cleanup-incomplete:",
              ),
          ),
        ).toEqual([]);

        expect(
          mockMutationSignOut,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed before authority rotation when durable intent cannot be written",
      async () => {
        mockAsyncStorage.setItem
          .mockRejectedValueOnce(
            new Error(
              "storage unavailable",
            ),
          );

        await expect(
          disconnectSpotifyOnly(),
        ).rejects.toThrow(
          "storage unavailable",
        );

        expect(
          mockClearSpotify,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns partial completion for player failure, retries only that owner target, then performs signout only",
      async () => {
        mockClearPlayerForOwner
          .mockRejectedValueOnce(
            new Error(
              "player storage unavailable",
            ),
          )
          .mockResolvedValue(
            true,
          );

        const partial =
          await logoutAllMusicPlatforms();

        expect(
          partial,
        ).toMatchObject({
          spotifyDisconnected:
            true,
          signedOut:
            false,
          recovery:
            "cleanup",
          cleanupIncomplete: {
            ownerId:
              USER_A,
            sessionGeneration:
              "session:a-1",
            sourceSpotifyAccountGeneration:
              4,
            spotifyAccountGeneration:
              5,
            targets: [
              "player-session",
            ],
          },
        });

        mockCaptureSpotifyGuard
          .mockResolvedValue({
            ...SPOTIFY_GUARD_A,
            accountGeneration:
              5,
          });

        const cleanupRetry =
          await retryIncompleteAccountCleanup();

        expect(
          cleanupRetry,
        ).toMatchObject({
          signedOut:
            false,
          recovery:
            "signout",
          cleanupIncomplete: {
            phase:
              "signout-pending",
            targets: [],
          },
        });

        const signOutRetry =
          await retryIncompleteAccountCleanup({
            allowSignOut:
              true,
          });

        expect(
          signOutRetry,
        ).toMatchObject({
          signedOut:
            true,
          cleanupIncomplete:
            null,
          recovery:
            "none",
        });

        expect(
          mockClearSpotify,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mockClearPlayerForOwner,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          mockMutationSignOut,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "finishes a same-session authority rotation marker without entering Canal sign-out recovery",
      async () => {
        const rotationRecord =
          createCanalAccountCleanupRecord(
            {
              ownerId:
                USER_A,
              sessionGeneration:
                "session:a-1",
              sourceSpotifyAccountGeneration:
                4,
              sourceSpotifyProfileId:
                "spotify-a",
              spotifyAccountGeneration:
                5,
            },
            "authority-rotation",
            [],
          );

        await persistCanalAccountCleanupRecord(
          rotationRecord,
        );

        mockCaptureSpotifyGuard
          .mockResolvedValue({
            ...SPOTIFY_GUARD_A,
            accountGeneration:
              5,
          });

        await expect(
          retryIncompleteAccountCleanup(),
        ).resolves.toMatchObject({
          cleanupIncomplete:
            null,
          recovery:
            "none",
          signedOut:
            false,
          spotifyDisconnected:
            true,
        });

        await expect(
          readCanalAccountCleanupRecord(
            rotationRecord,
          ),
        ).resolves.toBeNull();

        expect(
          mockMutationSignOut,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "persists signout-only recovery when local sign-out fails and never replays completed cleanup",
      async () => {
        mockMutationSignOut
          .mockRejectedValueOnce(
            new Error(
              "local sign-out failed",
            ),
          )
          .mockResolvedValueOnce(
            undefined,
          );

        await expect(
          logoutAllMusicPlatforms(),
        ).rejects.toMatchObject({
          name:
            "CanalLogoutIncompleteError",
          result: {
            recovery:
              "signout",
          },
        });

        mockCaptureSpotifyGuard
          .mockResolvedValue({
            ...SPOTIFY_GUARD_A,
            accountGeneration:
              5,
          });

        await expect(
          retryIncompleteAccountCleanup({
            allowSignOut:
              true,
          }),
        ).resolves.toMatchObject({
          signedOut:
            true,
        });

        expect(
          mockClearSpotify,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mockClearPlayerForOwner,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "quarantines an A marker across A to B to A session generations",
      async () => {
        mockClearPlayerForOwner
          .mockRejectedValue(
            new Error(
              "player storage unavailable",
            ),
          );

        await logoutAllMusicPlatforms();

        const markerKeys =
          Array.from(
            mockStorage.keys(),
          ).filter(
            (key) =>
              key.startsWith(
                "@canal/account-cleanup-incomplete:",
              ),
          );

        expect(
          markerKeys,
        ).toHaveLength(1);

        installMutationContext({
          userId:
            USER_B,
          epoch: 8,
          sessionGeneration:
            "session:b-1",
        });

        mockCaptureSpotifyGuard
          .mockResolvedValue({
            ownerId:
              USER_B,
            accountGeneration:
              1,
            configured:
              true,
          });

        await expect(
          retryIncompleteAccountCleanup(),
        ).resolves.toBeNull();

        installMutationContext({
          userId:
            USER_A,
          epoch: 9,
          sessionGeneration:
            "session:a-2",
        });

        mockCaptureSpotifyGuard
          .mockResolvedValue({
            ...SPOTIFY_GUARD_A,
            accountGeneration:
              5,
          });

        await expect(
          retryIncompleteAccountCleanup(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            markerKeys[0],
          ),
        ).toBe(true);

        expect(
          mockClearPlayerForOwner,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "discovers the same session cleanup after a process epoch reset",
      async () => {
        mockClearPlayerForOwner
          .mockRejectedValueOnce(
            new Error(
              "player storage unavailable",
            ),
          )
          .mockResolvedValue(
            true,
          );

        await logoutAllMusicPlatforms();

        installMutationContext({
          userId:
            USER_A,
          epoch: 1,
          sessionGeneration:
            "session:a-1",
        });

        mockCaptureSpotifyGuard
          .mockResolvedValue({
            ...SPOTIFY_GUARD_A,
            accountGeneration:
              5,
          });

        await expect(
          retryIncompleteAccountCleanup(),
        ).resolves.toMatchObject({
          recovery:
            "signout",
          cleanupIncomplete: {
            sessionGeneration:
              "session:a-1",
            phase:
              "signout-pending",
          },
        });
      },
    );

    it(
      "never removes a replacement account marker or signs it out after a stale disconnect",
      async () => {
        mockStorage.set(
          "@canal/app-session",
          "replacement-account-marker",
        );

        mockMutationAssert
          .mockRejectedValue(
            new Error(
              "The Canal account changed while this action was running.",
            ),
          );

        await expect(
          disconnectSpotifyOnly(),
        ).rejects.toThrow(
          "account changed",
        );

        expect(
          mockStorage.get(
            "@canal/app-session",
          ),
        ).toBe(
          "replacement-account-marker",
        );

        expect(
          mockMutationSignOut,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
