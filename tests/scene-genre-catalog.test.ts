import {
  mergeUserSelectedGenreCatalogTracks,
} from "../lib/scene-genre-catalog";

import type {
  MusicCatalogTrack,
} from "../lib/music-provider-model";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

function snapshot(): SpotifyLibrarySnapshot {
  return {
    syncedAt: "2026-08-08T00:00:00.000Z",
    profile: {
      id: "owner",
      display_name: "Owner",
    },
    topArtists: [],
    topTracks: [],
    recentTracks: [],
    savedTracks: [],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [],
    trackGenres: {},
    warnings: [],
  };
}

function catalogTrack(id: string): MusicCatalogTrack {
  return {
    reference: {
      providerId: "spotify",
      itemId: id,
      uri: `spotify:track:${id}`,
      webUrl: `https://open.spotify.com/track/${id}`,
    },
    name: `Track ${id}`,
    durationMs: 180_000,
    explicit: false,
    artists: [{
      artistId: `artist-${id}`,
      name: `Artist ${id}`,
    }],
    album: {
      albumId: `album-${id}`,
      name: `Album ${id}`,
      imageUrl: `https://i.scdn.co/image/${id}`,
    },
  };
}

describe("Scene user-selected genre catalog", () => {
  it("turns explicit Spotify genre search results into verifiable discovery candidates", () => {
    const original = snapshot();
    const merged = mergeUserSelectedGenreCatalogTracks(original, [
      {
        genre: "Rock",
        tracks: [catalogTrack("rock-a")],
      },
      {
        genre: "R&B",
        tracks: [catalogTrack("rnb-a")],
      },
    ]);

    expect(merged.discoveryTracks.map((track) => track.id)).toEqual([
      "rock-a",
      "rnb-a",
    ]);
    expect(merged.trackGenres).toEqual({
      "rock-a": ["Rock"],
      "rnb-a": ["R&B"],
    });
    expect(merged.discoveryTracks[0]?.album?.imageUrl).toBe(
      "https://i.scdn.co/image/rock-a",
    );
    expect(original.discoveryTracks).toHaveLength(0);
    expect(original.trackGenres).toEqual({});
  });
});
