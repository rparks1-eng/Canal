import {
  getSpotifyClientId,
  getSpotifyRedirectUri,
  requireSpotifyConfiguration,
  SPOTIFY_NATIVE_REDIRECT_URI,
  SPOTIFY_SCOPES,
} from "../lib/spotify-config";

describe(
  "Spotify configuration",
  () => {
    const previousClientId =
      process.env
        .EXPO_PUBLIC_SPOTIFY_CLIENT_ID;

    const previousRedirect =
      process.env
        .EXPO_PUBLIC_SPOTIFY_REDIRECT_URI;

    afterEach(() => {
      process.env
        .EXPO_PUBLIC_SPOTIFY_CLIENT_ID =
        previousClientId;

      process.env
        .EXPO_PUBLIC_SPOTIFY_REDIRECT_URI =
        previousRedirect;
    });

    it(
      "uses one dedicated native callback",
      () => {
        expect(
          getSpotifyRedirectUri(
            "ios",
          ),
        ).toBe(
          SPOTIFY_NATIVE_REDIRECT_URI,
        );

        expect(
          getSpotifyRedirectUri(
            "android",
          ),
        ).toBe(
          SPOTIFY_NATIVE_REDIRECT_URI,
        );
      },
    );

    it(
      "uses a configured HTTPS callback only on web",
      () => {
        process.env
          .EXPO_PUBLIC_SPOTIFY_REDIRECT_URI =
          "https://canal.example/spotify-callback";

        expect(
          getSpotifyRedirectUri(
            "web",
          ),
        ).toBe(
          "https://canal.example/spotify-callback",
        );

        expect(
          getSpotifyRedirectUri(
            "ios",
          ),
        ).toBe(
          SPOTIFY_NATIVE_REDIRECT_URI,
        );
      },
    );

    it(
      "normalizes and requires the public client ID",
      () => {
        process.env
          .EXPO_PUBLIC_SPOTIFY_CLIENT_ID =
          "  canal-client-id  ";

        expect(
          getSpotifyClientId(),
        ).toBe(
          "canal-client-id",
        );

        expect(
          requireSpotifyConfiguration(),
        ).toEqual({
          clientId:
            "canal-client-id",
          redirectUri:
            SPOTIFY_NATIVE_REDIRECT_URI,
        });

        delete process.env
          .EXPO_PUBLIC_SPOTIFY_CLIENT_ID;

        expect(
          requireSpotifyConfiguration,
        ).toThrow(
          "Spotify is not configured",
        );
      },
    );

    it(
      "keeps the scopes needed by library sync and playlist export",
      () => {
        expect(
          SPOTIFY_SCOPES,
        ).toEqual(
          expect.arrayContaining([
            "user-library-read",
            "user-read-recently-played",
            "playlist-read-private",
            "playlist-read-collaborative",
            "playlist-modify-private",
            "playlist-modify-public",
          ]),
        );
      },
    );
  },
);
