import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  readSceneRecommendationLearning,
  recordSceneRecommendationFeedback,
} from "../lib/scene-recommendation-feedback";
import {
  evaluateSceneRecommendations,
  generationDifferenceRate,
} from "../lib/scene-recommendation-evaluation";
import {
  DEFAULT_SCENE_STUDIO_DRAFT,
  generateSceneFromSpotify,
} from "../lib/scene-studio";
import type { SpotifyTrack } from "../lib/spotify-api";
import type { SpotifyLibrarySnapshot } from "../lib/spotify-library";

const mockStorage = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    clear: jest.fn(async () => mockStorage.clear()),
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
  },
}));
jest.mock("../lib/supabase", () => ({ isSupabaseConfigured: false, supabase: {} }));

const scope = { userId: "account-a", accountEpoch: 1, sessionGeneration: "session-a" } as const;
const currentScope = () => scope;

function track(index: number): SpotifyTrack {
  return {
    id: `track-${index}`, name: `Track ${index}`, uri: `spotify:track:${index}`,
    duration_ms: 180_000, explicit: false, popularity: Math.max(1, 100 - index),
    artists: [{ id: `artist-${index % 8}`, name: `Artist ${index % 8}`, uri: `spotify:artist:${index % 8}` }],
    album: { id: `album-${index}`, name: `Album ${index}`, uri: `spotify:album:${index}`, images: [] },
  };
}

function library(): SpotifyLibrarySnapshot {
  const tracks = Array.from({ length: 240 }, (_, index) => track(index + 1));
  return {
    syncedAt: "2026-08-09T00:00:00.000Z", profile: { id: "spotify-a", display_name: "A" },
    topArtists: [], topTracks: tracks.slice(0, 20), recentTracks: tracks.slice(0, 20),
    savedTracks: tracks, playlistTracks: tracks.slice(20), discoveryTracks: tracks.slice(160), playlists: [],
    topGenres: [{ name: "rock", count: 240 }],
    trackGenres: Object.fromEntries(tracks.map((item) => [item.id, ["rock"]])), warnings: [],
  };
}

describe("Scene recommendation quality and learning", () => {
  beforeEach(async () => AsyncStorage.clear());

  it("persists rejection by account and intent without leaking to another account", async () => {
    const draft = { ...DEFAULT_SCENE_STUDIO_DRAFT, preferredGenres: ["Rock"] };
    await recordSceneRecommendationFeedback({ scope, currentScope, draft, action: "doesnt_match", trackId: "track-7" });
    expect((await readSceneRecommendationLearning(scope, currentScope, draft)).rejectedTrackIds).toContain("track-7");
    const other = { userId: "account-b", accountEpoch: 2, sessionGeneration: "session-b" } as const;
    expect((await readSceneRecommendationLearning(other, () => other, draft)).rejectedTrackIds).toEqual([]);
  });

  it("uses the latest feedback for a track and lets unfavorite return it to neutral", async () => {
    const draft = { ...DEFAULT_SCENE_STUDIO_DRAFT, preferredGenres: ["Rock"] };
    await recordSceneRecommendationFeedback({ scope, currentScope, draft, action: "favorite", trackId: "track-8" });
    await recordSceneRecommendationFeedback({ scope, currentScope, draft, action: "doesnt_match", trackId: "track-8" });
    let learning = await readSceneRecommendationLearning(scope, currentScope, draft);
    expect(learning.rejectedTrackIds).toContain("track-8");
    expect(learning.preferredTrackIds).not.toContain("track-8");

    await recordSceneRecommendationFeedback({ scope, currentScope, draft, action: "favorite", trackId: "track-9" });
    await recordSceneRecommendationFeedback({ scope, currentScope, draft, action: "unfavorite", trackId: "track-9" });
    learning = await readSceneRecommendationLearning(scope, currentScope, draft);
    expect(learning.preferredTrackIds).not.toContain("track-9");
  });

  it("changes the candidate mix across familiarity and materially changes regeneration", () => {
    const snapshot = library();
    const familiar = generateSceneFromSpotify({ ...DEFAULT_SCENE_STUDIO_DRAFT, durationMinutes: 30, familiarity: "familiar", familiarityLevel: 0 }, snapshot, { variationSeed: "familiar" });
    const discovery = generateSceneFromSpotify({ ...DEFAULT_SCENE_STUDIO_DRAFT, durationMinutes: 30, familiarity: "discovery", familiarityLevel: 100 }, snapshot, { variationSeed: "discover" });
    const regenerated = generateSceneFromSpotify(DEFAULT_SCENE_STUDIO_DRAFT, snapshot, {
      variationSeed: "regenerate", deprioritizedTrackIds: familiar.trackSignals.map((signal) => signal.track.id),
    });
    expect(discovery.sourceBreakdown.discovery + discovery.sourceBreakdown.playlist).toBeGreaterThan(familiar.sourceBreakdown.discovery + familiar.sourceBreakdown.playlist);
    expect(generationDifferenceRate(familiar, regenerated)).toBeGreaterThanOrEqual(0.5);
  });

  it("reports strict genre precision, diversity, repetition, familiarity, and rejection improvement", () => {
    const snapshot = library();
    const rejected = ["track-1", "track-2"];
    const generated = generateSceneFromSpotify({ ...DEFAULT_SCENE_STUDIO_DRAFT, preferredGenres: ["Rock"] }, snapshot, { variationSeed: "metrics", rejectedTrackIds: rejected });
    const metrics = evaluateSceneRecommendations([generated], rejected);
    expect(metrics.genrePrecision).toBe(1);
    expect(metrics.rejectedReturnRate).toBe(0);
    expect(metrics.diversityRate).toBe(1);
    expect(metrics.repetitionRate).toBe(0);
  });

  it("uses explicit energy and familiarity reasons as bounded ranking nudges", () => {
    const snapshot = library();
    const baseline = generateSceneFromSpotify(
      { ...DEFAULT_SCENE_STUDIO_DRAFT, durationMinutes: 45 },
      snapshot,
      { variationSeed: "reason-bias" },
    );
    const adjusted = generateSceneFromSpotify(
      { ...DEFAULT_SCENE_STUDIO_DRAFT, durationMinutes: 45 },
      snapshot,
      {
        variationSeed: "reason-bias",
        reasonBias: {
          energyBias: -25,
          familiarityBias: 25,
          avoidArtistIds: [],
          avoidGenres: [],
          suppressExplicit: false,
        },
      },
    );
    const meanIntensity = (result: typeof baseline) =>
      result.trackSignals.reduce(
        (total, signal) => total + signal.intensity,
        0,
      ) / Math.max(result.trackSignals.length, 1);

    expect(meanIntensity(adjusted)).toBeLessThan(meanIntensity(baseline));
    expect(
      generationDifferenceRate(baseline, adjusted),
    ).toBeGreaterThan(0);
  });

  it("keeps provider-derived artist and genre bias descriptive until policy approval", () => {
    const snapshot = library();
    const baseline = generateSceneFromSpotify(
      DEFAULT_SCENE_STUDIO_DRAFT,
      snapshot,
      { variationSeed: "policy-gate" },
    );
    const gated = generateSceneFromSpotify(
      DEFAULT_SCENE_STUDIO_DRAFT,
      snapshot,
      {
        variationSeed: "policy-gate",
        reasonBias: {
          energyBias: 0,
          familiarityBias: 0,
          avoidArtistIds: ["artist-1"],
          avoidGenres: ["rock"],
          suppressExplicit: false,
        },
      },
    );

    expect(gated.trackSignals.map((signal) => signal.track.id)).toEqual(
      baseline.trackSignals.map((signal) => signal.track.id),
    );
  });
});
