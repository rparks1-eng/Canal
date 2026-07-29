import {
  getSpotifyLibraryTrackSuggestions,
} from "../lib/spotify-scene-tools";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

function snapshot(): SpotifyLibrarySnapshot {
  const recent = {
    id: "recent",
    name:
      "After Hours",
    uri:
      "spotify:track:recent",
    artists: [
      {
        id: "artist-a",
        name:
          "The Weeknd",
        uri:
          "spotify:artist:a",
      },
    ],
  };

  const saved = {
    id: "saved",
    name:
      "Afterglow",
    uri:
      "spotify:track:saved",
    artists: [
      {
        id: "artist-b",
        name:
          "Taylor Swift",
        uri:
          "spotify:artist:b",
      },
    ],
  };

  return {
    syncedAt:
      "2026-07-28T12:00:00.000Z",
    profile: {
      id: "spotify-user",
      display_name:
        "Canal Tester",
    },
    topArtists: [],
    topTracks: [],
    recentTracks: [
      recent,
    ],
    savedTracks: [
      saved,
    ],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [],
    trackGenres: {},
    warnings: [],
  };
}

describe(
  "Spotify typeahead",
  () => {
    it(
      "returns likely listening matches from the first typed letter",
      () => {
        const suggestions =
          getSpotifyLibraryTrackSuggestions(
            snapshot(),
            "a",
          );

        expect(
          suggestions.map(
            (track) =>
              track.id,
          ),
        ).toEqual([
          "recent",
          "saved",
        ]);
      },
    );

    it(
      "matches artist names as well as song names",
      () => {
        const suggestions =
          getSpotifyLibraryTrackSuggestions(
            snapshot(),
            "tay",
          );

        expect(
          suggestions,
        ).toHaveLength(1);

        expect(
          suggestions[0]?.id,
        ).toBe(
          "saved",
        );
      },
    );
  },
);
