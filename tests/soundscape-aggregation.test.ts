import {
  buildSoundscapeArchive,
  soundscapePeriodForDate,
} from "../lib/soundscape-aggregation";

import type {
  SoundscapeAggregationInput,
} from "../lib/soundscape-types";

import {
  deriveSoundscapeSongDna,
} from "../lib/soundscape-collector";

import type {
  StoredScene,
} from "../lib/scenes";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

function input(): SoundscapeAggregationInput {
  const period = soundscapePeriodForDate("year", new Date("2026-08-11T12:00:00.000Z"));
  return {
    accountId: "user-a",
    period,
    generatedAt: "2026-08-11T12:00:00.000Z",
    scenes: [{
      id: "scene-1", name: "Soft Motion", activity: "Focus", moods: ["Calm", "Dreamy"],
      genres: ["Ambient"], trackIds: ["track-1"], createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z", playCount: 4, favorite: true,
    }],
    stages: [{
      id: "stage-1", name: "Quiet Room", activity: "Focus", participantCount: 3,
      trackIds: ["track-1", "track-2"], createdAt: "2026-07-01T00:00:00.000Z",
      endedAt: "2026-07-01T01:00:00.000Z", role: "host",
    }],
    discoveries: [{
      trackId: "track-2", title: "New Current", artist: "Canal Artist",
      discoveredAt: "2026-06-01T00:00:00.000Z", source: "recommendation", saved: true,
    }],
    songDna: [{
      trackId: "track-1", title: "Blue Glass", artist: "Canal Artist", genres: ["Ambient"],
      moods: ["Calm"], decade: "2020s", playCount: 4, observedAt: "2026-08-01T00:00:00.000Z",
    }],
    listening: [{
      id: "listen-1", sceneId: "scene-1", sceneName: "Soft Motion",
      startedAt: "2026-08-01T00:00:00.000Z", completedAt: "2026-08-01T00:30:00.000Z",
      tracksPlayed: 8, durationSeconds: 1800,
    }],
    feedback: [{
      id: "feedback-1", sceneId: "scene-1", rating: "perfect", note: "Exactly right",
      createdAt: "2026-08-01T00:31:00.000Z",
    }],
    snapshots: [{
      snapshotId: "snapshot-1", sourceId: "scene-1", createdAt: "2026-08-01T00:32:00.000Z",
      mediaType: "video", compositionState: "ready", shareable: true,
    }],
  };
}

describe("Soundscape aggregation", () => {
  it("creates stable UTC yearly and seasonal boundaries", () => {
    expect(soundscapePeriodForDate("year", new Date("2026-08-11T12:00:00Z"))).toEqual({
      kind: "year", key: "2026", startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2027-01-01T00:00:00.000Z",
    });
    expect(soundscapePeriodForDate("season", new Date("2026-08-11T12:00:00Z"))).toEqual({
      kind: "season", key: "2026-summer", startsAt: "2026-07-01T00:00:00.000Z", endsAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("builds a private versioned archive and a bounded share projection", () => {
    const archive = buildSoundscapeArchive(input(), 7);
    expect(archive).toMatchObject({
      accountId: "user-a", version: 7, visibility: "private", historyState: "ready",
      content: { totals: { scenes: 1, stages: 1, discoveries: 1, listeningSessions: 1, finishedSnapshots: 1 } },
    });
    expect(archive.shareProjection.highlights).toEqual({
      sceneNames: ["Soft Motion"], stageNames: ["Quiet Room"],
      discoveries: [{ title: "New Current", artist: "Canal Artist" }],
    });
    expect(JSON.stringify(archive.shareProjection)).not.toMatch(/snapshot-1|listen-1|feedback-1/u);
  });

  it("filters every dated source to the requested period", () => {
    const value = input();
    value.scenes.push({ ...value.scenes[0], id: "old-scene", updatedAt: "2025-12-31T23:59:59.999Z" });
    value.songDna.push({ ...value.songDna[0], trackId: "old-track", observedAt: "2025-12-31T23:59:59.999Z" });
    const archive = buildSoundscapeArchive(value);
    expect(archive.content.sceneEvolution.map((scene) => scene.sceneId)).toEqual(["scene-1"]);
    expect(archive.content.songDna.map((track) => track.trackId)).toEqual(["track-1"]);
  });

  it("reports insufficient history without inventing highlights", () => {
    const value = input();
    value.stages = [];
    value.discoveries = [];
    value.listening = [];
    value.feedback = [];
    const archive = buildSoundscapeArchive(value);
    expect(archive.historyState).toBe("insufficient_history");
    expect(archive.insufficientReason).toMatch(/Keep listening/u);
    expect(archive.shareProjection.historyState).toBe("insufficient_history");
    expect(archive.content.totals.stages).toBe(0);
  });

  it("derives Song DNA mood and genre context only from cached tracks and containing Scenes", () => {
    const scene = {
      id: "scene-a", name: "Calm Focus", activity: "Focus", duration: "30 minutes",
      emotions: "Calm, Dreamy", genres: "Ambient, Electronic", energy: "Steady",
      familiarity: "Balanced", artists: "", songRequest: "", avoid: "", collaborators: [],
      tracks: [{ id: "track-a", title: "Blue Glass", artist: "Artist" }],
      visibility: "private", createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z", libraryType: "created", playCount: 3,
    } as StoredScene;
    const track = {
      id: "track-a", name: "Blue Glass", uri: "spotify:track:a",
      artists: [{ id: "artist-a", name: "Artist", uri: "spotify:artist:a" }],
    };
    const spotify = {
      syncedAt: "2026-08-01T00:00:00.000Z", profile: {}, topArtists: [], topTracks: [],
      recentTracks: [track], savedTracks: [], playlistTracks: [], discoveryTracks: [],
      playlists: [], topGenres: [], trackGenres: { "track-a": ["Downtempo"] }, warnings: [],
    } as unknown as SpotifyLibrarySnapshot;

    expect(deriveSoundscapeSongDna([scene], spotify, spotify.syncedAt)[0]).toMatchObject({
      trackId: "track-a", genres: ["Downtempo", "Ambient", "Electronic"],
      moods: ["Calm", "Dreamy"], playCount: 3,
    });
  });
});
