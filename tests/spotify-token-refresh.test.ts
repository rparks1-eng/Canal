import {
  jest,
} from "@jest/globals";

import {
  clearSpotifySession,
  getValidSpotifySession,
  readSpotifySession,
  saveSpotifySession,
  spotifyAuthenticatedFetch,
} from "../lib/spotify-auth";
import {
  mockStorage,
} from "./helpers/async-storage-mock";
import {
  mockSecureValues,
} from "./helpers/secure-store-mock";

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
  },
);
