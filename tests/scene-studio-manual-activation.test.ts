import React from "react";

import {
  DEFAULT_SCENE_STUDIO_DRAFT,
} from "../lib/scene-studio";

import {
  createUserDirectedScenePreview,
} from "../lib/scene-studio-manual-preview";

const {
  act,
  create,
} = jest.requireActual(
  "react-test-renderer",
);

const mockRouter = {
  back:
    jest.fn(),
  canGoBack:
    jest.fn(() => true),
  push:
    jest.fn(),
  replace:
    jest.fn(),
};

let mockParams: {
  mode?: string;
} = {};

const studioDraft = {
  ...DEFAULT_SCENE_STUDIO_DRAFT,
  name:
    "Listener-led Focus",
  notes:
    "No automatic mix",
  preferredGenres: [
    "Ambient",
  ],
};

const mockReadDraft =
  jest.fn(async (_input: unknown) => ({
    kind:
      "ready" as const,
    revision:
      1,
    value:
      studioDraft,
  }));
const mockSaveDraft =
  jest.fn(async (_input: unknown) => ({
    kind:
      "committed" as const,
    revision:
      2,
  }));
const mockReadPreview =
  jest.fn(async (_input: unknown): Promise<{
    kind: "missing" | "ready";
    revision?: number;
    value?: unknown;
  }> => ({
    kind:
      "missing",
  }));
const mockSavePreview =
  jest.fn(async (_input: unknown) => ({
    kind:
      "committed" as const,
    revision:
      1,
  }));

const mockSpotifyTracks = Array.from({ length: 12 }, (_, index) => ({
  id: `track-${index + 1}`,
  name: `Ambient Track ${index + 1}`,
  uri: `spotify:track:${index + 1}`,
  duration_ms: 180_000,
  explicit: false,
  popularity: 70 - index,
  artists: [{
    id: "artist-a",
    name: "Ambient Artist",
    uri: "spotify:artist:artist-a",
  }],
  album: {
    id: `album-${index + 1}`,
    name: "Ambient Album",
    uri: `spotify:album:${index + 1}`,
    images: [],
  },
}));

const mockReadSpotifyLibrarySnapshot = jest.fn(async () => ({
  syncedAt: "2026-08-08T12:00:00.000Z",
  profile: { id: "spotify-owner", display_name: "Canal Tester" },
  topArtists: [{
    id: "artist-a",
    name: "Ambient Artist",
    uri: "spotify:artist:artist-a",
    genres: ["ambient"],
  }],
  topTracks: mockSpotifyTracks,
  recentTracks: [],
  savedTracks: mockSpotifyTracks,
  playlistTracks: [],
  discoveryTracks: [],
  playlists: [],
  topGenres: [{ name: "ambient", count: 12 }],
  trackGenres: Object.fromEntries(
    mockSpotifyTracks.map((track) => [track.id, ["ambient"]]),
  ),
  warnings: [],
  importStatus: { state: "complete" },
}));

let mockAuth = {
  user: {
    id:
      "owner-a",
  },
  accountEpoch:
    1,
  sessionGeneration:
    "session-a1",
};

jest.mock(
  "expo-router",
  () => ({
    useLocalSearchParams: () => mockParams,
    router: {
      back: (...args: unknown[]) =>
        mockRouter.back(...args),
      canGoBack: () =>
        mockRouter.canGoBack(),
      push: (...args: unknown[]) =>
        mockRouter.push(...args),
      replace: (...args: unknown[]) =>
        mockRouter.replace(...args),
    },
  }),
);

jest.mock(
  "../providers/auth-provider",
  () => ({
    useAuth: () =>
      mockAuth,
  }),
);

jest.mock(
  "../lib/spotify-auth",
  () => ({
    captureSpotifyCanalAccountGuard:
      jest.fn(async () => ({
        ownerId: "owner-a",
        accountGeneration: 1,
        configured: true,
      })),
    readSpotifyConnectionStateForAccount:
      jest.fn(async () => "connected"),
  }),
);

jest.mock(
  "../lib/spotify-library",
  () => ({
    readSpotifyLibrarySnapshot: () =>
      mockReadSpotifyLibrarySnapshot(),
  }),
);

jest.mock(
  "../lib/combined-music-library",
  () => ({
    getCanalTrackProvider: () => "spotify",
    getCanalTrackProviderId: (track: { id: string }) => track.id,
    getCanalTrackProviderUrl: (track: { external_urls?: { spotify?: string } }) =>
      track.external_urls?.spotify,
    readCombinedSceneMusicLibrary: async () => ({
      snapshot: await mockReadSpotifyLibrarySnapshot(),
      providerIds: ["spotify"],
      readyProviderIds: ["spotify"],
      genreCatalog: ["ambient"],
    }),
  }),
);

jest.mock(
  "../lib/scene-genre-catalog",
  () => ({
    addUserSelectedGenreCatalogTracksFromProviders: async (
      _draft: unknown,
      snapshot: unknown,
    ) => snapshot,
  }),
);

jest.mock(
  "../lib/scene-recommendation-feedback",
  () => ({
    readSceneRecommendationLearning: async () => ({
      rejectedTrackIds: [],
      deprioritizedTrackIds: [],
      preferredTrackIds: [],
      reasonBias: {
        energyBias: 0,
        familiarityBias: 0,
        avoidArtistIds: [],
        avoidGenres: [],
        suppressExplicit: false,
      },
    }),
  }),
);

jest.mock(
  "../lib/scenes",
  () => ({
    normalizeSceneTrackGenreEvidence: (value: unknown) => value,
    readScenes: async () => [],
  }),
);

jest.mock(
  "../lib/spotify-scene-artwork",
  () => ({
    addSpotifyArtworkToGeneratedScene: async (
      preview: unknown,
    ) => preview,
  }),
);

jest.mock(
  "../lib/scene-studio-lifecycle",
  () => ({
    captureSceneStudioInvalidationGeneration:
      jest.fn(() => 0),
    sceneStudioInvalidationAppliesToScope:
      jest.fn(() => false),
    sceneStudioInvalidationGenerationIsCurrent:
      jest.fn(() => true),
    registerSceneStudioInvalidationHandler:
      jest.fn(() =>
        () => undefined
      ),
  }),
);

jest.mock(
  "../lib/scene-studio-repository",
  () => ({
    createSceneStudioRepository:
      () => ({
        readDraft:
          mockReadDraft,
        saveDraft:
          mockSaveDraft,
        readPreview:
          mockReadPreview,
        savePreview:
          mockSavePreview,
      }),
  }),
);

// The route import must follow the module mocks that provide its native shell.
// eslint-disable-next-line import/first
import SceneStudioScreen from "../app/scene-studio";

function deferred<Value>() {
  let resolve: (
    value: Value,
  ) => void = () =>
    undefined;
  const promise =
    new Promise<Value>(
      (nextResolve) => {
        resolve =
          nextResolve;
      },
    );

  return {
    promise,
    resolve,
  };
}

async function renderStudio() {
  let renderer:
    ReturnType<
      typeof create
    >;

  await act(async () => {
    renderer =
      create(
        React.createElement(
          SceneStudioScreen,
        ),
      );
    await Promise.resolve();
    await Promise.resolve();
  });

  return renderer!;
}

async function openReview(
  renderer: ReturnType<typeof create>,
): Promise<void> {
  await act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: "Focus",
    }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: "Calm",
    }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: "4 · Review",
    }).props.onPress();
  });
}

describe(
  "connected-provider Scene Studio activation path",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockAuth = {
        user: {
          id:
            "owner-a",
        },
        accountEpoch:
          1,
        sessionGeneration:
          "session-a1",
      };
      mockParams = {};
      mockReadPreview.mockResolvedValue({
        kind:
          "missing",
      });
      mockSavePreview.mockResolvedValue({
        kind:
          "committed",
        revision:
          1,
      });
    });

    it(
      "builds an empty private Scene using only listener-entered direction",
      () => {
        const preview =
          createUserDirectedScenePreview(
            {
              ...studioDraft,
              activity:
                "focus",
              moods: [
                "calm",
                "reflective",
              ],
              name:
                "My Focus",
              notes:
                "Instrumental opening",
              preferredGenres: [
                "Ambient",
                "Jazz",
              ],
            },
            {
              id:
                "manual-a",
              createdAt:
                "2026-08-08T12:00:00.000Z",
            },
          );

        expect(
          preview,
        ).toMatchObject({
          id:
            "manual-a",
          estimatedDurationMinutes:
            0,
          scene: {
            id:
              "manual-a",
            name:
              "My Focus",
            activity:
              "Focus",
            emotions:
              "Calm, Reflective",
            genres:
              "Ambient, Jazz",
            songRequest:
              "Instrumental opening",
            tracks: [],
            visibility:
              "private",
          },
          trackSignals: [],
        });
        expect(
          JSON.stringify(
            preview,
          ),
        ).not.toMatch(
          /spotify|providerId|spotifyUri|spotifyUrl/iu,
        );
      },
    );

    it(
      "commits one scoped preview before navigating",
      async () => {
        const renderer =
          await renderStudio();
        await openReview(renderer);
        const action =
          renderer.root.findByProps({
            accessibilityLabel:
              "Generate editable preview",
          });

        expect(
          action.props
            .accessibilityState,
        ).toEqual({
          busy:
            false,
          disabled:
            false,
        });

        await act(async () => {
          action.props.onPress();
          for (let turn = 0; turn < 5; turn += 1) {
            await new Promise((resolve) =>
              setImmediate(resolve),
            );
          }
        });

        expect(
          mockSavePreview,
        ).toHaveBeenCalledTimes(
          1,
        );
        expect(
          mockSavePreview.mock
            .calls[0]?.[0],
        ).toMatchObject({
          scope: {
            userId:
              "owner-a",
            accountEpoch:
              1,
            sessionGeneration:
              "session-a1",
          },
          expectedRevision:
            0,
          preview: {
            scene: {
              name:
                expect.any(String),
              visibility:
                "private",
            },
          },
        });
        expect(mockReadDraft).not.toHaveBeenCalled();
        const savedInput = mockSavePreview.mock.calls[0]?.[0] as {
          preview: { scene: { name: string; tracks: unknown[] } };
        };
        expect(savedInput.preview.scene.name).not.toBe("Calm Focus");
        expect(savedInput.preview.scene.tracks.length).toBeGreaterThan(0);
        expect(
          mockRouter.push,
        ).toHaveBeenCalledWith(
          "/scene-preview",
        );
      },
    );

    it(
      "resumes an existing scoped preview without overwriting it",
      async () => {
        mockParams = {
          mode: "edit",
        };
        mockReadPreview.mockResolvedValueOnce({
          kind:
            "ready",
          revision:
            4,
          value: createUserDirectedScenePreview(
            studioDraft,
            { id: "existing" },
          ),
        });
        const renderer =
          await renderStudio();

        await openReview(renderer);

        await act(async () => {
          renderer.root.findByProps({
            accessibilityLabel:
              "Update Scene Preview",
          }).props.onPress();
          await new Promise((resolve) =>
            setImmediate(resolve),
          );
        });

        expect(
          mockSavePreview,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            expectedRevision: 4,
            preview: expect.objectContaining({
              id: "existing",
            }),
          }),
        );
        expect(
          mockRouter.push,
        ).toHaveBeenCalledWith(
          "/scene-preview",
        );
      },
    );

    it(
      "quarantines a deferred activation after an account switch",
      async () => {
        const pending =
          deferred<{
            kind: "missing";
          }>();

        mockReadPreview.mockReturnValueOnce(
          pending.promise,
        );
        const renderer =
          await renderStudio();
        await openReview(renderer);

        let activation:
          Promise<void>;

        await act(async () => {
          activation =
            renderer.root.findByProps({
              accessibilityLabel:
                "Generate editable preview",
            }).props.onPress();
          await Promise.resolve();
        });

        mockAuth = {
          user: {
            id:
              "owner-b",
          },
          accountEpoch:
            2,
          sessionGeneration:
            "session-b1",
        };

        await act(async () => {
          renderer.update(
            React.createElement(
              SceneStudioScreen,
            ),
          );
          await Promise.resolve();
        });

        await act(async () => {
          pending.resolve({
            kind:
              "missing",
          });
          await pending.promise;
          await activation!;
        });

        expect(
          mockSavePreview,
        ).not.toHaveBeenCalled();
        expect(
          mockRouter.push,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
