import {
  rankSceneRecommendations,
} from "../lib/scene-recommendations";

import type {
  StoredScene,
} from "../lib/scenes";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

function scene(
  id: string,
  genres: string,
  artists: string,
): StoredScene {
  return {
    id,
    name: id,
    activity: "Focus",
    duration:
      "15 minutes",
    emotions: "Calm",
    genres,
    energy: "low",
    familiarity:
      "balanced",
    artists,
    songRequest: "",
    avoid: "",
    collaborators: [],
    tracks: [],
    visibility:
      "private",
    createdAt:
      "2026-07-28T12:00:00.000Z",
    updatedAt:
      "2026-07-28T12:00:00.000Z",
    libraryType:
      "created",
  };
}

const spotifySnapshot =
  {
    topGenres: [
      {
        name: "jazz",
        count: 5,
      },
    ],
    topArtists: [
      {
        id: "artist-1",
        name:
          "Miles Davis",
        uri:
          "spotify:artist:1",
      },
    ],
  } as SpotifyLibrarySnapshot;

describe(
  "Scene recommendations",
  () => {
    it(
      "prioritizes Scenes matching the latest Spotify taste",
      () => {
        const ranked =
          rankSceneRecommendations(
            [
              scene(
                "rock",
                "Rock",
                "Other Artist",
              ),
              scene(
                "jazz",
                "Jazz",
                "Miles Davis",
              ),
            ],
            spotifySnapshot,
          );

        expect(
          ranked[0]?.id,
        ).toBe(
          "jazz",
        );
      },
    );
  },
);
