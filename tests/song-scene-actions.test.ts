import fs from "node:fs";
import path from "node:path";

import {
  normalizeSongSceneActionInput,
  sceneCanAcceptSong,
  songSceneActionParams,
} from "../lib/song-scene-actions";
import type { StoredScene } from "../lib/scenes";

const scene: StoredScene = {
  id: "scene-1",
  name: "Night Signal",
  activity: "Driving",
  duration: "30 min",
  emotions: "Focused",
  genres: "Electronic",
  energy: "medium",
  familiarity: "balanced",
  artists: "",
  songRequest: "",
  avoid: "",
  collaborators: [],
  tracks: [],
  visibility: "private",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
  libraryType: "created",
};

describe("song to Scene actions", () => {
  it("normalizes bounded route input and preserves canonical parameters", () => {
    const song = normalizeSongSceneActionInput({
      trackId: "4uLU6hMCjMI75M1A2tKUQC",
      title: "Never Gonna Give You Up",
      artist: "Rick Astley",
      artworkUrl: "https://i.scdn.co/image/example",
      spotifyUrl: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    });
    expect(song).not.toBeNull();
    expect(songSceneActionParams(song!)).toMatchObject({
      trackId: "4uLU6hMCjMI75M1A2tKUQC",
      trackTitle: "Never Gonna Give You Up",
      artistName: "Rick Astley",
    });
    expect(normalizeSongSceneActionInput({ trackId: "../bad", title: "Song", artist: "Artist" })).toBeNull();
  });

  it("blocks duplicate, full, and read-only Scene mutations", () => {
    expect(sceneCanAcceptSong(scene, "track-1")).toBe("ready");
    expect(sceneCanAcceptSong({ ...scene, tracks: [{ id: "track-1", title: "One", artist: "Artist" }] }, "track-1")).toBe("duplicate");
    expect(sceneCanAcceptSong({ ...scene, tracks: Array.from({ length: 100 }, (_, index) => ({ id: `track-${index}`, title: "Song", artist: "Artist" })) }, "new-track")).toBe("full");
    expect(sceneCanAcceptSong({ ...scene, libraryType: "saved" }, "track-1")).toBe("read-only");
  });

  it("implements an account-fenced picker that saves then opens the updated Scene", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "app/add-song-to-scene.tsx"), "utf8");
    const repository = fs.readFileSync(path.join(process.cwd(), "lib/song-scene-actions.ts"), "utf8");
    expect(route).toContain("sameSceneStudioScope(operationScope, scopeRef.current)");
    expect(route).toContain("await addSongToScene(scene, song, operationScope");
    expect(route).toContain('pathname: "/scenes/[sceneId]"');
    expect(repository).toContain("upsertSceneForScope(");
    expect(repository).toContain("tracks: [...scene.tracks, track]");
  });
});
