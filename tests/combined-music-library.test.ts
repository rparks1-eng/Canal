import { combineSceneMusicLibraries } from "../lib/combined-music-library";
import type { MusicCatalogTrack, MusicLibrarySnapshot } from "../lib/music-provider-model";
import type { SpotifyTrack } from "../lib/spotify-api";
import type { SpotifyLibrarySnapshot } from "../lib/spotify-library";

const SPOTIFY_ART = "https://i.scdn.co/image/spotify-cover";
const APPLE_ART = "https://is1-ssl.mzstatic.com/image/thumb/apple-cover/600x600bb.jpg";

function spotifyTrack(): SpotifyTrack {
  return {
    id: "spotify-track",
    name: "Shared Song",
    uri: "spotify:track:spotify-track",
    artists: [{ id: "artist", name: "Shared Artist", uri: "spotify:artist:artist" }],
    album: {
      id: "album",
      name: "Shared Album",
      uri: "spotify:album:album",
      imageUrl: SPOTIFY_ART,
    },
    external_urls: { spotify: "https://open.spotify.com/track/spotify-track" },
  };
}

function spotifySnapshot(): SpotifyLibrarySnapshot {
  const track = spotifyTrack();
  return {
    syncedAt: "2026-08-12T00:00:00.000Z",
    profile: { id: "spotify-user", display_name: "Listener" },
    topArtists: [],
    topTracks: [track],
    recentTracks: [track],
    savedTracks: [track],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [{ name: "Indie Pop", count: 1 }],
    trackGenres: { "spotify-track": ["Indie Pop"] },
    warnings: [],
  };
}

function appleTrack(): MusicCatalogTrack {
  return {
    reference: {
      providerId: "apple-music",
      itemId: "apple-track",
      webUrl: "https://music.apple.com/us/song/apple-track/1",
    },
    name: "Shared Song",
    durationMs: 180_000,
    explicit: false,
    artists: [{ name: "Shared Artist" }],
    album: { name: "Shared Album", imageUrl: APPLE_ART },
    genres: ["Alternative"],
  };
}

function appleSnapshot(): MusicLibrarySnapshot {
  const track = appleTrack();
  return {
    providerId: "apple-music",
    syncedAt: "2026-08-12T00:01:00.000Z",
    account: { accountId: "canal-user", displayName: "Apple Music" },
    topArtists: [],
    topTracks: [track],
    recentTracks: [track],
    savedTracks: [track],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    albums: [],
    topGenres: [{ name: "Alternative", count: 1 }],
    trackGenres: { "apple-track": ["Alternative"] },
    warnings: [],
  };
}

describe("combined music library", () => {
  it("treats an Apple-only library as ready for Scene generation", () => {
    const combined = combineSceneMusicLibraries(null, appleSnapshot());
    expect(combined?.readyProviderIds).toEqual(["apple-music"]);
    expect(combined?.snapshot.savedTracks[0]).toMatchObject({
      id: "apple-music:apple-track",
      canalProviderId: "apple-music",
      canalProviderTrackId: "apple-track",
    });
  });

  it("merges both catalogs, unions genre evidence, and always chooses Apple artwork", () => {
    const combined = combineSceneMusicLibraries(spotifySnapshot(), appleSnapshot());
    expect(combined?.readyProviderIds).toEqual(["spotify", "apple-music"]);
    expect(combined?.snapshot.savedTracks).toHaveLength(1);
    expect(combined?.snapshot.savedTracks[0]?.album?.imageUrl).toBe(APPLE_ART);
    expect(combined?.snapshot.trackGenres["spotify-track"]).toEqual([
      "Indie Pop",
      "Alternative",
    ]);
    expect(combined?.snapshot.trackGenreEvidence["spotify-track"]).toEqual([
      { provider: "spotify", genres: ["Indie Pop"] },
      { provider: "apple-music", genres: ["Alternative"] },
    ]);
    expect(combined?.genreCatalog).toEqual(expect.arrayContaining([
      "Indie Pop",
      "Alternative",
    ]));
  });

  it("keeps a partial Spotify import available instead of reintroducing a Spotify-only generation gate", () => {
    const partial = spotifySnapshot();
    partial.importStatus = {
      state: "incomplete",
      resumed: true,
      savedTracks: { state: "partial", importedCount: 1, totalCount: 12 },
      playlists: { state: "pending", importedCount: 0 },
      playlistTracks: { state: "pending", importedCount: 0 },
      skippedPlaylists: [],
    };

    const combined = combineSceneMusicLibraries(partial, null);

    expect(combined?.readyProviderIds).toEqual(["spotify"]);
    expect(combined?.snapshot.savedTracks).toHaveLength(1);
    expect(combined?.snapshot.importStatus?.state).toBe("incomplete");
  });
});
