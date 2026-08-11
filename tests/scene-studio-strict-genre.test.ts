import React from "react";

import ScenePreviewScreen from "../app/scene-preview";
import { ConnectivityProvider } from "../providers/connectivity-provider";

import {
  DEFAULT_SCENE_STUDIO_DRAFT,
  generateSceneFromSpotify,
  getAdjacentSceneGenreFamilies,
  getSceneTrackGenreMatch,
  normalizeSceneGenreFamilies,
} from "../lib/scene-studio";

import * as SceneStudioModule from "../lib/scene-studio";

import type { SpotifyTrack } from "../lib/spotify-api";
import type { SpotifyLibrarySnapshot } from "../lib/spotify-library";
import type { GeneratedSceneResult } from "../lib/scene-studio";

const { act, create } = jest.requireActual("react-test-renderer");

jest.mock("@react-native-community/netinfo", () =>
  jest.requireActual("@react-native-community/netinfo/jest/netinfo-mock.js"),
);
jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) =>
    jest.requireActual("react").createElement("Ionicons", props),
}));

const mockReadPreview = jest.fn();
let mockAuthState = {
  user: { id: "owner-a" },
  accountEpoch: 1,
  sessionGeneration: "session-a1",
};

jest.mock("expo-router", () => {
  const ReactModule = jest.requireActual("react");
  return {
    router: { replace: jest.fn() },
    useFocusEffect: (callback: () => void) =>
      ReactModule.useEffect(callback, [callback]),
  };
});
jest.mock("../providers/auth-provider", () => ({
  useAuth: () => mockAuthState,
}));
jest.mock("../lib/scene-studio-provider-hooks", () => ({
  getSceneStudioProviderState: () => ({
    available: false,
    title: "Music-provider generation is unavailable",
    message: "New generation stays unavailable.",
  }),
}));
jest.mock("../lib/scene-studio-repository", () => ({
  createSceneStudioRepository: () => ({ readPreview: mockReadPreview }),
}));

function renderScenePreview(): React.ReactElement {
  return React.createElement(
    ConnectivityProvider,
    null,
    React.createElement(ScenePreviewScreen),
  );
}

function track(id: string): SpotifyTrack {
  return {
    id,
    name: id,
    uri: `spotify:track:${id}`,
    duration_ms: 180_000,
    explicit: false,
    popularity: 60,
    artists: [{ id: `artist-${id}`, name: `Artist ${id}`, uri: `spotify:artist:${id}` }],
    album: { id: `album-${id}`, name: `Album ${id}`, uri: `spotify:album:${id}`, images: [] },
  };
}

function snapshot(): SpotifyLibrarySnapshot {
  const tracks = [track("rock"), track("rnb"), track("hybrid"), track("missing")];
  return {
    syncedAt: "2026-08-08T00:00:00.000Z",
    profile: { id: "listener", display_name: "Listener" },
    topArtists: [],
    topTracks: tracks,
    recentTracks: [],
    savedTracks: [],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [],
    trackGenres: {
      rock: ["alternative rock"],
      rnb: ["neo soul", "r&b"],
      hybrid: ["rap rock", "trap"],
      missing: [],
    },
    warnings: [],
  };
}

const strictDraft = {
  ...DEFAULT_SCENE_STUDIO_DRAFT,
  preferredGenres: ["Rock", "R&B"],
  allowAdjacentGenres: false,
  durationMinutes: 30,
};

describe("Scene Studio strict genre correctness", () => {
  it("normalizes canonical families without collapsing hybrids", () => {
    expect(normalizeSceneGenreFamilies(["Alt Rock", "R & B", "hip-hop / trap"]))
      .toEqual(["rock", "r&b", "hip-hop"]);
  });

  it("keeps the adjacent family graph deterministic and bounded", () => {
    expect(getAdjacentSceneGenreFamilies(["Rock"])).toEqual([
      "indie",
      "pop",
      "hip-hop",
      "electronic",
      "country",
    ]);
    expect(getAdjacentSceneGenreFamilies(["Rock", "Indie"]))
      .not.toContain("rock");
  });

  it("treats indie and alternative rock variants as canonical Rock", () => {
    expect(getSceneTrackGenreMatch(["INDIE-ROCK"], strictDraft)).toMatchObject({
      confidence: "high",
      detectedFamilies: ["rock"],
      matchedFamilies: ["rock"],
    });
    expect(normalizeSceneGenreFamilies([" Alternative_Rock "])).toEqual(["rock"]);
  });

  it("strictly excludes unselected hybrid families and missing metadata", () => {
    const result = generateSceneFromSpotify(strictDraft, snapshot(), { variationSeed: "strict" });
    expect(result.trackSignals.map((signal) => signal.track.id).sort()).toEqual(["rnb", "rock"]);
    expect(result.trackSignals.every((signal) => signal.genreMatch?.confidence === "high")).toBe(true);
    expect(result.selectionStatus).toMatchObject({
      underfilled: true,
      action: "broaden-genres-or-shorten-duration",
    });
    expect(result.selectionStatus?.message).toContain("Allow adjacent sounds");
  });

  it("marks an explicitly enabled adjacent hybrid as low confidence", () => {
    const result = generateSceneFromSpotify(
      { ...strictDraft, allowAdjacentGenres: true },
      snapshot(),
      { variationSeed: "adjacent" },
    );
    const hybrid = result.trackSignals.find((signal) => signal.track.id === "hybrid");
    expect(hybrid?.genreMatch).toMatchObject({
      confidence: "low",
      detectedFamilies: ["hip-hop", "rock"],
      matchedFamilies: ["rock"],
    });
    expect(hybrid?.genreMatch?.whyMatched).toContain("adjacent genre metadata was allowed");
  });

  it("fills only the remaining duration from adjacent families when enabled", () => {
    const adjacentSnapshot = snapshot();
    adjacentSnapshot.trackGenres = {
      rock: ["alternative rock"],
      rnb: ["neo soul"],
      hybrid: ["indie pop"],
      missing: ["country"],
    };
    const result = generateSceneFromSpotify(
      {
        ...strictDraft,
        preferredGenres: ["Rock"],
        allowAdjacentGenres: true,
        durationMinutes: 9,
      },
      adjacentSnapshot,
      { variationSeed: "strict-then-adjacent" },
    );

    expect(result.trackSignals).toHaveLength(3);
    expect(result.trackSignals.find((signal) => signal.track.id === "rock")?.genreMatch?.confidence)
      .toBe("high");
    expect(result.trackSignals.filter((signal) => signal.genreMatch?.confidence === "low"))
      .toHaveLength(2);
    expect(result.selectionStatus).toMatchObject({ underfilled: false });
    expect(result.selectionStatus?.message).toContain("adjacent");
    expect(result.rationale.join(" ")).toContain("adjacent genre and mood signals");
  });

  it("accepts a rap-rock hybrid when Hip hop is explicitly selected", () => {
    const result = generateSceneFromSpotify(
      { ...strictDraft, preferredGenres: ["Rock", "R&B", "Hip hop"] },
      snapshot(),
      { variationSeed: "selected-hybrid" },
    );
    expect(result.trackSignals.find((signal) => signal.track.id === "hybrid")?.genreMatch)
      .toMatchObject({ confidence: "high", matchedFamilies: ["hip-hop", "rock"] });
  });

  it("does not let mood or activity scoring override a strict genre miss", () => {
    const result = generateSceneFromSpotify(
      { ...strictDraft, preferredGenres: ["Ambient"], activity: "focus", moods: ["calm"] },
      snapshot(),
      { variationSeed: "no-strict-candidates" },
    );
    expect(result.trackSignals).toEqual([]);
    expect(result.selectionStatus).toMatchObject({
      underfilled: true,
      selectedDurationMinutes: 0,
      action: "broaden-genres-or-shorten-duration",
    });
  });

  it("leaves no-genre generation unchanged, including missing metadata", () => {
    const result = generateSceneFromSpotify(
      { ...DEFAULT_SCENE_STUDIO_DRAFT, durationMinutes: 30 },
      snapshot(),
      { variationSeed: "unscoped" },
    );
    expect(result.trackSignals.map((signal) => signal.track.id).sort())
      .toEqual(["hybrid", "missing", "rnb", "rock"]);
    expect(result.trackSignals.every((signal) => signal.genreMatch?.confidence === "unscoped"))
      .toBe(true);
  });

  it("immediately excludes a rejected track from regeneration", () => {
    const result = generateSceneFromSpotify(strictDraft, snapshot(), {
      variationSeed: "rejected",
      rejectedTrackIds: ["rock"],
    });
    expect(result.trackSignals.map((signal) => signal.track.id)).toEqual(["rnb"]);
  });

  it("explains missing and strict mismatches using only supplied genre metadata", () => {
    expect(getSceneTrackGenreMatch([], strictDraft)).toMatchObject({
      confidence: "low",
      whyMatched: "Excluded because genre metadata is missing.",
    });
    expect(getSceneTrackGenreMatch(["rap rock"], strictDraft).whyMatched)
      .toContain("Excluded by strict genre selection");
    expect(normalizeSceneGenreFamilies(["soundtrack", "rapid", "trapeze"]))
      .toEqual(["classical"]);
  });

  it("keeps strict ordering, duration, and estimated energy deterministic", () => {
    const first = generateSceneFromSpotify(strictDraft, snapshot(), { variationSeed: "stable" });
    const second = generateSceneFromSpotify(strictDraft, snapshot(), { variationSeed: "stable" });
    expect(second.trackSignals.map((signal) => ({
      id: signal.track.id,
      intensity: signal.intensity,
    }))).toEqual(first.trackSignals.map((signal) => ({
      id: signal.track.id,
      intensity: signal.intensity,
    })));
    expect(second.estimatedDurationMinutes).toBe(first.estimatedDurationMinutes);
  });

  it("renders scoped match evidence, fences A on account switch, and preserves return", async () => {
    const preview = {
      id: "preview-a",
      draft: strictDraft,
      scene: {
        id: "scene-a",
        name: "Strict Rock Scene",
      },
      trackSignals: [{
        track: track("hybrid"),
        sources: ["saved"],
        score: 10,
        intensity: 60,
        genres: ["rap rock"],
        genreMatch: {
          confidence: "low",
          detectedFamilies: ["hip-hop", "rock"],
          matchedFamilies: ["rock"],
          whyMatched: "Matched rock; adjacent genre metadata was allowed.",
        },
      }],
      rationale: [],
      sourceBreakdown: { top: 0, saved: 1, recent: 0, playlist: 0, discovery: 0 },
      estimatedDurationMinutes: 3,
      selectionStatus: {
        underfilled: true,
        requestedDurationMinutes: 30,
        selectedDurationMinutes: 3,
        action: "broaden-genres-or-shorten-duration",
        message: "Only 3 of 30 minutes matched strictly. Turn on adjacent genres.",
      },
      createdAt: "2026-08-08T00:00:00.000Z",
    } as unknown as GeneratedSceneResult;
    mockReadPreview.mockImplementation(async ({ scope }) =>
      scope.userId === "owner-a"
        ? { kind: "ready", value: preview, revision: 1 }
        : { kind: "missing" },
    );
    const generationSpy = jest.spyOn(SceneStudioModule, "generateSceneFromSpotify");
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(renderScenePreview());
      await Promise.resolve();
    });

    const renderedA = JSON.stringify(renderer!.toJSON());
    expect(renderedA).toContain("Strict Rock Scene");
    expect(renderedA).toContain("Low confidence");
    expect(renderedA).toContain("Matched rock; adjacent genre metadata was allowed.");
    expect(renderedA).toContain("Only 3 of 30 minutes matched strictly.");
    expect(generationSpy).not.toHaveBeenCalled();

    const back = renderer!.root.findByProps({ accessibilityLabel: "Return to Scene Studio" });
    await act(async () => back.props.onPress());
    expect(jest.requireMock("expo-router").router.replace)
      .toHaveBeenCalledWith({
        pathname: "/scene-studio",
        params: { mode: "edit" },
      });

    mockAuthState = {
      user: { id: "owner-b" },
      accountEpoch: 2,
      sessionGeneration: "session-b1",
    };
    await act(async () => {
      renderer!.update(renderScenePreview());
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("Strict Rock Scene");
    expect(generationSpy).not.toHaveBeenCalled();
    generationSpy.mockRestore();
  });
});
