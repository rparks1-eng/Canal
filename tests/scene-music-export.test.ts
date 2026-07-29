import {
  createMusicProviderRegistry,
} from "../lib/music-provider";

import type {
  MusicProviderAdapter,
} from "../lib/music-provider";

import {
  exportSceneToMusicProvider,
  sceneMusicExportRequest,
} from "../lib/scene-music-export";

import type {
  StoredScene,
} from "../lib/scenes";

const TRACK_ID =
  "4uLU6hMCjMI75M1A2tKUQC";

function scene(
  tracks:
    StoredScene["tracks"],
): StoredScene {
  const timestamp =
    "2026-07-28T12:00:00.000Z";

  return {
    id:
      "scene-a",
    name:
      "Night Drive",
    activity:
      "Driving",
    duration:
      "30 minutes",
    emotions:
      "energized",
    genres:
      "electronic",
    energy:
      "high",
    familiarity:
      "balanced",
    artists:
      "Canal Artist",
    songRequest:
      "",
    avoid:
      "",
    collaborators:
      [],
    tracks,
    visibility:
      "private",
    createdAt:
      timestamp,
    updatedAt:
      timestamp,
    libraryType:
      "created",
  };
}

function adapter(
  exportScene:
    MusicProviderAdapter["exportScene"],
): MusicProviderAdapter {
  return {
    descriptor: {
      id:
        "spotify",
      displayName:
        "Spotify",
      capabilities: [
        "scene-export",
      ],
    },
    searchCatalog:
      async () =>
        [],
    readLibrarySnapshot:
      async () =>
        null,
    syncLibrary:
      async () => {
        throw new Error(
          "Not supported.",
        );
      },
    exportScene,
  };
}

describe(
  "Scene music-provider export boundary",
  () => {
    it(
      "decodes legacy Spotify links into a neutral request without searching by title",
      () => {
        const request =
          sceneMusicExportRequest(
            scene([
              {
                id:
                  "legacy-a",
                title:
                  "Canonical URI",
                artist:
                  "Artist A",
                spotifyUri:
                  `spotify:track:${TRACK_ID}`,
              },
              {
                id:
                  "legacy-b",
                title:
                  "Canonical URL",
                artist:
                  "Artist A",
                spotifyUrl:
                  `https://open.spotify.com/track/${TRACK_ID}`,
              },
              {
                id:
                  "legacy-unmatched",
                title:
                  "Unmatched",
                artist:
                  "Artist B",
              },
            ]),
            {
              providerId:
                "spotify",
              description:
                "A private Canal Scene.",
            },
          );

        expect(
          request,
        ).toEqual({
          name:
            "Night Drive",
          activity:
            "Driving",
          description:
            "A private Canal Scene.",
          tracks: [
            {
              providerId:
                "spotify",
              itemId:
                TRACK_ID,
              uri:
                `spotify:track:${TRACK_ID}`,
              webUrl:
                `https://open.spotify.com/track/${TRACK_ID}`,
            },
            {
              providerId:
                "spotify",
              itemId:
                TRACK_ID,
              uri:
                `spotify:track:${TRACK_ID}`,
              webUrl:
                `https://open.spotify.com/track/${TRACK_ID}`,
            },
            {
              providerId:
                "spotify",
              itemId:
                "legacy-unmatched",
            },
          ],
        });
      },
    );

    it(
      "routes export through the declared provider capability",
      async () => {
        const exportScene =
          jest.fn(
            async () => ({
              providerId:
                "spotify" as const,
              collectionId:
                "playlist-a",
              collectionUri:
                "spotify:playlist:playlist-a",
              collectionUrl:
                "https://open.spotify.com/playlist/playlist-a",
              exportedTrackCount:
                1,
              skippedTrackCount:
                0,
            }),
          );
        const registry =
          createMusicProviderRegistry([
            adapter(
              exportScene,
            ),
          ]);
        const storedScene =
          scene([
            {
              id:
                "legacy-a",
              title:
                "Canonical URI",
              artist:
                "Artist A",
              spotifyUri:
                `spotify:track:${TRACK_ID}`,
            },
          ]);

        await expect(
          exportSceneToMusicProvider(
            storedScene,
            {
              providerId:
                "spotify",
            },
            registry,
          ),
        ).resolves.toMatchObject({
          collectionId:
            "playlist-a",
        });
        expect(
          exportScene,
        ).toHaveBeenCalledWith(
          sceneMusicExportRequest(
            storedScene,
            {
              providerId:
                "spotify",
            },
          ),
        );
      },
    );

    it(
      "rejects empty Scenes before calling a provider",
      async () => {
        const exportScene =
          jest.fn();
        const registry =
          createMusicProviderRegistry([
            adapter(
              exportScene,
            ),
          ]);

        await expect(
          exportSceneToMusicProvider(
            scene([]),
            {
              providerId:
                "spotify",
            },
            registry,
          ),
        ).rejects.toThrow(
          "no tracks",
        );
        expect(
          exportScene,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
