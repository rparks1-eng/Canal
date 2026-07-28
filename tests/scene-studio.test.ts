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
          imageUrl:
            expect.stringContaining(
              "https://example.com/",
            ),
        });
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
  },
);
