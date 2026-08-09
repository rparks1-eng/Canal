import {
  refillGeneratedSceneToDuration,
  regenerateGeneratedSceneEditor,
  rejectTrackFromGeneratedSceneEditor,
  removeTrackFromGeneratedSceneEditor,
  replaceTrackInGeneratedSceneEditor,
  reorderTrackInGeneratedSceneEditor,
} from "../lib/scene-preview-editor";

import {
  DEFAULT_SCENE_STUDIO_DRAFT,
  generateSceneFromSpotify,
} from "../lib/scene-studio";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

function snapshot(ids = ["one", "two", "three"]): SpotifyLibrarySnapshot {
  const tracks = ids.map((id) => ({
    id,
    name: `Track ${id}`,
    uri: `spotify:track:${id}`,
    duration_ms: 180_000,
    explicit: false,
    popularity: 50,
    artists: [{ id: `artist-${id}`, name: `Artist ${id}`, uri: `spotify:artist:${id}` }],
    album: { id: `album-${id}`, name: `Album ${id}`, uri: `spotify:album:${id}`, images: [] },
  }));

  return {
    syncedAt: "2026-08-08T00:00:00.000Z",
    profile: { id: "owner", display_name: "Owner" },
    topArtists: [],
    topTracks: tracks,
    recentTracks: [],
    savedTracks: tracks,
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [],
    trackGenres: {},
    warnings: [],
  };
}

function result() {
  return generateSceneFromSpotify(
    {
      ...DEFAULT_SCENE_STUDIO_DRAFT,
      durationMinutes: 9,
    },
    snapshot(),
    { variationSeed: "editor-controls" },
  );
}

describe("Scene Preview editing controls", () => {
  it("reorders track signals and their saved Scene tracks together", () => {
    const initial = result();
    const firstId = initial.trackSignals[0].track.id;
    const reordered = reorderTrackInGeneratedSceneEditor(initial, firstId, "down");

    expect(reordered.trackSignals[1].track.id).toBe(firstId);
    expect(reordered.scene.tracks.map((track) => track.id)).toEqual(
      reordered.trackSignals.map((signal) => signal.track.id),
    );
    expect(reorderTrackInGeneratedSceneEditor(reordered, firstId, "down"))
      .not.toBe(reordered);
  });

  it("bounds reorder operations without changing the Scene", () => {
    const initial = result();

    expect(reorderTrackInGeneratedSceneEditor(
      initial,
      initial.trackSignals[0].track.id,
      "up",
    )).toBe(initial);
    expect(reorderTrackInGeneratedSceneEditor(initial, "missing", "down"))
      .toBe(initial);
  });

  it("uses the same bounded removal contract for explicit rejection", () => {
    const initial = result();
    const removedId = initial.trackSignals[0].track.id;
    const removed = removeTrackFromGeneratedSceneEditor(initial, removedId);
    const rejected = rejectTrackFromGeneratedSceneEditor(initial, removedId);

    expect(rejected.trackSignals.map((signal) => signal.track.id))
      .toEqual(removed.trackSignals.map((signal) => signal.track.id));
    expect(rejected.scene.tracks.some((track) => track.id === removedId))
      .toBe(false);
  });

  it("refuses to remove the final track", () => {
    const initial = result();
    const only = {
      ...initial,
      trackSignals: [initial.trackSignals[0]],
      scene: {
        ...initial.scene,
        tracks: [initial.scene.tracks[0]],
      },
    };

    expect(() => rejectTrackFromGeneratedSceneEditor(
      only,
      only.trackSignals[0].track.id,
    )).toThrow("A Scene must keep at least one track.");
  });

  it("refills a longer edited Scene without discarding its existing order", () => {
    const initial = result();
    const longer = {
      ...initial,
      draft: { ...initial.draft, durationMinutes: 18 },
    };
    const candidates = generateSceneFromSpotify(
      { ...DEFAULT_SCENE_STUDIO_DRAFT, durationMinutes: 18 },
      snapshot(["four", "five", "six", "seven", "eight", "nine"]),
      { variationSeed: "refill" },
    );
    const refilled = refillGeneratedSceneToDuration(longer, candidates);

    expect(refilled.trackSignals.slice(0, 3).map((signal) => signal.track.id))
      .toEqual(initial.trackSignals.map((signal) => signal.track.id));
    expect(refilled.trackSignals.length).toBeGreaterThan(initial.trackSignals.length);
  });

  it("replaces one rejected track in place and excludes the old track", () => {
    const initial = result();
    const removedId = initial.trackSignals[1].track.id;
    const candidates = generateSceneFromSpotify(
      { ...DEFAULT_SCENE_STUDIO_DRAFT, durationMinutes: 9 },
      snapshot(["four", "five", "six"]),
      { variationSeed: "replacement" },
    );
    const replaced = replaceTrackInGeneratedSceneEditor(initial, removedId, candidates);

    expect(replaced.trackSignals).toHaveLength(initial.trackSignals.length);
    expect(replaced.trackSignals[1].track.id).not.toBe(removedId);
    expect(replaced.scene.tracks.map((track) => track.id)).toEqual(
      replaced.trackSignals.map((signal) => signal.track.id),
    );
    expect(replaced.scene.tracks).toHaveLength(initial.scene.tracks.length);
    expect(replaced.scene.tracks.some((track) => track.id === removedId)).toBe(false);
    expect(replaced.rejectedTrackIds).toContain(removedId);
  });

  it("does not resurrect a swapped track after another playlist edit", () => {
    const initial = result();
    const removedId = initial.trackSignals[1].track.id;
    const candidates = generateSceneFromSpotify(
      { ...DEFAULT_SCENE_STUDIO_DRAFT, durationMinutes: 9 },
      snapshot(["four", "five", "six"]),
      { variationSeed: "replacement-persistence" },
    );
    const replaced = replaceTrackInGeneratedSceneEditor(initial, removedId, candidates);
    const editedAgain = reorderTrackInGeneratedSceneEditor(
      replaced,
      replaced.trackSignals[1].track.id,
      "down",
    );

    expect(editedAgain.scene.tracks.map((track) => track.id)).toEqual(
      editedAgain.trackSignals.map((signal) => signal.track.id),
    );
    expect(editedAgain.scene.tracks.some((track) => track.id === removedId)).toBe(false);
  });

  it("regenerates a different playlist while preserving the private preview identity", () => {
    const initial = result();
    const generated = generateSceneFromSpotify(
      initial.draft,
      snapshot(["four", "five", "six"]),
      { variationSeed: "regenerate" },
    );
    const regenerated = regenerateGeneratedSceneEditor(initial, generated);

    expect(regenerated.id).toBe(initial.id);
    expect(regenerated.scene.id).toBe(initial.scene.id);
    expect(regenerated.scene.visibility).toBe("private");
    expect(regenerated.rejectedTrackIds ?? []).toEqual(
      initial.rejectedTrackIds ?? [],
    );
    expect(regenerated.trackSignals.map((signal) => signal.track.id))
      .not.toEqual(initial.trackSignals.map((signal) => signal.track.id));
  });
});
