import {
  exportCanalData,
} from "../lib/data-controls";
import {
  SPOTIFY_ASYNC_STORAGE_KEY,
} from "../lib/spotify-auth";
import {
  mockStorage,
} from "./helpers/async-storage-mock";

describe(
  "Canal data export security",
  () => {
    beforeEach(() => {
      mockStorage.clear();
    });

    it(
      "never includes Spotify access or refresh tokens",
      async () => {
        mockStorage.set(
          SPOTIFY_ASYNC_STORAGE_KEY,
          JSON.stringify({
            accessToken:
              "spotify-access-secret",
            refreshToken:
              "spotify-refresh-secret",
          }),
        );

        mockStorage.set(
          "@canal/settings",
          JSON.stringify({
            theme: "system",
          }),
        );

        const exported =
          await exportCanalData();

        expect(
          exported,
        ).toContain(
          "@canal/settings",
        );

        expect(
          exported,
        ).not.toContain(
          "spotify-access-secret",
        );

        expect(
          exported,
        ).not.toContain(
          "spotify-refresh-secret",
        );

        expect(
          exported,
        ).not.toContain(
          SPOTIFY_ASYNC_STORAGE_KEY,
        );
      },
    );
  },
);
