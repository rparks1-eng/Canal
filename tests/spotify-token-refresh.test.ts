import {
  jest,
} from "@jest/globals";

import {
  clearSpotifySession,
  getSpotifyConnectionGeneration,
  getValidSpotifySession,
  readSpotifySession,
  saveSpotifySession,
  spotifyAuthenticatedFetch,
} from "../lib/spotify-auth";
import {
  supabase,
} from "../lib/supabase";
import {
  mockStorage,
} from "./helpers/async-storage-mock";
import {
  mockSecureValues,
} from "./helpers/secure-store-mock";

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

function createSession(
  expiresAt: number,
) {
  return {
    accessToken:
      "old-access-token",
    refreshToken:
      "refresh-token",
    expiresAt,
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
}

describe(
  "Spotify token refresh",
  () => {
    const previousClientId =
      process.env
        .EXPO_PUBLIC_SPOTIFY_CLIENT_ID;

    beforeEach(async () => {
      mockSupabaseConfigured =
        true;

      mockCanalOwnerId =
        "canal-user-a";

      mockGetSession.mockImplementation(
        async () =>
          canalAuthResult(),
      );

      await clearSpotifySession();

      mockStorage.clear();
      mockSecureValues.clear();

      process.env
        .EXPO_PUBLIC_SPOTIFY_CLIENT_ID =
        "1234567890abcdef1234567890abcdef";
    });

    afterEach(() => {
      jest.restoreAllMocks();

      process.env
        .EXPO_PUBLIC_SPOTIFY_CLIENT_ID =
        previousClientId;
    });

    it(
      "deduplicates concurrent refresh requests",
      async () => {
        await saveSpotifySession(
          createSession(
            Date.now() -
              1,
          ),
          {
            syncLibrary: false,
          },
        );

        const connectionGeneration =
          getSpotifyConnectionGeneration();

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockResolvedValue(
              mockResponse(
                200,
                {
                  access_token:
                    "new-access-token",
                  refresh_token:
                    "new-refresh-token",
                  expires_in:
                    3600,
                  token_type:
                    "Bearer",
                },
              ),
            );

        const [
          first,
          second,
        ] =
          await Promise.all([
            getValidSpotifySession(),
            getValidSpotifySession(),
          ]);

        expect(
          first?.accessToken,
        ).toBe(
          "new-access-token",
        );

        expect(
          second?.accessToken,
        ).toBe(
          "new-access-token",
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          getSpotifyConnectionGeneration(),
        ).toBe(
          connectionGeneration,
        );
      },
    );

    it(
      "refreshes once and retries a Spotify 401",
      async () => {
        await saveSpotifySession(
          createSession(
            Date.now() +
              60 * 60 * 1000,
          ),
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
                401,
                {
                  error:
                    "expired",
                },
              ),
            )
            .mockResolvedValueOnce(
              mockResponse(
                200,
                {
                  access_token:
                    "new-access-token",
                  expires_in:
                    3600,
                  token_type:
                    "Bearer",
                },
              ),
            )
            .mockResolvedValueOnce(
              mockResponse(
                200,
                {
                  ok: true,
                },
              ),
            );

        const response =
          await spotifyAuthenticatedFetch(
            "https://api.spotify.com/v1/me",
          );

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          3,
        );

        expect(
          fetchMock.mock
            .calls[2][1],
        ).toEqual(
          expect.objectContaining({
            headers:
              expect.objectContaining({
                Authorization:
                  "Bearer new-access-token",
              }),
          }),
        );
      },
    );

    it(
      "preserves the stored connection after a transient refresh failure",
      async () => {
        await saveSpotifySession(
          createSession(
            Date.now() -
              1,
          ),
          {
            syncLibrary: false,
          },
        );

        jest
          .spyOn(
            global,
            "fetch",
          )
          .mockResolvedValue(
            mockResponse(
              503,
              {
                error:
                  "temporarily_unavailable",
              },
            ),
          );

        await expect(
          getValidSpotifySession(),
        ).rejects.toThrow(
          "temporarily_unavailable",
        );

        expect(
          (
            await readSpotifySession()
          )?.refreshToken,
        ).toBe(
          "refresh-token",
        );
      },
    );

    it(
      "clears an expired connection after Spotify rejects its refresh grant",
      async () => {
        await saveSpotifySession(
          createSession(
            Date.now() -
              1,
          ),
          {
            syncLibrary: false,
          },
        );

        jest
          .spyOn(
            global,
            "fetch",
          )
          .mockResolvedValue(
            mockResponse(
              400,
              {
                error:
                  "invalid_grant",
              },
            ),
          );

        await expect(
          getValidSpotifySession(),
        ).resolves.toBeNull();

        await expect(
          readSpotifySession(),
        ).resolves.toBeNull();
      },
    );

    it(
      "preserves an expired connection when Spotify reports a client configuration error",
      async () => {
        await saveSpotifySession(
          createSession(
            Date.now() -
              1,
          ),
          {
            syncLibrary: false,
          },
        );

        jest
          .spyOn(
            global,
            "fetch",
          )
          .mockResolvedValue(
            mockResponse(
              400,
              {
                error:
                  "invalid_client",
              },
            ),
          );

        await expect(
          getValidSpotifySession(),
        ).rejects.toThrow(
          "invalid_client",
        );

        expect(
          (
            await readSpotifySession()
          )?.refreshToken,
        ).toBe(
          "refresh-token",
        );
      },
    );

    it(
      "does not let an obsolete refresh clear a newly connected account",
      async () => {
        await saveSpotifySession(
          createSession(
            Date.now() -
              1,
          ),
          {
            syncLibrary: false,
          },
        );

        let signalRefreshStarted:
          () => void =
            () => {};

        const refreshStarted =
          new Promise<void>(
            (resolve) => {
              signalRefreshStarted =
                resolve;
            },
          );

        let releaseRefresh:
          (response: Response) => void =
            () => {};

        const refreshResponse =
          new Promise<Response>(
            (resolve) => {
              releaseRefresh =
                resolve;
            },
          );

        jest
          .spyOn(
            global,
            "fetch",
          )
          .mockImplementation(
            () => {
              signalRefreshStarted();

              return refreshResponse;
            },
          );

        const obsoleteRefresh =
          getValidSpotifySession();

        await refreshStarted;

        await saveSpotifySession(
          {
            ...createSession(
              Date.now() +
                60 *
                  60 *
                  1000,
            ),
            accessToken:
              "other-access-token",
            refreshToken:
              "other-refresh-token",
            profile: {
              id:
                "other-spotify-user",
              display_name:
                "Other Listener",
            },
          },
          {
            syncLibrary: false,
          },
        );

        releaseRefresh(
          mockResponse(
            400,
            {
              error:
                "invalid_grant",
            },
          ),
        );

        await expect(
          obsoleteRefresh,
        ).rejects.toThrow(
          "connection changed",
        );

        await expect(
          readSpotifySession(),
        ).resolves.toMatchObject({
          accessToken:
            "other-access-token",
          profile: {
            id:
              "other-spotify-user",
          },
        });
      },
    );
  },
);
