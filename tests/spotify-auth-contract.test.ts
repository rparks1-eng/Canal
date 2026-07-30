import {
  mockAsyncStorage,
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  mockSecureStore,
  mockSecureValues,
} from "./helpers/secure-store-mock";

import {
  readCanalAccountCleanupRecord,
} from "../lib/account-cleanup";

import {
  captureSpotifyCanalAccountGuard,
  captureSpotifyAccountScope,
  clearSpotifySession,
  getMissingSpotifyScopes,
  hasRequiredSpotifyScopes,
  readSpotifySession,
  retrySpotifySessionCleanup,
  requireGuardedSpotifyPlaylistExportSession,
  requireSpotifyLibrarySession,
  requireSpotifyPlaylistExportSession,
  saveSpotifySession,
  SPOTIFY_ACCOUNT_AUTHORITY_KEY,
  SPOTIFY_ASYNC_STORAGE_KEY,
  SpotifyProviderCleanupIncompleteError,
  SPOTIFY_SECURE_STORAGE_KEY,
  spotifyAuthenticatedFetch,
} from "../lib/spotify-auth";

import {
  supabase,
} from "../lib/supabase";

import {
  CANAL_REQUIRED_SPOTIFY_SCOPES,
} from "../lib/spotify-config";

import {
  getSpotifyCacheAuthorityNamespace,
  getSpotifyCacheNamespace,
} from "../lib/storage-keys";

import {
  getAllSpotifySavedTracks,
} from "../lib/spotify-api";

let mockSupabaseConfigured =
  true;

let mockCanalOwnerId:
  string | null =
    "canal-user-a";

let mockCanalSessionId =
  "session-a-1";

function sessionAccessToken(): string {
  const payload =
    globalThis.btoa(
      JSON.stringify({
        session_id:
          mockCanalSessionId,
      }),
    )
      .replace(
        /\+/g,
        "-",
      )
      .replace(
        /\//g,
        "_",
      )
      .replace(
        /=+$/u,
        "",
      );

  return `e30.${payload}.signature`;
}

jest.mock(
  "../lib/supabase",
  () => ({
    get isSupabaseConfigured() {
      return mockSupabaseConfigured;
    },
    supabase: {
      auth: {
        getSession:
          jest.fn(),
      },
    },
  }),
);

const mockGetSession =
  jest.mocked(
    supabase.auth.getSession,
  );

function canalAuthResult() {
  return {
    data: {
      session:
        mockCanalOwnerId
          ? {
              access_token:
                sessionAccessToken(),
              user: {
                id:
                  mockCanalOwnerId,
              },
            }
          : null,
    },
    error: null,
  } as never;
}

const session = {
  accessToken:
    "spotify-access-token",
  refreshToken:
    "spotify-refresh-token",
  expiresAt:
    Date.now() +
    60 * 60 * 1000,
  expiresIn: 3600,
  tokenType: "Bearer",
  scope:
    "user-library-read",
  profile: {
    id: "spotify-user",
    display_name:
      "Canal Listener",
  },
};

function mockResponse(
  status: number,
  payload: unknown,
): Response {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    json: async () =>
      payload,
    text: async () =>
      JSON.stringify(
        payload,
      ),
    headers: {
      get: () =>
        null,
    },
  } as unknown as Response;
}

describe(
  "Spotify session contract",
  () => {
    beforeEach(async () => {
      mockSupabaseConfigured =
        true;

      mockCanalOwnerId =
        "canal-user-a";

      mockCanalSessionId =
        "session-a-1";

      mockGetSession.mockImplementation(
        async () =>
          canalAuthResult(),
      );

      mockSecureStore
        .getItemAsync
        .mockImplementation(
          async (key) =>
            mockSecureValues.get(
              key,
            ) ??
            null,
        );

      mockSecureStore
        .setItemAsync
        .mockImplementation(
          async (
            key,
            value,
          ) => {
            mockSecureValues.set(
              key,
              value,
            );
          },
        );

      mockSecureStore
        .deleteItemAsync
        .mockImplementation(
          async (key) => {
            mockSecureValues.delete(
              key,
            );
          },
        );

      await clearSpotifySession();

      mockStorage.clear();
      mockSecureValues.clear();
      mockSecureStore
        .getItemAsync
        .mockClear();
      mockSecureStore
        .setItemAsync
        .mockClear();
      mockSecureStore
        .deleteItemAsync
        .mockClear();

      mockAsyncStorage
        .getItem
        .mockImplementation(
          async (key) =>
            mockStorage.get(
              key,
            ) ??
            null,
        );

      mockAsyncStorage
        .setItem
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

      mockAsyncStorage
        .removeItem
        .mockImplementation(
          async (key) => {
            mockStorage.delete(
              key,
            );
          },
        );

      mockAsyncStorage
        .getAllKeys
        .mockImplementation(
          async () =>
            Array.from(
              mockStorage.keys(),
            ),
        );

      mockAsyncStorage
        .multiRemove
        .mockImplementation(
          async (keys) => {
            for (const key of keys) {
              mockStorage.delete(
                key,
              );
            }
          },
        );
    });

    it(
      "detects a saved grant that is missing required permissions",
      () => {
        expect(
          hasRequiredSpotifyScopes(
            session,
          ),
        ).toBe(
          false,
        );

        expect(
          getMissingSpotifyScopes(
            session.scope,
          ),
        ).toEqual([
          "user-read-private",
          "user-top-read",
          "user-read-recently-played",
          "playlist-read-private",
          "playlist-read-collaborative",
          "playlist-modify-private",
        ]);
      },
    );

    it(
      "accepts a complete grant regardless of whitespace and duplicate scopes",
      () => {
        const scope =
          `  ${CANAL_REQUIRED_SPOTIFY_SCOPES.join(
            "  ",
          )} user-top-read  `;

        expect(
          getMissingSpotifyScopes(
            scope,
          ),
        ).toEqual([]);

        expect(
          hasRequiredSpotifyScopes({
            scope,
          }),
        ).toBe(
          true,
        );
      },
    );

    it(
      "requests permission recovery without clearing the saved connection",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        await expect(
          requireSpotifyLibrarySession(),
        ).rejects.toMatchObject({
          name:
            "SpotifyAccessError",
          issue:
            "permission",
          status:
            403,
          missingScopes:
            getMissingSpotifyScopes(
              session.scope,
            ),
        });

        await expect(
          readSpotifySession(),
        ).resolves.toMatchObject({
          accessToken:
            "spotify-access-token",
        });
      },
    );

    it(
      "requires only private-playlist permission for export",
      async () => {
        const exportSession = {
          ...session,
          scope:
            "playlist-modify-private",
        };

        await saveSpotifySession(
          exportSession,
          {
            syncLibrary: false,
          },
        );

        await expect(
          requireSpotifyPlaylistExportSession(),
        ).resolves.toMatchObject({
          profile: {
            id:
              "spotify-user",
          },
        });

        await expect(
          requireSpotifyLibrarySession(),
        ).rejects.toMatchObject({
          issue:
            "permission",
        });
      },
    );

    it(
      "stores native Spotify credentials only in secure storage",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        expect(
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toContain(
          "spotify-access-token",
        );

        expect(
          mockStorage.has(
            SPOTIFY_ASYNC_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "retains legacy prototype migration when Supabase is intentionally unconfigured",
      async () => {
        mockSupabaseConfigured =
          false;

        mockStorage.set(
          SPOTIFY_ASYNC_STORAGE_KEY,
          JSON.stringify(
            session,
          ),
        );

        const restored =
          await readSpotifySession();

        expect(
          restored?.profile.id,
        ).toBe(
          "spotify-user",
        );

        expect(
          mockStorage.has(
            SPOTIFY_ASYNC_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );

        expect(
          mockSecureValues.has(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "rejects ownerless persisted credentials in a configured build",
      async () => {
        mockStorage.set(
          SPOTIFY_ASYNC_STORAGE_KEY,
          JSON.stringify(
            session,
          ),
        );

        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            SPOTIFY_ASYNC_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "clears current-account credentials and local Spotify provider state",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        mockStorage.set(
          SPOTIFY_ASYNC_STORAGE_KEY,
          "legacy-value",
        );

        mockStorage.set(
          "@canal/spotify-library-snapshot",
          "library-value",
        );

        mockStorage.set(
          "@canal/spotify-return-route",
          "/music-services",
        );

        mockStorage.set(
          "@canal/spotify-cache:search",
          "cache-value",
        );

        await clearSpotifySession();

        expect(
          mockSecureValues.has(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );

        expect(
          mockStorage.has(
            SPOTIFY_ASYNC_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );

        expect(
          mockStorage.has(
            "@canal/spotify-library-snapshot",
          ),
        ).toBe(false);

        expect(
          mockStorage.has(
            "@canal/spotify-return-route",
          ),
        ).toBe(false);

        expect(
          mockStorage.has(
            "@canal/spotify-cache:search",
          ),
        ).toBe(false);
      },
    );

    it(
      "rotates A cleanup without deleting B or a later A2 cache and OAuth state",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const guardA =
          await captureSpotifyCanalAccountGuard();

        const cacheA =
          getSpotifyCacheNamespace({
            ownerId:
              "canal-user-a",
            sessionGeneration:
              "session:session-a-1",
            spotifyAccountGeneration:
              guardA.accountGeneration,
            spotifyProfileId:
              "spotify-user",
          }) +
          "artists";

        const cacheB =
          getSpotifyCacheNamespace({
            ownerId:
              "canal-user-b",
            sessionGeneration:
              "session:session-b-1",
            spotifyAccountGeneration:
              guardA.accountGeneration +
              1,
            spotifyProfileId:
              "spotify-user-b",
          }) +
          "artists";

        const cacheReplacement =
          getSpotifyCacheNamespace({
            ownerId:
              "canal-user-a",
            sessionGeneration:
              "session:session-a-1",
            spotifyAccountGeneration:
              guardA.accountGeneration,
            spotifyProfileId:
              "spotify-replacement",
          }) +
          "artists";

        const cacheA2 =
          getSpotifyCacheNamespace({
            ownerId:
              "canal-user-a",
            sessionGeneration:
              "session:session-a-2",
            spotifyAccountGeneration:
              guardA.accountGeneration +
              2,
            spotifyProfileId:
              "spotify-user-a2",
          }) +
          "artists";

        mockStorage.set(
          cacheA,
          "A",
        );
        mockStorage.set(
          cacheB,
          "B",
        );
        mockStorage.set(
          cacheReplacement,
          "replacement",
        );
        mockStorage.set(
          cacheA2,
          "A2",
        );

        mockStorage.set(
          "@canal/spotify-return-route",
          JSON.stringify({
            version: 2,
            route:
              "/music-services",
            attemptId:
              "attempt-b",
            ownerId:
              "canal-user-b",
            sessionGeneration:
              "session:session-b-1",
            spotifyAccountGeneration:
              guardA.accountGeneration +
              1,
          }),
        );

        mockCanalOwnerId =
          "canal-user-b";
        mockCanalSessionId =
          "session-b-1";

        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            cacheA,
          ),
        ).toBe(false);

        expect(
          mockStorage.get(
            cacheB,
          ),
        ).toBe("B");

        expect(
          mockStorage.get(
            cacheReplacement,
          ),
        ).toBeUndefined();

        expect(
          mockStorage.get(
            cacheA2,
          ),
        ).toBe("A2");

        expect(
          mockStorage.get(
            "@canal/spotify-return-route",
          ),
        ).toContain(
          "attempt-b",
        );
      },
    );

    it(
      "fails before authority rotation or deletion when the durable cleanup intent cannot be written",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const accountGuard =
          await captureSpotifyCanalAccountGuard();

        mockAsyncStorage
          .setItem
          .mockRejectedValueOnce(
            new Error(
              "cleanup intent unavailable",
            ),
          );

        mockSecureStore
          .deleteItemAsync
          .mockClear();

        await expect(
          clearSpotifySession(
            accountGuard,
          ),
        ).rejects.toThrow(
          "cleanup intent unavailable",
        );

        expect(
          mockSecureStore
            .deleteItemAsync,
        ).not.toHaveBeenCalled();

        await expect(
          readSpotifySession(),
        ).resolves.toMatchObject({
          accessToken:
            "spotify-access-token",
        });
      },
    );

    it(
      "rotates authority immediately, persists exact failed cleanup targets, and reaches zero on owner-generation retry",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        mockStorage.set(
          "@canal/spotify-library-snapshot",
          "library-value",
        );

        mockStorage.set(
          "@canal/spotify-cache:search",
          "cache-value",
        );

        const accountGuard =
          await captureSpotifyCanalAccountGuard();

        mockSecureStore
          .deleteItemAsync
          .mockRejectedValueOnce(
            new Error(
              "keychain unavailable",
            ),
          );

        mockAsyncStorage
          .removeItem
          .mockImplementationOnce(
            async (key) => {
              mockStorage.delete(
                key,
              );
            },
          )
          .mockRejectedValueOnce(
            new Error(
              "library storage unavailable",
            ),
          );

        mockAsyncStorage
          .getAllKeys
          .mockRejectedValueOnce(
            new Error(
              "storage enumeration unavailable",
            ),
          );

        const partial =
          await clearSpotifySession(
            accountGuard,
          );

        expect(
          partial.cleanupIncomplete,
        ).toMatchObject({
          ownerId:
            "canal-user-a",
          spotifyAccountGeneration:
            accountGuard.accountGeneration +
            1,
          targets:
            expect.arrayContaining([
              "spotify-secure-session",
              "spotify-library-snapshot",
              "spotify-cache-scan",
            ]),
        });

        /*
         * Credentials may still be physically present, but the new
         * authority generation makes the old envelope unusable now.
         */
        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();

        mockSecureStore
          .deleteItemAsync
          .mockImplementation(
            async (key) => {
              mockSecureValues.delete(
                key,
              );
            },
          );

        mockAsyncStorage
          .removeItem
          .mockImplementation(
            async (key) => {
              mockStorage.delete(
                key,
              );
            },
          );

        mockAsyncStorage
          .getAllKeys
          .mockImplementation(
            async () =>
              Array.from(
                mockStorage.keys(),
              ),
          );

        const retried =
          await retrySpotifySessionCleanup(
            partial.cleanupIncomplete!,
            partial.accountGuard,
          );

        expect(
          retried.cleanupIncomplete
            ?.targets,
        ).toEqual([]);

        expect(
          mockSecureValues.has(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toBe(false);

        expect(
          mockStorage.has(
            "@canal/spotify-library-snapshot",
          ),
        ).toBe(false);

        expect(
          mockStorage.has(
            "@canal/spotify-cache:search",
          ),
        ).toBe(false);
      },
    );

    it(
      "retains the proven pre-delete intent when later cleanup progress cannot be persisted",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const accountGuard =
          await captureSpotifyCanalAccountGuard();

        const baseSet =
          mockAsyncStorage
            .setItem
            .getMockImplementation()!;

        mockAsyncStorage
          .setItem
          .mockImplementationOnce(
            baseSet,
          )
          .mockImplementationOnce(
            baseSet,
          )
          .mockRejectedValueOnce(
            new Error(
              "cleanup progress unavailable",
            ),
          );

        const partial =
          await clearSpotifySession(
            accountGuard,
          );

        expect(
          partial,
        ).toMatchObject({
          cleanupPersisted:
            false,
          cleanupIncomplete: {
            ownerId:
              "canal-user-a",
            spotifyAccountGeneration:
              accountGuard.accountGeneration +
              1,
          },
        });

        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();

        const durableIntent =
          await readCanalAccountCleanupRecord({
            cleanupId:
              partial.cleanupIncomplete!
                .cleanupId,
          });

        expect(
          durableIntent,
        ).toMatchObject({
          ownerId:
            "canal-user-a",
          spotifyAccountGeneration:
            partial.accountGuard
              .accountGeneration,
          phase:
            "cleanup-pending",
          targets:
            expect.arrayContaining([
              "spotify-async-session",
              "spotify-secure-session",
              "spotify-library-snapshot",
              "spotify-return-route",
              "spotify-cache-scan",
            ]),
        });
      },
    );

    it(
      "never deletes a newer session envelope while retrying an older cleanup generation",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const accountGuard =
          await captureSpotifyCanalAccountGuard();

        mockSecureStore
          .deleteItemAsync
          .mockRejectedValueOnce(
            new Error(
              "keychain unavailable",
            ),
          );

        const partial =
          await clearSpotifySession(
            accountGuard,
          );

        const replacementEnvelope =
          JSON.stringify({
            version: 2,
            ownerId:
              "canal-user-a",
            accountGeneration:
              partial.accountGuard
                .accountGeneration,
            session: {
              ...session,
              accessToken:
                "replacement-access-token",
            },
          });

        mockSecureValues.set(
          SPOTIFY_SECURE_STORAGE_KEY,
          replacementEnvelope,
        );

        mockSecureStore
          .deleteItemAsync
          .mockImplementation(
            async (key) => {
              mockSecureValues.delete(
                key,
              );
            },
          );

        const retried =
          await retrySpotifySessionCleanup(
            partial.cleanupIncomplete!,
            partial.accountGuard,
          );

        expect(
          retried.cleanupIncomplete
            ?.targets,
        ).not.toContain(
          "spotify-secure-session",
        );

        expect(
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toBe(
          replacementEnvelope,
        );
      },
    );

    it(
      "retains only failed cache keys when bulk removal and one fallback deletion fail",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const accountGuard =
          await captureSpotifyCanalAccountGuard();

        const firstCacheKey =
          "@canal/spotify-cache:first";

        const secondCacheKey =
          "@canal/spotify-cache:second";

        mockStorage.set(
          firstCacheKey,
          "first",
        );
        mockStorage.set(
          secondCacheKey,
          "second",
        );

        mockAsyncStorage
          .multiRemove
          .mockRejectedValueOnce(
            new Error(
              "bulk removal unavailable",
            ),
          );

        const baseRemove =
          mockAsyncStorage
            .removeItem
            .getMockImplementation()!;

        mockAsyncStorage
          .removeItem
          .mockImplementation(
            async (key) => {
              if (
                key ===
                secondCacheKey
              ) {
                throw new Error(
                  "second cache key unavailable",
                );
              }

              await baseRemove(
                key,
              );
            },
          );

        const partial =
          await clearSpotifySession(
            accountGuard,
          );

        expect(
          partial.cleanupIncomplete,
        ).toMatchObject({
          targets:
            expect.arrayContaining([
              "spotify-cache-entries",
            ]),
          cacheKeys: [
            secondCacheKey,
          ],
        });

        expect(
          mockStorage.has(
            firstCacheKey,
          ),
        ).toBe(false);

        expect(
          mockStorage.has(
            secondCacheKey,
          ),
        ).toBe(true);

        mockAsyncStorage
          .removeItem
          .mockImplementation(
            baseRemove,
          );

        mockAsyncStorage
          .multiRemove
          .mockImplementation(
            async (keys) => {
              for (const key of keys) {
                mockStorage.delete(
                  key,
                );
              }
            },
          );

        const retried =
          await retrySpotifySessionCleanup(
            partial.cleanupIncomplete!,
            partial.accountGuard,
          );

        expect(
          retried.cleanupIncomplete
            ?.targets,
        ).toEqual([]);

        expect(
          mockStorage.has(
            secondCacheKey,
          ),
        ).toBe(false);
      },
    );

    it(
      "refuses a stale account's disconnect without clearing the replacement account",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const accountAGuard =
          await captureSpotifyCanalAccountGuard();

        mockCanalOwnerId =
          "canal-user-b";

        const accountBSession = {
          ...session,
          accessToken:
            "account-b-access-token",
          profile: {
            id:
              "spotify-user-b",
            display_name:
              "Account B",
          },
        };

        await saveSpotifySession(
          accountBSession,
          {
            syncLibrary: false,
          },
        );

        mockSecureStore
          .deleteItemAsync
          .mockClear();

        await expect(
          clearSpotifySession(
            accountAGuard,
          ),
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          mockSecureStore
            .deleteItemAsync,
        ).not.toHaveBeenCalled();

        await expect(
          readSpotifySession(),
        ).resolves.toMatchObject({
          accessToken:
            "account-b-access-token",
          profile: {
            id:
              "spotify-user-b",
          },
        });
      },
    );

    it(
      "lets a queued save win over a delayed secure-storage read",
      async () => {
        mockSupabaseConfigured =
          false;

        mockSecureValues.set(
          SPOTIFY_SECURE_STORAGE_KEY,
          JSON.stringify(
            session,
          ),
        );

        let signalReadStarted:
          () => void =
            () => {};

        const readStarted =
          new Promise<void>(
            (resolve) => {
              signalReadStarted =
                resolve;
            },
          );

        let releaseRead:
          () => void =
            () => {};

        const readGate =
          new Promise<void>(
            (resolve) => {
              releaseRead =
                resolve;
            },
          );

        mockSecureStore
          .getItemAsync
          .mockImplementationOnce(
            async () => {
              signalReadStarted();

              await readGate;

              return JSON.stringify(
                session,
              );
            },
          );

        const delayedRead =
          readSpotifySession();

        await readStarted;

        const replacement = {
          ...session,
          accessToken:
            "replacement-access-token",
          profile: {
            id:
              "replacement-user",
            display_name:
              "Replacement Listener",
          },
        };

        const saving =
          saveSpotifySession(
            replacement,
            {
              syncLibrary:
                false,
            },
          );

        releaseRead();

        await Promise.all([
          delayedRead,
          saving,
        ]);

        await expect(
          readSpotifySession(),
        ).resolves.toMatchObject({
          accessToken:
            "replacement-access-token",
          profile: {
            id:
              "replacement-user",
          },
        });

        expect(
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toContain(
          "replacement-access-token",
        );
      },
    );

    it(
      "lets a queued clear win over a delayed secure-storage read",
      async () => {
        mockSupabaseConfigured =
          false;

        mockSecureValues.set(
          SPOTIFY_SECURE_STORAGE_KEY,
          JSON.stringify(
            session,
          ),
        );

        let signalReadStarted:
          () => void =
            () => {};

        const readStarted =
          new Promise<void>(
            (resolve) => {
              signalReadStarted =
                resolve;
            },
          );

        let releaseRead:
          () => void =
            () => {};

        const readGate =
          new Promise<void>(
            (resolve) => {
              releaseRead =
                resolve;
            },
          );

        mockSecureStore
          .getItemAsync
          .mockImplementationOnce(
            async () => {
              signalReadStarted();

              await readGate;

              return JSON.stringify(
                session,
              );
            },
          );

        const delayedRead =
          readSpotifySession();

        await readStarted;

        const clearing =
          clearSpotifySession();

        releaseRead();

        await Promise.all([
          delayedRead,
          clearing,
        ]);

        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();

        expect(
          mockSecureValues.has(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects a guarded request when the account switches after preflight",
      async () => {
        const exportSession = {
          ...session,
          scope:
            "playlist-modify-private",
        };

        await saveSpotifySession(
          exportSession,
          {
            syncLibrary: false,
          },
        );

        const {
          connectionGuard,
        } =
          await requireGuardedSpotifyPlaylistExportSession();

        await saveSpotifySession(
          {
            ...exportSession,
            accessToken:
              "other-access-token",
            profile: {
              id:
                "other-user",
              display_name:
                "Other Listener",
            },
          },
          {
            syncLibrary: false,
          },
        );

        const fetchMock =
          jest.spyOn(
            global,
            "fetch",
          );

        await expect(
          spotifyAuthenticatedFetch(
            "https://api.spotify.com/v1/me/playlists",
            {
              method:
                "POST",
            },
            connectionGuard,
          ),
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "durably rotates provider authority and never revives the first provider cache",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const firstAuthority =
          JSON.parse(
            mockStorage.get(
              SPOTIFY_ACCOUNT_AUTHORITY_KEY,
            )!,
          ) as {
            generation: number;
            ownerId: string;
            sessionGeneration: string;
          };

        const firstNamespace =
          getSpotifyCacheAuthorityNamespace({
            ownerId:
              firstAuthority.ownerId,
            sessionGeneration:
              firstAuthority
                .sessionGeneration,
            spotifyAccountGeneration:
              firstAuthority
                .generation,
          });

        const firstCacheKey =
          `${firstNamespace}spotify-user:top`;

        mockStorage.set(
          firstCacheKey,
          "personalized-a",
        );

        const replacement = {
          ...session,
          accessToken:
            "replacement-access-token",
          profile: {
            id:
              "replacement-user",
            display_name:
              "Replacement Listener",
          },
        };

        const replacementGuard =
          await saveSpotifySession(
            replacement,
            {
            syncLibrary: false,
            },
          );

        const secondAuthority =
          JSON.parse(
            mockStorage.get(
              SPOTIFY_ACCOUNT_AUTHORITY_KEY,
            )!,
          ) as {
            generation: number;
          };

        expect(
          secondAuthority.generation,
        ).toBe(
          firstAuthority.generation +
            1,
        );

        expect(
          replacementGuard,
        ).toMatchObject({
          accountGeneration:
            secondAuthority
              .generation,
          ownerId:
            "canal-user-a",
        });

        await expect(
          captureSpotifyAccountScope(),
        ).resolves.toMatchObject({
          ownerId:
            "canal-user-a",
          sessionGeneration:
            "session:session-a-1",
          spotifyAccountGeneration:
            secondAuthority
              .generation,
        });

        expect(
          mockStorage.has(
            firstCacheKey,
          ),
        ).toBe(false);

        await expect(
          readSpotifySession(),
        ).resolves.toMatchObject({
          profile: {
            id:
              "replacement-user",
          },
        });

        const returningGuard =
          await saveSpotifySession(
            {
            ...session,
            accessToken:
              "returning-a-access-token",
            },
            {
            syncLibrary: false,
            },
          );

        const thirdAuthority =
          JSON.parse(
            mockStorage.get(
              SPOTIFY_ACCOUNT_AUTHORITY_KEY,
            )!,
          ) as {
            generation: number;
          };

        expect(
          thirdAuthority.generation,
        ).toBe(
          secondAuthority.generation +
            1,
        );

        expect(
          returningGuard,
        ).toMatchObject({
          accountGeneration:
            thirdAuthority
              .generation,
          ownerId:
            "canal-user-a",
        });

        await expect(
          captureSpotifyAccountScope(),
        ).resolves.toMatchObject({
          ownerId:
            "canal-user-a",
          sessionGeneration:
            "session:session-a-1",
          spotifyAccountGeneration:
            thirdAuthority
              .generation,
        });

        expect(
          mockStorage.has(
            firstCacheKey,
          ),
        ).toBe(false);
      },
    );

    it(
      "serializes exact rollback with a queued successor save so A2 survives byte-for-byte",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary:
              false,
          },
        );

        const originalSecureValue =
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          )!;

        let operationCurrent =
          true;

        let signalRollbackRestore:
          () => void =
            () => {};

        const rollbackRestoreStarted =
          new Promise<void>(
            (resolve) => {
              signalRollbackRestore =
                resolve;
            },
          );

        let releaseRollbackRestore:
          () => void =
            () => {};

        const rollbackRestoreMayFinish =
          new Promise<void>(
            (resolve) => {
              releaseRollbackRestore =
                resolve;
            },
          );

        mockSecureStore.setItemAsync
          .mockImplementation(
            async (
              key: string,
              value: string,
            ) => {
              if (
                value.includes(
                  "a1-provisional",
                )
              ) {
                mockSecureValues.set(
                  key,
                  value,
                );
                operationCurrent =
                  false;

                return;
              }

              if (
                value ===
                  originalSecureValue &&
                mockSecureValues.get(
                  key,
                ) !==
                  originalSecureValue
              ) {
                signalRollbackRestore();
                await rollbackRestoreMayFinish;
              }

              mockSecureValues.set(
                key,
                value,
              );
            },
          );

        const staleSave =
          saveSpotifySession(
            {
              ...session,
              accessToken:
                "a1-provisional",
              profile: {
                id:
                  "spotify-a1",
                display_name:
                  "Spotify A1",
              },
            },
            {
              syncLibrary:
                false,
              operationCommitGuard:
                () =>
                  operationCurrent,
            },
          );

        await rollbackRestoreStarted;

        let successorSettled =
          false;

        const successorSave =
          saveSpotifySession(
            {
              ...session,
              accessToken:
                "a2-final",
              profile: {
                id:
                  "spotify-a2",
                display_name:
                  "Spotify A2",
              },
            },
            {
              syncLibrary:
                false,
            },
          ).finally(() => {
            successorSettled =
              true;
          });

        await Promise.resolve();
        await Promise.resolve();

        expect(
          successorSettled,
        ).toBe(false);

        releaseRollbackRestore();

        await expect(
          staleSave,
        ).rejects.toThrow(
          "connection changed",
        );
        await expect(
          successorSave,
        ).resolves.toEqual(
          expect.objectContaining({
            ownerId:
              mockCanalOwnerId,
          }),
        );

        const finalSecureValue =
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          )!;

        expect(
          finalSecureValue,
        ).toContain(
          "a2-final",
        );
        expect(
          finalSecureValue,
        ).not.toContain(
          "a1-provisional",
        );
        expect(
          (
            await readSpotifySession()
          )?.profile.id,
        ).toBe(
          "spotify-a2",
        );
      },
    );

    it(
      "rolls back exact credentials and provider authority when the OAuth operation lease is revoked during save",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary:
              false,
          },
        );

        const originalSecureValue =
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          );

        const originalAuthorityValue =
          mockStorage.get(
            SPOTIFY_ACCOUNT_AUTHORITY_KEY,
          );

        let commitCurrent =
          true;

        let signalCredentialWrite:
          () => void =
            () => {};

        const credentialWriteStarted =
          new Promise<void>(
            (resolve) => {
              signalCredentialWrite =
                resolve;
            },
          );

        let releaseCredentialWrite:
          () => void =
            () => {};

        const credentialWriteMayFinish =
          new Promise<void>(
            (resolve) => {
              releaseCredentialWrite =
                resolve;
            },
          );

        mockSecureStore
          .setItemAsync
          .mockImplementationOnce(
            async (
              key: string,
              value: string,
            ) => {
              mockSecureValues.set(
                key,
                value,
              );
              signalCredentialWrite();
              await credentialWriteMayFinish;
            },
          );

        const replacementSave =
          saveSpotifySession(
            {
              ...session,
              accessToken:
                "late-a1-token",
              profile: {
                id:
                  "replacement-user",
                display_name:
                  "Replacement Listener",
              },
            },
            {
              syncLibrary:
                false,
              operationCommitGuard:
                () =>
                  commitCurrent,
            },
          );

        await credentialWriteStarted;

        commitCurrent =
          false;
        releaseCredentialWrite();

        await expect(
          replacementSave,
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toBe(
          originalSecureValue,
        );
        expect(
          mockStorage.get(
            SPOTIFY_ACCOUNT_AUTHORITY_KEY,
          ),
        ).toBe(
          originalAuthorityValue,
        );
        expect(
          Array.from(
            mockStorage.keys(),
          ).filter(
            (key) =>
              key.startsWith(
                "@canal/account-cleanup:",
              ),
          ),
        ).toEqual([]);
      },
    );

    it(
      "keeps exact provider cleanup durable when cache deletion blocks replacement",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const sourceGuard =
          await captureSpotifyCanalAccountGuard();

        const sourceNamespace =
          getSpotifyCacheAuthorityNamespace({
            ownerId:
              sourceGuard.ownerId!,
            sessionGeneration:
              "session:session-a-1",
            spotifyAccountGeneration:
              sourceGuard
                .accountGeneration,
          });

        const sourceCacheKey =
          `${sourceNamespace}spotify-user:blocked`;

        mockStorage.set(
          sourceCacheKey,
          "personalized-a",
        );

        mockAsyncStorage
          .multiRemove
          .mockRejectedValueOnce(
            new Error(
              "batch delete blocked",
            ),
          );
        mockAsyncStorage
          .removeItem
          .mockImplementation(
            async (
              key: string,
            ) => {
              if (
                key ===
                  sourceCacheKey
              ) {
                throw new Error(
                  "exact delete blocked",
                );
              }

              mockStorage.delete(
                key,
              );
            },
          );

        let cleanupError:
          unknown =
          null;

        try {
          await saveSpotifySession(
            {
              ...session,
              accessToken:
                "replacement-access-token",
              profile: {
                id:
                  "replacement-user",
                display_name:
                  "Replacement Listener",
              },
            },
            {
              syncLibrary:
                false,
            },
          );
        } catch (error) {
          cleanupError =
            error;
        }

        expect(
          cleanupError,
        ).toBeInstanceOf(
          SpotifyProviderCleanupIncompleteError,
        );
        expect(
          (
            cleanupError as
              SpotifyProviderCleanupIncompleteError
          ).message,
        ).toContain(
          "prior Spotify provider cache cleanup",
        );
        expect(
          (
            cleanupError as
              SpotifyProviderCleanupIncompleteError
          ).accountGuard,
        ).toEqual({
          accountGeneration:
            sourceGuard
              .accountGeneration +
              1,
          configured:
            true,
          ownerId:
            sourceGuard.ownerId,
        });
        expect(
          (
            cleanupError as
              SpotifyProviderCleanupIncompleteError
          ).cleanupRecord,
        ).toMatchObject({
          ownerId:
            sourceGuard.ownerId,
          sessionGeneration:
            "session:session-a-1",
          sourceSpotifyAccountGeneration:
            sourceGuard
              .accountGeneration,
          spotifyAccountGeneration:
            sourceGuard
              .accountGeneration +
              1,
        });

        const rotatedGuard =
          await captureSpotifyCanalAccountGuard();

        const pendingRecord =
          Array.from(
            mockStorage.entries(),
          )
            .filter(
              ([key]) =>
                key.startsWith(
                  "@canal/account-cleanup-incomplete:",
                ),
            )
            .map(([, value]) =>
              JSON.parse(
                value,
              ),
            )
            .find(
              (record) =>
                record
                  .sourceSpotifyAccountGeneration ===
                  sourceGuard
                    .accountGeneration,
            );

        expect(
          pendingRecord,
        ).toMatchObject({
          ownerId:
            "canal-user-a",
          spotifyAccountGeneration:
            rotatedGuard
              .accountGeneration,
          targets:
            expect.arrayContaining([
              "spotify-cache-entries",
            ]),
        });

        expect(
          mockStorage.has(
            sourceCacheKey,
          ),
        ).toBe(true);

        const retryResult =
          await retrySpotifySessionCleanup(
            pendingRecord,
            rotatedGuard,
          );

        expect(
          retryResult
            .cleanupIncomplete,
        ).toMatchObject({
          targets: [],
        });

        expect(
          mockStorage.has(
            sourceCacheKey,
          ),
        ).toBe(false);

        await saveSpotifySession(
          {
            ...session,
            accessToken:
              "replacement-access-token",
            profile: {
              id:
                "replacement-user",
              display_name:
                "Replacement Listener",
            },
          },
          {
            syncLibrary: false,
          },
        );

        await expect(
          readSpotifySession(),
        ).resolves.toMatchObject({
          profile: {
            id:
              "replacement-user",
          },
        });
      },
    );

    it(
      "retains null-profile cache discovery until exact source cleanup can be confirmed",
      async () => {
        const sourceGuard =
          await captureSpotifyCanalAccountGuard();

        const sourceNamespace =
          getSpotifyCacheAuthorityNamespace({
            ownerId:
              sourceGuard.ownerId!,
            sessionGeneration:
              "session:session-a-1",
            spotifyAccountGeneration:
              sourceGuard
                .accountGeneration,
          });

        const sourceCacheKey =
          `${sourceNamespace}unknown-profile:top`;

        mockStorage.set(
          sourceCacheKey,
          "personalized-without-profile",
        );

        mockSecureStore
          .getItemAsync
          .mockRejectedValueOnce(
            new Error(
              "profile read unavailable",
            ),
          )
          .mockRejectedValueOnce(
            new Error(
              "credential read unavailable",
            ),
          );

        mockAsyncStorage
          .getAllKeys
          .mockRejectedValueOnce(
            new Error(
              "cache scan unavailable",
            ),
          );

        const firstResult =
          await clearSpotifySession(
            sourceGuard,
          );

        expect(
          firstResult
            .cleanupIncomplete,
        ).toMatchObject({
          sourceSpotifyProfileId:
            null,
          targets:
            expect.arrayContaining([
              "spotify-cache-scan",
              "spotify-secure-session",
            ]),
        });

        expect(
          mockStorage.has(
            sourceCacheKey,
          ),
        ).toBe(true);

        const retryResult =
          await retrySpotifySessionCleanup(
            firstResult
              .cleanupIncomplete!,
            firstResult.accountGuard,
          );

        expect(
          retryResult
            .cleanupIncomplete,
        ).toMatchObject({
          targets: [],
        });

        expect(
          mockStorage.has(
            sourceCacheKey,
          ),
        ).toBe(false);
      },
    );

    it(
      "blocks automatic owner rotation behind durable cleanup and resumes it for the replacement account",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        mockSecureStore
          .deleteItemAsync
          .mockRejectedValue(
            new Error(
              "keychain unavailable",
            ),
          );

        mockCanalOwnerId =
          "canal-user-b";

        mockCanalSessionId =
          "session-b-1";

        await expect(
          readSpotifySession(),
        ).rejects.toThrow(
          "must finish the previous account",
        );

        const automaticCleanup =
          Array.from(
            mockStorage.entries(),
          ).find(
            ([key]) =>
              key.startsWith(
                "@canal/account-cleanup-incomplete:",
              ),
          );

        expect(
          automaticCleanup?.[1],
        ).not.toContain(
          "spotify-access-token",
        );

        expect(
          JSON.parse(
            automaticCleanup![1],
          ),
        ).toMatchObject({
          action:
            "authority-rotation",
          ownerId:
            "canal-user-a",
          sessionGeneration:
            "session:session-a-1",
          sourceSpotifyAccountGeneration:
            1,
          spotifyAccountGeneration:
            2,
        });

        expect(
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toContain(
          "spotify-access-token",
        );

        mockSecureStore
          .deleteItemAsync
          .mockImplementation(
            async (key) => {
              mockSecureValues.delete(
                key,
              );
            },
          );

        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();

        expect(
          mockSecureValues.has(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toBe(false);
      },
    );

    it(
      "fails closed before automatic owner rotation when its intent cannot be persisted",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        mockCanalOwnerId =
          "canal-user-b";
        mockCanalSessionId =
          "session-b-1";

        mockAsyncStorage
          .setItem
          .mockRejectedValueOnce(
            new Error(
              "cleanup intent unavailable",
            ),
          );

        mockSecureStore
          .deleteItemAsync
          .mockClear();

        await expect(
          readSpotifySession(),
        ).rejects.toThrow(
          "cleanup intent unavailable",
        );

        expect(
          mockSecureStore
            .deleteItemAsync,
        ).not.toHaveBeenCalled();

        expect(
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toContain(
          "spotify-access-token",
        );
      },
    );

    it(
      "rejects a stale Spotify save captured by another Canal account",
      async () => {
        const accountAGuard =
          await captureSpotifyCanalAccountGuard();

        mockCanalOwnerId =
          "canal-user-b";

        mockSecureStore
          .setItemAsync
          .mockClear();

        await expect(
          saveSpotifySession(
            session,
            {
              syncLibrary:
                false,
              accountGuard:
                accountAGuard,
            },
          ),
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          mockSecureStore
            .setItemAsync,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "quarantines an A to B to A2 stale callback by stable session generation",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const staleAccountAGuard =
          await captureSpotifyCanalAccountGuard();

        mockCanalOwnerId =
          "canal-user-b";
        mockCanalSessionId =
          "session-b-1";

        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();

        await saveSpotifySession(
          {
            ...session,
            accessToken:
              "spotify-access-token-b",
            profile: {
              id:
                "spotify-user-b",
              display_name:
                "Account B",
            },
          },
          {
            syncLibrary: false,
          },
        );

        mockCanalOwnerId =
          "canal-user-a";
        mockCanalSessionId =
          "session-a-2";

        await expect(
          saveSpotifySession(
            {
              ...session,
              accessToken:
                "stale-a1-token",
            },
            {
              syncLibrary:
                false,
              accountGuard:
                staleAccountAGuard,
            },
          ),
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          mockSecureValues.has(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toBe(false);
      },
    );

    it.each([
      "http://api.spotify.com/v1/me",
      "https://example.com/v1/me",
      "https://api.spotify.com.example.com/v1/me",
      "https://listener:secret@api.spotify.com/v1/me",
      "https://api.spotify.com:8443/v1/me",
      "https://api.spotify.com/v10/me",
      "https://api.spotify.com/v1/me#fragment",
    ])(
      "blocks an untrusted authenticated Spotify target before fetch: %s",
      async (url) => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const fetchMock =
          jest.spyOn(
            global,
            "fetch",
          );

        await expect(
          spotifyAuthenticatedFetch(
            url,
          ),
        ).rejects.toThrow(
          "blocked",
        );

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects a poisoned Spotify pagination URL before sending another bearer request",
      async () => {
        await saveSpotifySession(
          session,
          {
            syncLibrary: false,
          },
        );

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockResolvedValueOnce(
              mockResponse(
                200,
                {
                  items: [],
                  next:
                    "https://attacker.example/v1/collect",
                },
              ),
            );

        await expect(
          getAllSpotifySavedTracks(),
        ).rejects.toThrow(
          "untrusted Spotify API URL",
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          fetchMock.mock
            .calls[0][0],
        ).toBe(
          "https://api.spotify.com/v1/me/tracks?limit=50&offset=0",
        );
      },
    );
  },
);
