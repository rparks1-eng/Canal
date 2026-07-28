import {
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  mockSecureStore,
  mockSecureValues,
} from "./helpers/secure-store-mock";

import {
  captureSpotifyCanalAccountGuard,
  clearSpotifySession,
  getMissingSpotifyScopes,
  hasRequiredSpotifyScopes,
  readSpotifySession,
  requireGuardedSpotifyPlaylistExportSession,
  requireSpotifyLibrarySession,
  requireSpotifyPlaylistExportSession,
  saveSpotifySession,
  SPOTIFY_ASYNC_STORAGE_KEY,
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
  getAllSpotifySavedTracks,
} from "../lib/spotify-api";

let mockSupabaseConfigured =
  true;

let mockCanalOwnerId:
  string | null =
    "canal-user-a";

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
      "clears both current and legacy token stores",
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
      "invalidates leftover keychain credentials when cleanup fails before another Canal user signs in",
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
          null;

        await clearSpotifySession();

        expect(
          mockSecureValues.get(
            SPOTIFY_SECURE_STORAGE_KEY,
          ),
        ).toContain(
          "spotify-access-token",
        );

        mockCanalOwnerId =
          "canal-user-b";

        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();

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
