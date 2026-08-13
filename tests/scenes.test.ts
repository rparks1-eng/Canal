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
  normalizeSceneTrackGenreEvidence,
  readScenes,
  type StoredScene,
  writeScenes,
} from "../lib/scenes";

const VALID_SPOTIFY_TRACK_ID =
  "4uLU6hMCjMI75M1A2tKUQC";

const CURRENT_STORAGE_KEY =
  "@canal/scenes-v2";

describe(
  "Scene storage normalization",
  () => {
    it("bounds and deterministically normalizes persisted provider genre evidence", () => {
      const genres = Array.from({ length: 14 }, (_, index) => ` Genre ${index} `);
      expect(normalizeSceneTrackGenreEvidence([
        { provider: "spotify", genres: ["Indie Pop", "indie   pop", ...genres] },
        { provider: "genius", genres: ["Should not persist"] },
        { provider: "apple-music", genres: ["Alternative", "Bad\u0000Genre"] },
      ])).toEqual([
        { provider: "apple-music", genres: ["Alternative"] },
        { provider: "spotify", genres: ["Indie Pop", ...genres.slice(0, 11).map((genre) => genre.trim())] },
      ]);
    });

    beforeEach(() => {
      mockStorage.clear();
      jest.clearAllMocks();
    });

    it(
      "normalizes legacy Scene and track fields before persistence",
      async () => {
        const legacyScene = {
          id: "scene-legacy",
          name:
            "  Focus Block  ",
          activity:
            "Studying",
          duration:
            "45 minutes",
          emotions:
            "calm",
          genres:
            "R&B",
          energy:
            "low",
          familiarity:
            "balanced",
          artists:
            "SZA",
          songRequest: "",
          avoid: "",
          collaborators: [
            "user-1",
            42,
            "user-2",
          ],
          tracks: [
            {
              id: "track-1",
              name:
                "Legacy title",
              artist:
                "Legacy artist",
              uri:
                `spotify:track:${VALID_SPOTIFY_TRACK_ID}`,
              spotify_url:
                `https://open.spotify.com/track/${VALID_SPOTIFY_TRACK_ID}`,
              duration_ms:
                180_000,
              image_url:
                "https://example.com/cover.jpg",
            },
          ],
          visibility:
            "followers",
          createdAt:
            "2026-01-01T00:00:00.000Z",
          updatedAt:
            "2026-01-02T00:00:00.000Z",
          libraryType:
            "recent",
          playCount:
            Number.NaN,
        };

        await writeScenes([
          legacyScene as unknown as StoredScene,
        ]);

        const [scene] =
          await readScenes();

        expect(scene).toMatchObject({
          id: "scene-legacy",
          name:
            "Focus Block",
          collaborators: [
            "user-1",
            "user-2",
          ],
          visibility:
            "private",
          libraryType:
            "created",
          playCount: 0,
          artistSelections:
            "SZA",
        });

        expect(
          scene.tracks,
        ).toEqual([
          {
            id: "track-1",
            title:
              "Legacy title",
            artist:
              "Legacy artist",
            spotifyUri:
              `spotify:track:${VALID_SPOTIFY_TRACK_ID}`,
            spotifyUrl:
              `https://open.spotify.com/track/${VALID_SPOTIFY_TRACK_ID}`,
            durationMs:
              180_000,
            imageUrl:
              "https://example.com/cover.jpg",
          },
        ]);
      },
    );

    it(
      "drops malicious or malformed public track links during normalization",
      async () => {
        await writeScenes([
          {
            id:
              "unsafe-scene",
            name:
              "Unsafe",
            tracks: [
              {
                id:
                  "phishing",
                title:
                  "Phishing",
                artist:
                  "Attacker",
                spotifyUrl:
                  `https://open.spotify.com.evil.example/track/${VALID_SPOTIFY_TRACK_ID}`,
                spotifyUri:
                  "tel:+15551234567",
              },
            ],
          } as StoredScene,
        ]);

        const [scene] =
          await readScenes();

        expect(
          scene.tracks[0],
        ).not.toHaveProperty(
          "spotifyUrl",
        );
        expect(
          scene.tracks[0],
        ).not.toHaveProperty(
          "spotifyUri",
        );
      },
    );

    it(
      "sorts Scenes by update time and migrates a legacy storage key",
      async () => {
        const olderScene = {
          id: "older",
          name: "Older",
          createdAt:
            "2026-01-01T00:00:00.000Z",
          updatedAt:
            "2026-01-02T00:00:00.000Z",
          tracks: [],
        };

        const newerScene = {
          id: "newer",
          name: "Newer",
          createdAt:
            "2026-01-03T00:00:00.000Z",
          updatedAt:
            "2026-01-04T00:00:00.000Z",
          tracks: [],
        };

        mockStorage.set(
          "@canal/scenes",
          JSON.stringify([
            olderScene,
            newerScene,
          ]),
        );

        const scenes =
          await readScenes();

        expect(
          scenes.map(
            (scene) =>
              scene.id,
          ),
        ).toEqual([
          "newer",
          "older",
        ]);

        expect(
          mockAsyncStorage
            .setItem,
        ).toHaveBeenCalledWith(
          CURRENT_STORAGE_KEY,
          expect.any(String),
        );

        expect(
          JSON.parse(
            mockStorage.get(
              CURRENT_STORAGE_KEY,
            ) ?? "[]",
          ),
        ).toHaveLength(2);
      },
    );
  },
);
