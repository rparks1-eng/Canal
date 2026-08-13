import {
  readFileSync,
} from "node:fs";

import {
  addMusicTrackToGeneratedScene,
} from "../lib/scene-preview-editor";

import type {
  MusicCatalogTrack,
} from "../lib/music-provider-model";

import {
  DEFAULT_SCENE_STUDIO_DRAFT,
} from "../lib/scene-studio";

import type {
  GeneratedSceneResult,
} from "../lib/scene-studio";

function generatedScene():
  GeneratedSceneResult {
  const timestamp =
    "2026-07-28T12:00:00.000Z";

  return {
    id:
      "generated-a",
    draft: {
      ...DEFAULT_SCENE_STUDIO_DRAFT,
      name:
        "Provider Scene",
    },
    scene: {
      id:
        "scene-a",
      name:
        "Provider Scene",
      activity:
        "focus",
      duration:
        "3 minutes",
      emotions:
        "calm",
      genres:
        "ambient",
      energy:
        "medium",
      familiarity:
        "balanced",
      artists:
        "Existing Artist",
      artistSelections:
        "Existing Artist",
      songRequest:
        "",
      avoid:
        "",
      collaborators:
        [],
      tracks: [
        {
          id:
            "existing-track",
          title:
            "Existing Track",
          artist:
            "Existing Artist",
          spotifyUri:
            "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
          durationMs:
            180_000,
        },
      ],
      visibility:
        "private",
      createdAt:
        timestamp,
      updatedAt:
        timestamp,
      libraryType:
        "created",
    },
    trackSignals: [
      {
        track: {
          id:
            "existing-track",
          name:
            "Existing Track",
          uri:
            "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
          duration_ms:
            180_000,
          explicit:
            false,
          artists: [
            {
              id:
                "existing-artist",
              name:
                "Existing Artist",
              uri:
                "spotify:artist:existing-artist",
            },
          ],
        },
        sources: [
          "top",
        ],
        score:
          100,
        intensity:
          50,
        genres:
          [],
      },
    ],
    rationale:
      [],
    sourceBreakdown: {
      top:
        1,
      saved:
        0,
      recent:
        0,
      playlist:
        0,
      discovery:
        0,
    },
    estimatedDurationMinutes:
      3,
    createdAt:
      timestamp,
  };
}

function appleTrack():
  MusicCatalogTrack {
  return {
    reference: {
      providerId:
        "apple-music",
      itemId:
        "apple-track-a",
      uri:
        "apple-music:track:apple-track-a",
      webUrl:
        "https://music.apple.com/us/song/apple-track-a",
    },
    name:
      "Neutral Track",
    durationMs:
      240_000,
    explicit:
      false,
    artists: [
      {
        artistId:
          "artist-a",
        name:
          "Neutral Artist",
      },
    ],
    album: {
      albumId:
        "album-a",
      name:
        "Neutral Album",
      imageUrl:
        "https://is1-ssl.mzstatic.com/image/thumb/neutral/600x600bb.jpg",
    },
    genres: ["Alternative", "Dream Pop"],
  };
}

describe(
  "Scene preview provider boundary",
  () => {
    it("persists bounded provider genre evidence on tracks without storing Genius", () => {
      const scenesSource = readFileSync("lib/scenes.ts", "utf8");
      const studioSource = readFileSync("lib/scene-studio.ts", "utf8");
      const contextSource = readFileSync("app/song-context.tsx", "utf8");

      expect(scenesSource).toContain("normalizeSceneTrackGenreEvidence");
      expect(scenesSource).toContain("normalized.size < 12");
      expect(scenesSource).toContain("genre.length > 80");
      expect(studioSource).toContain("genreEvidence:");
      expect(contextSource).toContain("...(track?.genreEvidence ?? [])");
      expect(scenesSource).not.toContain('provider === "genius"');
    });

    it(
      "adds a neutral track without mislabeling non-Spotify links",
      () => {
        const result =
          generatedScene();
        const updated =
          addMusicTrackToGeneratedScene(
            result,
            appleTrack(),
          );

        expect(
          updated.scene
            .tracks[1],
        ).toEqual({
          id:
            "apple-music:apple-track-a",
          title:
            "Neutral Track",
          artist:
            "Neutral Artist",
          source:
            "apple-music-search",
          durationMs:
            240_000,
          imageUrl:
            "https://is1-ssl.mzstatic.com/image/thumb/neutral/600x600bb.jpg",
          providerId:
            "apple-music",
          providerTrackId:
            "apple-track-a",
          providerUrl:
            "https://music.apple.com/us/song/apple-track-a",
          genreEvidence: [{
            provider: "apple-music",
            genres: ["Alternative", "Dream Pop"],
          }],
        });
        expect(updated.trackSignals[1]?.genreEvidence).toEqual([{
          provider: "apple-music",
          genres: ["Alternative", "Dream Pop"],
        }]);
        expect(
          updated.trackSignals[1]
            ?.track,
        ).toMatchObject({
          id:
            "apple-music:apple-track-a",
          name:
            "Neutral Track",
          uri:
            "apple-music:song:apple-track-a",
          duration_ms:
            240_000,
        });
        expect(
          updated.trackSignals[1]
            ?.track
            .external_urls,
        ).toBeUndefined();
        expect(
          updated.rationale,
        ).toContain(
          "Includes tracks you added directly from music search.",
        );
        expect(
          updated.estimatedDurationMinutes,
        ).toBe(
          7,
        );
        expect(
          addMusicTrackToGeneratedScene(
            updated,
            appleTrack(),
          ),
        ).toBe(
          updated,
        );
      },
    );

    it(
      "keeps disabled Studio and Preview routes off provider wire types",
      () => {
        const previewSource =
          readFileSync(
            require.resolve(
              "../app/scene-preview",
            ),
            "utf8",
          );
        const editorSource =
          readFileSync(
            require.resolve(
              "../lib/scene-preview-editor",
            ),
            "utf8",
          );
        const recommendationSource =
          readFileSync(
            require.resolve(
              "../lib/scene-recommendations",
            ),
            "utf8",
          );
        const publicSceneSource =
          readFileSync(
            require.resolve(
              "../app/public-scene",
            ),
            "utf8",
          );
        const sceneDetailSource =
          readFileSync(
            require.resolve(
              "../app/scenes/[sceneId]",
            ),
            "utf8",
          );

        expect(
          previewSource,
        ).toContain(
          "musicProviders",
        );
        expect(
          previewSource,
        ).toContain(
          "createSceneStudioRepository",
        );
        expect(previewSource).toContain("readCombinedSceneMusicLibrary");
        expect(previewSource).toContain("generateSceneWithSpotifyGenreFallback");
        expect(previewSource).not.toMatch(
          /SpotifySceneSearchTrack|searchSpotifySceneTracks|getSpotifyLibraryTrackSuggestions|spotifyAuthenticatedFetch/,
        );
        expect(
          editorSource,
        ).not.toMatch(
          /spotify-scene-tools|SpotifySceneSearchTrack/,
        );
        expect(
          recommendationSource,
        ).not.toMatch(
          /spotify-library|SpotifyLibrarySnapshot/,
        );
        for (const source of [publicSceneSource, sceneDetailSource]) {
          expect(
            source,
          ).toContain(
            "exportSceneToMusicProvider",
          );
        }
        expect(
          [
            publicSceneSource,
            sceneDetailSource,
          ].join(
            "\n",
          ),
        ).not.toMatch(
          /exportSceneToSpotify\(|requireSpotifyPlaylistExportSession/,
        );
      },
    );

    it(
      "generates a private editable Preview without navigating to playback",
      () => {
        const studioSource = readFileSync(
          require.resolve("../app/scene-studio"),
          "utf8",
        );
        const previewSource = readFileSync(
          require.resolve("../app/scene-preview"),
          "utf8",
        );

        expect(studioSource).toContain('"Generate editable preview"');
        expect(studioSource).toContain("readSpotifyConnectionStateForAccount");
        expect(studioSource).toContain("readCombinedSceneMusicLibrary");
        expect(studioSource).toContain("generateSceneWithSpotifyGenreFallback");
        expect(studioSource).toContain("savePreview");
        expect(studioSource).toContain('router.push("/scene-preview")');
        expect(studioSource).not.toContain(
          "saveGeneratedSceneToLibrary",
        );
        expect(studioSource).not.toContain('router.push("/now-playing")');
        expect(previewSource).toContain("Return to Scene Studio");
        expect(previewSource).toContain('musicProviders.require(providerId, "catalog-search")');
        expect(previewSource).toContain("addMusicTrackToGeneratedScene");
        expect(previewSource).toContain("Canal generated this private draft from your connected Apple Music and Spotify libraries");
        expect(previewSource).toContain(">Swap</Text>");
        expect(previewSource).toContain("replaceTrackInGeneratedSceneEditor");
        expect(previewSource).toContain("createSceneStudioRepository");
        expect(previewSource).toContain('pathname: "/scenes/[sceneId]"');
        expect(previewSource).toContain("sceneId: savedScene.id");
        expect(previewSource).not.toContain("MusicTasteProfile");
        expect(previewSource).not.toContain("MusicTasteProfile");
      },
    );

    it(
      "renders persisted Spotify artwork in Preview, polished Scene, and Now Playing",
      () => {
        const previewSource = readFileSync(
          require.resolve("../app/scene-preview"),
          "utf8",
        );
        const sceneDetailSource = readFileSync(
          require.resolve("../app/scenes/[sceneId]"),
          "utf8",
        );
        const nowPlayingSource = readFileSync(
          require.resolve("../app/now-playing"),
          "utf8",
        );

        expect(previewSource).toContain("track.album?.imageUrl");
        expect(sceneDetailSource).toContain("addSpotifyArtworkToStoredScene");
        expect(sceneDetailSource).toContain("track.imageUrl ?");
        expect(nowPlayingSource).toContain("addSpotifyArtworkToStoredScene");
        expect(nowPlayingSource).toContain(
          "currentTrack.imageUrl && readyArtworkUrls.has(currentTrack.imageUrl)",
        );
        expect(nowPlayingSource).toContain(
          "track.imageUrl && readyArtworkUrls.has(track.imageUrl)",
        );
        expect(nowPlayingSource).toContain("Image.prefetch(url)");
        expect(nowPlayingSource).toContain("styles.queueImage");
        expect([sceneDetailSource, nowPlayingSource].join("\n")).toContain(
          'from "expo-image"',
        );
      },
    );
  },
);
