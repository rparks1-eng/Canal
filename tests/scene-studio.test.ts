import {
  DEFAULT_SCENE_STUDIO_DRAFT,
  generateSceneFromSpotify,
  generateSceneWithSpotifyGenreFallback,
  scoreSceneDirectionText,
} from "../lib/scene-studio";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import type {
  SpotifyTrack,
} from "../lib/spotify-api";

describe("Direct Canal direction scoring", () => {
  it("rewards requested metadata and strongly rejects excluded direction", () => {
    expect(scoreSceneDirectionText("warm guitars", "warm acoustic guitars indie")).toBeGreaterThan(0);
    expect(scoreSceneDirectionText("no stadium rock", "stadium rock anthem")).toBeLessThan(-50);
    expect(scoreSceneDirectionText("warm guitars", "minimal piano ambient")).toBe(0);
  });
});

function track(
  index: number,
): SpotifyTrack {
  return {
    id: `track-${index}`,
    name: `Track ${index}`,
    uri:
      `spotify:track:${index}`,
    duration_ms: 180_000,
    explicit: false,
    popularity:
      80 - index,
    artists: [
      {
        id: "artist-1",
        name: "Canal Artist",
        uri:
          "spotify:artist:1",
      },
    ],
    album: {
      id: `album-${index}`,
      name: `Album ${index}`,
      uri:
        `spotify:album:${index}`,
      images: [
        {
          url:
            `https://example.com/${index}.jpg`,
          height: 300,
          width: 300,
        },
      ],
    },
  };
}

function snapshot(): SpotifyLibrarySnapshot {
  const tracks =
    Array.from(
      {
        length: 40,
      },
      (
        _,
        index,
      ) =>
        track(index + 1),
    );

  return {
    syncedAt:
      "2026-07-28T12:00:00.000Z",
    profile: {
      id: "spotify-user",
      display_name:
        "Canal Tester",
    },
    topArtists: [
      {
        id: "artist-1",
        name: "Canal Artist",
        uri:
          "spotify:artist:1",
        genres: [
          "jazz",
          "ambient",
        ],
      },
    ],
    topTracks: tracks,
    recentTracks: [],
    savedTracks: tracks,
    playlistTracks: tracks,
    discoveryTracks: [],
    playlists: [],
    topGenres: [
      {
        name: "jazz",
        count: 1,
      },
    ],
    trackGenres:
      Object.fromEntries(
        tracks.map(
          (item) => [
            item.id,
            [
              "jazz",
              "ambient",
            ],
          ],
        ),
      ),
    warnings: [],
  };
}

function largeLibrarySnapshot(): SpotifyLibrarySnapshot {
  const tracks = Array.from(
    { length: 1_000 },
    (_, index) => track(index + 1),
  );

  return {
    ...snapshot(),
    topTracks: tracks.slice(0, 20),
    recentTracks: tracks.slice(0, 20),
    savedTracks: tracks,
    playlistTracks: [],
    trackGenres: Object.fromEntries(
      tracks.map((item) => [
        item.id,
        ["jazz", "ambient"],
      ]),
    ),
  };
}

describe(
  "Spotify Scene generation",
  () => {
    it.each([
      [
        15,
        5,
      ],
      [
        60,
        20,
      ],
    ])(
      "aligns a %i-minute Scene to %i real three-minute tracks",
      (
        durationMinutes,
        expectedTracks,
      ) => {
        const result =
          generateSceneFromSpotify(
            {
              ...DEFAULT_SCENE_STUDIO_DRAFT,
              durationMinutes,
            },
            snapshot(),
          );

        expect(
          result.trackSignals,
        ).toHaveLength(
          expectedTracks,
        );

        expect(
          result.estimatedDurationMinutes,
        ).toBe(
          durationMinutes,
        );

        expect(
          result.scene.tracks[0],
        ).toMatchObject({
          durationMs:
            180_000,
        });

        expect(
          result.scene.tracks[0]
            .imageUrl,
        ).toBeUndefined();
      },
    );

    it(
      "keeps selected genres in the generated Scene profile",
      () => {
        const jazzSnapshot = snapshot();
        jazzSnapshot.trackGenres = Object.fromEntries(
          Object.keys(jazzSnapshot.trackGenres).map((trackId) => [
            trackId,
            ["jazz"],
          ]),
        );
        const result =
          generateSceneFromSpotify(
            {
              ...DEFAULT_SCENE_STUDIO_DRAFT,
              preferredGenres: [
                "Jazz",
              ],
            },
            jazzSnapshot,
          );

        expect(
          result.scene.genres,
        ).toContain(
          "Jazz",
        );
      },
    );

    it(
      "keeps selected genres fail-closed when Spotify provides no genre signals",
      () => {
        const library = snapshot();
        library.topGenres = [];
        library.trackGenres = {};

        const result = generateSceneWithSpotifyGenreFallback(
          {
            ...DEFAULT_SCENE_STUDIO_DRAFT,
            preferredGenres: ["Rock", "R&B"],
            allowAdjacentGenres: false,
          },
          library,
          { variationSeed: "missing-genre-signals" },
        );

        expect(result.scene.tracks).toHaveLength(0);
        expect(result.draft.preferredGenres).toEqual(["Rock", "R&B"]);
        expect(result.rationale[0]).toContain("no verifiable Rock, R&B matches");
      },
    );

    it(
      "reaches deeper into a full imported library and varies New mixes",
      () => {
        const library = largeLibrarySnapshot();
        const familiar = generateSceneFromSpotify(
          {
            ...DEFAULT_SCENE_STUDIO_DRAFT,
            familiarity: "familiar",
            familiarityLevel: 0,
          },
          library,
          { variationSeed: "familiar-seed" },
        );
        const firstNewMix = generateSceneFromSpotify(
          {
            ...DEFAULT_SCENE_STUDIO_DRAFT,
            familiarity: "discovery",
            familiarityLevel: 100,
          },
          library,
          { variationSeed: "new-seed-a" },
        );
        const secondNewMix = generateSceneFromSpotify(
          {
            ...DEFAULT_SCENE_STUDIO_DRAFT,
            familiarity: "discovery",
            familiarityLevel: 100,
          },
          library,
          { variationSeed: "new-seed-b" },
        );
        const averageTrackNumber = (
          result: typeof familiar,
        ): number =>
          result.trackSignals.reduce(
            (total, signal) =>
              total +
              Number(
                signal.track.id.replace("track-", ""),
              ),
            0,
          ) / result.trackSignals.length;

        expect(
          averageTrackNumber(firstNewMix),
        ).toBeGreaterThan(
          averageTrackNumber(familiar) + 100,
        );
        expect(
          firstNewMix.trackSignals.map(
            (signal) => signal.track.id,
          ),
        ).not.toEqual(
          secondNewMix.trackSignals.map(
            (signal) => signal.track.id,
          ),
        );
      },
    );

    it(
      "strongly favors top and recent listening when Familiar is selected",
      () => {
        const familiarTracks = Array.from(
          { length: 8 },
          (_, index) => track(index + 1),
        );
        const discoveryTracks = Array.from(
          { length: 8 },
          (_, index) => track(index + 101),
        );
        const library = {
          ...snapshot(),
          topTracks: familiarTracks,
          recentTracks: familiarTracks,
          savedTracks: familiarTracks,
          playlistTracks: [],
          discoveryTracks,
          trackGenres: Object.fromEntries(
            [...familiarTracks, ...discoveryTracks].map((item) => [
              item.id,
              ["jazz", "ambient"],
            ]),
          ),
        };
        const familiar = generateSceneFromSpotify(
          {
            ...DEFAULT_SCENE_STUDIO_DRAFT,
            durationMinutes: 15,
            familiarity: "familiar",
            familiarityLevel: 0,
          },
          library,
          { variationSeed: "familiar-priority" },
        );

        expect(
          familiar.trackSignals.every((signal) =>
            signal.sources.includes("top") || signal.sources.includes("recent"),
          ),
        ).toBe(true);
      },
    );

    it(
      "deprioritizes the current playlist so Regenerate returns new songs",
      () => {
        const library = largeLibrarySnapshot();
        const draft = {
          ...DEFAULT_SCENE_STUDIO_DRAFT,
          durationMinutes: 35,
        };
        const first = generateSceneFromSpotify(
          draft,
          library,
          { variationSeed: "regenerate-first" },
        );
        const second = generateSceneFromSpotify(
          draft,
          library,
          {
            variationSeed: "regenerate-second",
            deprioritizedTrackIds: first.trackSignals.map(
              (signal) => signal.track.id,
            ),
          },
        );

        expect(second.trackSignals.map((signal) => signal.track.id)).not.toEqual(
          first.trackSignals.map((signal) => signal.track.id),
        );
        expect(
          second.trackSignals.some(
            (signal) => !first.trackSignals.some(
              (current) => current.track.id === signal.track.id,
            ),
          ),
        ).toBe(true);
      },
    );

    it(
      "honors recent-Scene exclusion and smooth-transition preferences",
      () => {
        const library = snapshot();
        library.trackGenres = Object.fromEntries(
          Object.keys(library.trackGenres).map((trackId, index) => [
            trackId,
            index % 2 === 0 ? ["ambient"] : ["rock", "metal"],
          ]),
        );
        const rejectedTrackIds = ["track-1", "track-2", "track-3"];
        const smooth = generateSceneFromSpotify(
          {
            ...DEFAULT_SCENE_STUDIO_DRAFT,
            arc: "build",
            smoothTransitions: true,
          },
          library,
          {
            rejectedTrackIds,
            variationSeed: "preference-controls",
          },
        );
        const unsmoothed = generateSceneFromSpotify(
          {
            ...DEFAULT_SCENE_STUDIO_DRAFT,
            arc: "build",
            smoothTransitions: false,
          },
          library,
          {
            rejectedTrackIds,
            variationSeed: "preference-controls",
          },
        );
        const intensities = smooth.trackSignals.map((signal) => signal.intensity);

        expect(smooth.trackSignals.some((signal) =>
          rejectedTrackIds.includes(signal.track.id),
        )).toBe(false);
        expect(intensities).toEqual([...intensities].sort((a, b) => a - b));
        expect(unsmoothed.trackSignals.map((signal) => signal.track.id)).not.toEqual(
          smooth.trackSignals.map((signal) => signal.track.id),
        );
      },
    );

    it(
      "generates a unique default name that is not already in the library",
      () => {
        const first = generateSceneFromSpotify(
          DEFAULT_SCENE_STUDIO_DRAFT,
          snapshot(),
          { variationSeed: "first-name" },
        );
        const second = generateSceneFromSpotify(
          DEFAULT_SCENE_STUDIO_DRAFT,
          snapshot(),
          {
            variationSeed: "second-name",
            existingSceneNames: [first.scene.name],
          },
        );
        const third = generateSceneFromSpotify(
          DEFAULT_SCENE_STUDIO_DRAFT,
          snapshot(),
          {
            variationSeed: "third-name",
            existingSceneNames: [
              first.scene.name.toUpperCase(),
              second.scene.name,
            ],
          },
        );

        expect(second.scene.name).not.toBe(first.scene.name);
        expect(third.scene.name.toLowerCase()).not.toBe(
          first.scene.name.toLowerCase(),
        );
        expect(third.scene.name).not.toBe(second.scene.name);
      },
    );
  },
);
