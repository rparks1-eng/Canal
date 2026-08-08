import {
  DEFAULT_SCENE_STUDIO_DRAFT,
  generateSceneFromSpotify,
} from "../lib/scene-studio";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import type {
  SpotifyTrack,
} from "../lib/spotify-api";

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
        const result =
          generateSceneFromSpotify(
            {
              ...DEFAULT_SCENE_STUDIO_DRAFT,
              preferredGenres: [
                "Jazz",
              ],
            },
            snapshot(),
          );

        expect(
          result.scene.genres,
        ).toContain(
          "Jazz",
        );
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
  },
);
