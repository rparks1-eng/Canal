import {
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  mockSecureStore,
  mockSecureValues,
} from "./helpers/secure-store-mock";

import {
  clearSpotifySession,
  readSpotifySession,
  saveSpotifySession,
  SPOTIFY_ASYNC_STORAGE_KEY,
  SPOTIFY_SECURE_STORAGE_KEY,
} from "../lib/spotify-auth";

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

describe(
  "Spotify session contract",
  () => {
    beforeEach(async () => {
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
      "migrates a valid legacy session out of AsyncStorage",
      async () => {
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
  },
);
