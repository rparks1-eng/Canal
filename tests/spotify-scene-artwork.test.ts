import {
  addSpotifyArtworkToGeneratedScene,
  addSpotifyArtworkToLiveStage,
  addSpotifyArtworkToSnapshot,
  addSpotifyArtworkToStoredScene,
  addSpotifyArtworkToTracks,
} from "../lib/spotify-scene-artwork";

import {
  DEFAULT_SCENE_STUDIO_DRAFT,
  generateSceneFromSpotify,
} from "../lib/scene-studio";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

function result() {
  const track = {
    id: "track123",
    name: "Track",
    uri: "spotify:track:track123",
    duration_ms: 180_000,
    explicit: false,
    artists: [{
      id: "artist123",
      name: "Artist",
      uri: "spotify:artist:artist123",
    }],
    album: {
      id: "album123",
      name: "Album",
      uri: "spotify:album:album123",
    },
  };
  const snapshot: SpotifyLibrarySnapshot = {
    syncedAt: "2026-08-08T00:00:00.000Z",
    profile: {
      id: "owner",
      display_name: "Owner",
    },
    topArtists: [],
    topTracks: [track],
    recentTracks: [],
    savedTracks: [track],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [],
    trackGenres: {},
    warnings: [],
  };

  return generateSceneFromSpotify(
    {
      ...DEFAULT_SCENE_STUDIO_DRAFT,
      durationMinutes: 3,
    },
    snapshot,
  );
}

describe("Spotify Scene artwork", () => {
  it("hydrates a bounded orbit track with Spotify artwork", async () => {
    const source = result().trackSignals[0]!.track;
    const fetcher = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ thumbnail_url: "https://i.scdn.co/image/orbit-cover" }),
    }));
    const [enriched] = await addSpotifyArtworkToTracks([source], fetcher);
    expect(enriched?.album?.imageUrl).toBe("https://i.scdn.co/image/orbit-cover");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fills missing artwork from a bounded allowlisted Spotify oEmbed response", async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        thumbnail_url: "https://i.scdn.co/image/cover123",
      }),
    }));
    const enriched = await addSpotifyArtworkToGeneratedScene(
      result(),
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Ftrack123",
    );
    expect(enriched.trackSignals[0]?.track.album?.imageUrl).toBe(
      "https://i.scdn.co/image/cover123",
    );
    expect(enriched.scene.tracks[0]?.imageUrl).toBe(
      "https://i.scdn.co/image/cover123",
    );
  });

  it("rejects non-Spotify artwork origins", async () => {
    const enriched = await addSpotifyArtworkToGeneratedScene(
      result(),
      async () => ({
        ok: true,
        text: async () => JSON.stringify({
          thumbnail_url: "https://example.com/not-spotify.jpg",
        }),
      }),
    );

    expect(enriched.trackSignals[0]?.track.album?.imageUrl).toBeUndefined();
  });

  it("accepts the current official Spotify oEmbed image CDN", async () => {
    const enriched = await addSpotifyArtworkToGeneratedScene(
      result(),
      async () => ({
        ok: true,
        text: async () => JSON.stringify({
          thumbnail_url: "https://image-cdn-ak.spotifycdn.com/image/cover123",
        }),
      }),
    );

    expect(enriched.trackSignals[0]?.track.album?.imageUrl).toBe(
      "https://image-cdn-ak.spotifycdn.com/image/cover123",
    );
  });

  it("accepts Spotify's alternate official oEmbed image CDN", async () => {
    const enriched = await addSpotifyArtworkToGeneratedScene(
      result(),
      async () => ({
        ok: true,
        text: async () => JSON.stringify({
          thumbnail_url: "https://image-cdn-fa.spotifycdn.com/image/cover123",
        }),
      }),
    );

    expect(enriched.trackSignals[0]?.track.album?.imageUrl).toBe(
      "https://image-cdn-fa.spotifycdn.com/image/cover123",
    );
  });

  it("hydrates artwork for an existing saved Scene without changing track order", async () => {
    const storedScene = result().scene;
    const enriched = await addSpotifyArtworkToStoredScene(
      storedScene,
      async () => ({
        ok: true,
        text: async () => JSON.stringify({
          thumbnail_url: "https://i.scdn.co/image/saved-cover",
        }),
      }),
    );

    expect(enriched.tracks.map((track) => track.id)).toEqual(
      storedScene.tracks.map((track) => track.id),
    );
    expect(enriched.tracks[0]?.imageUrl).toBe(
      "https://i.scdn.co/image/saved-cover",
    );
  });

  it("hydrates missing Snapshot artwork for Explore without changing its composition", async () => {
    const snapshot = {
      id: "snapshot-artwork",
      sceneId: "scene-artwork",
      sceneName: "Artwork moment",
      trackId: "snapshotTrack123",
      trackTitle: "Track",
      trackArtist: "Artist",
      positionMs: 0,
      note: "",
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
      visibility: "public" as const,
    };
    const fetcher = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        thumbnail_url: "https://i.scdn.co/image/snapshot-cover",
      }),
    }));

    const enriched = await addSpotifyArtworkToSnapshot(snapshot, fetcher);

    expect(enriched).toEqual({
      ...snapshot,
      trackImageUrl: "https://i.scdn.co/image/snapshot-cover",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("hydrates only the requested Stage artwork window and preserves the queue", async () => {
    const stage = {
      id: "stage-1",
      code: "123456",
      stageCode: "123456",
      name: "Artwork Stage",
      hostId: "owner",
      hostUsername: "owner",
      hostName: "Owner",
      stageKind: "community" as const,
      hostIsVerified: false,
      hostIsCanal: false,
      activity: "Listening",
      visibility: "private" as const,
      status: "live" as const,
      participants: [],
      participantCount: 0,
      listenerCount: 0,
      tracks: [
        { id: "stageTrackOne", title: "One", artist: "Artist", source: "Spotify" },
        { id: "stageTrackTwo", title: "Two", artist: "Artist", source: "Spotify" },
      ],
      currentTrackIndex: 0,
      membershipRole: "host" as const,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    };
    const fetcher = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        thumbnail_url: "https://i.scdn.co/image/stage-cover",
      }),
    }));

    const enriched = await addSpotifyArtworkToLiveStage(stage, [1], fetcher);

    expect(enriched.tracks.map((track) => track.id)).toEqual(["stageTrackOne", "stageTrackTwo"]);
    expect(enriched.tracks[0]?.imageUrl).toBeUndefined();
    expect(enriched.tracks[1]?.imageUrl).toBe("https://i.scdn.co/image/stage-cover");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
