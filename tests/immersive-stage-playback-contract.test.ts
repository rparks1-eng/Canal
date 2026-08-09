import fs from "node:fs";
import path from "node:path";

import { sceneAtmosphere, stageAtmosphere } from "../components/canal-ui/scene-signature";

const root = process.cwd();
const player = fs.readFileSync(path.join(root, "app/now-playing.tsx"), "utf8");
const stage = fs.readFileSync(path.join(root, "app/live-stage/[stageId].tsx"), "utf8");
const library = fs.readFileSync(path.join(root, "lib/live-stages.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260809052523_aggregate_live_stage_atmosphere.sql"),
  "utf8",
);

describe("immersive Scene and Stage playback", () => {
  it("derives stable but distinct palettes from Scene and collaborative Stage signals", () => {
    const quiet = sceneAtmosphere({ name: "Quiet Hours", activity: "Sleep", emotions: "Dreamy", energy: "Low" });
    const active = stageAtmosphere({ name: "City Run", activity: "Workout", atmosphereSignals: ["energetic", "bright", "running"] });

    expect(quiet.base).not.toBe(active.base);
    expect(quiet.navigation).not.toBe(active.navigation);
    expect(quiet.accent).not.toBe(active.accent);
  });

  it("installs and clears metadata-derived route atmospheres", () => {
    expect(player).toContain("setOverride(sceneAtmosphere(scene))");
    expect(stage).toContain("setOverride(stageAtmosphere(stage))");
    expect(player).toContain("setOverride(null)");
    expect(stage).toContain("setOverride(null)");
  });

  it("uses the approved compact playback hierarchy and keeps every action wired", () => {
    expect(player).toContain('aspectRatio: 1');
    expect(player).toContain("playbackActions");
    expect(player).toContain('accessibilityLabel="View Scene details"');
    expect(player).toContain('accessibilityLabel="Create a Snapshot from this Scene"');
    expect(player).toContain("<LinerNotesAction");
    expect(player).toContain('accessibilityLabel="Previous track"');
    expect(player).toContain('accessibilityLabel="Next track"');

    expect(stage).toContain("styles.quickActions");
    expect(stage).toContain("View context for");
    expect(stage).toContain('accessibilityLabel="Open Stage chat"');
    expect(stage).toContain('accessibilityLabel="Close Stage chat"');
    expect(stage).toContain('visible={chatOpen}');
    expect(stage).toContain('styles.chatNowPlaying');
    expect(stage).toContain('chatReveal.interpolate');
    expect(stage).toContain("captureSnapshot()");
    expect(stage).toContain("void advanceTrack()");
    expect(stage).toContain('accessibilityLabel="Play next Stage track"');
    expect(stage).toContain('name="play-skip-forward"');
    expect(stage).toContain("styles.artworkFrame");
    expect(stage).toContain('accessibilityHint="Advances the Stage to the next song"');
    expect(stage).toContain("nextTrackText");
    expect(stage).not.toContain("<LinerNotesAction");
  });

  it("persists a bounded aggregate of ready collaborator Scene signals", () => {
    expect(migration).toContain("add column if not exists atmosphere_signals jsonb");
    expect(migration).toContain("jsonb_array_length(atmosphere_signals) <= 24");
    expect(migration).toContain("contribution.preferences ->> 'activity'");
    expect(migration).toContain("contribution.preferences -> 'moods'");
    expect(migration).toContain("contribution.preferences -> 'genres'");
    expect(migration).toContain("after insert or update of preferences, ready");
    expect(library).toContain("atmosphere_signals");
    expect(library).toContain("normalizeAtmosphereSignals");
  });
});
