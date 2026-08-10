import AsyncStorage from "@react-native-async-storage/async-storage";

const mockStorage = new Map<string, string>();
let mockConfigured = true;
let mockUserId = "account-a";
const mockUpsert = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
    clear: jest.fn(async () => mockStorage.clear()),
  },
}));

jest.mock("../lib/supabase", () => ({
  get isSupabaseConfigured() { return mockConfigured; },
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: mockUserId ? { id: mockUserId } : null },
        error: null,
      })),
    },
    from: jest.fn(() => ({ upsert: mockUpsert })),
  },
}));

import {
  enqueueStoredSceneRecommendationFeedback,
  flushPendingSceneRecommendationFeedback,
  readSceneRecommendationLearning,
  recordSceneRecommendationFeedback,
  recordStoredSceneRecommendationFeedback,
  sceneRecommendationDraftFromStoredScene,
  sceneRecommendationIntentKey,
} from "../lib/scene-recommendation-feedback";
import { DEFAULT_SCENE_STUDIO_DRAFT } from "../lib/scene-studio";
import type { SceneStudioDraft } from "../lib/scene-studio";
import type { StoredScene } from "../lib/scenes";

const scopeA = { userId: "account-a", accountEpoch: 1, sessionGeneration: "session-a" } as const;
const scopeB = { userId: "account-b", accountEpoch: 2, sessionGeneration: "session-b" } as const;

describe("Scene recommendation feedback local-first sync", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockConfigured = true;
    mockUserId = "account-a";
    mockUpsert.mockReset().mockResolvedValue({ error: null });
  });

  it("returns explicit early-guard outcomes without writing", async () => {
    await expect(recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "remove",
      trackId: " ",
    })).resolves.toMatchObject({ outcome: "skipped", reason: "invalid_track_id" });

    await expect(recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeB,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "remove",
      trackId: "track-1",
    })).resolves.toMatchObject({ outcome: "skipped", reason: "scope_changed_before_write" });
    expect(mockStorage.size).toBe(0);
  });

  it("normalizes semantically identical intent ordering and formatting", () => {
    const first: SceneStudioDraft = {
      ...DEFAULT_SCENE_STUDIO_DRAFT,
      moods: ["calm", "focused"],
      preferredGenres: ["Rock", "R&B"],
      notes: "  Warm   guitars  ",
    };
    const second: SceneStudioDraft = {
      ...first,
      moods: ["focused", "calm"],
      preferredGenres: [" r&b ", "rock"],
      notes: "warm guitars",
    };
    expect(sceneRecommendationIntentKey(first)).toBe(sceneRecommendationIntentKey(second));
  });

  it("preserves expanded activities when reconstructing stored Scene intent", () => {
    const scene = {
      id: "morning-scene",
      name: "First Light",
      activity: "morning",
      emotions: "warm",
      genres: "Soul",
      energy: "medium",
      familiarity: "balanced",
      tracks: [],
    } as unknown as StoredScene;
    expect(sceneRecommendationDraftFromStoredScene(scene).activity).toBe("morning");
  });

  it.each([
    ["familiarity", { familiarityLevel: 90 }],
    ["genre strictness", { allowAdjacentGenres: true }],
    ["direct request", { notes: "no guitar solos" }],
    ["recent tracks", { includeRecent: false }],
    ["duration", { durationMinutes: 70 }],
    ["transition preference", { smoothTransitions: false }],
    ["recent Scene avoidance", { avoidRecentSceneTracks: false }],
  ])("does not share learning across a different %s intent", async (_label, change) => {
    const source = { ...DEFAULT_SCENE_STUDIO_DRAFT, preferredGenres: ["Rock"] };
    const different = { ...source, ...change };
    await recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: source,
      action: "doesnt_match",
      trackId: "isolated-track",
    });
    await expect(readSceneRecommendationLearning(scopeA, () => scopeA, different))
      .resolves.toMatchObject({ rejectedTrackIds: [] });
  });

  it("stores locally and keeps an account-scoped retry when cloud is unavailable", async () => {
    mockConfigured = false;
    const result = await recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "doesnt_match",
      trackId: "track-2",
      reasons: ["wrong_mood", "wrong_mood", "not-a-reason"],
    });
    expect(result).toMatchObject({ outcome: "local_stored", reason: "cloud_not_configured" });
    const accountAValues = [...mockStorage.entries()].filter(([key]) => key.includes("account-a"));
    expect(accountAValues).toHaveLength(2);
    expect(accountAValues.every(([, value]) => value.includes("track-2"))).toBe(true);
  });

  it("keeps failed cloud writes pending and flushes them later", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "offline" } });
    const first = await recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "swap",
      trackId: "track-3",
    });
    expect(first).toMatchObject({ outcome: "local_stored", reason: "cloud_sync_failed" });

    mockUpsert.mockResolvedValueOnce({ error: null });
    await expect(flushPendingSceneRecommendationFeedback(scopeA, () => scopeA))
      .resolves.toMatchObject({ outcome: "cloud_synced", syncedCount: 1 });
    const pending = [...mockStorage.entries()].find(([key]) => key.includes("pending"));
    expect(pending?.[1]).toBe("[]");
  });

  it("normalizes context and sends one cloud batch for a stored Scene", async () => {
    const scene = {
      id: "scene-1",
      name: "Test Scene",
      activity: "focus",
      emotions: "calm",
      genres: "Rock",
      energy: "medium",
      familiarity: "balanced",
      tracks: ["one", "two", "three"].map((id) => ({ id })),
    } as unknown as StoredScene;
    const results = await recordStoredSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      scene,
      action: "doesnt_match",
      reasons: ["wrong_genre", "wrong_artist"],
      artistIds: ["artist-a", "artist-a", " artist-b "],
      genres: [" Rock ", "ROCK", "Indie"],
      explicit: true,
    });
    expect(results).toHaveLength(3);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const rows = mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      reasons: ["wrong_artist", "wrong_genre"],
      track_artist_ids: ["artist-a", "artist-b"],
      track_genres: ["rock", "indie"],
      track_explicit: true,
    });
  });

  it("bounds negative context to the database contract", async () => {
    const artistIds = Array.from({ length: 25 }, (_, index) => `artist-${index}-${"a".repeat(140)}`);
    const genres = Array.from({ length: 15 }, (_, index) => ` Genre-${index}-${"g".repeat(90)} `);
    await recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "remove",
      trackId: "bounded-track",
      artistIds,
      genres,
      explicit: true,
    });
    const row = (mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>[])[0];
    const storedArtistIds = row.track_artist_ids as string[];
    const storedGenres = row.track_genres as string[];
    expect(storedArtistIds).toHaveLength(20);
    expect(storedArtistIds.every((value) => value.length <= 128)).toBe(true);
    expect(storedGenres).toHaveLength(12);
    expect(storedGenres.every((value) => value.length <= 80 && value === value.toLowerCase())).toBe(true);
  });

  it("drops reasons and negative context for positive actions", async () => {
    await recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "favorite",
      trackId: "favorite-track",
      reasons: ["wrong_genre"],
      artistIds: ["artist-a"],
      genres: ["rock"],
      explicit: true,
    });
    expect((mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>[])[0]).toMatchObject({
      reasons: [],
      track_artist_ids: [],
      track_genres: [],
      track_explicit: null,
    });
  });

  it("returns reason bias from the latest local event while offline", async () => {
    mockConfigured = false;
    for (const trackId of ["bias-track", "bias-track-2"]) {
      await recordSceneRecommendationFeedback({
        scope: scopeA,
        currentScope: () => scopeA,
        draft: DEFAULT_SCENE_STUDIO_DRAFT,
        action: "doesnt_match",
        trackId,
        reasons: ["too_fast", "wrong_genre", "too_explicit"],
        genres: ["Hard Rock"],
        explicit: true,
      });
    }
    await expect(readSceneRecommendationLearning(
      scopeA,
      () => scopeA,
      DEFAULT_SCENE_STUDIO_DRAFT,
    )).resolves.toMatchObject({
      rejectedTrackIds: ["bias-track", "bias-track-2"],
      reasonBias: {
        avoidGenres: ["hard rock"],
        suppressExplicit: true,
      },
    });
  });

  it("never flushes account A pending feedback through account B", async () => {
    mockConfigured = false;
    await recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "remove",
      trackId: "track-a",
    });
    mockConfigured = true;
    mockUserId = "account-b";

    await expect(flushPendingSceneRecommendationFeedback(scopeA, () => scopeB))
      .resolves.toMatchObject({ outcome: "skipped", reason: "scope_changed_before_write" });
    await expect(flushPendingSceneRecommendationFeedback(scopeB, () => scopeB))
      .resolves.toMatchObject({ outcome: "skipped", reason: "no_pending_feedback" });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect([...mockStorage.values()].some((value) => value.includes("track-a"))).toBe(true);
  });

  it("reports local persistence failure instead of pretending feedback was stored", async () => {
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "remove",
      trackId: "track-4",
    })).resolves.toMatchObject({ outcome: "failure", reason: "local_persistence_failed" });
  });

  it("returns after local enqueue and coalesces a hung cloud flush", async () => {
    const scene = {
      id: "playback-scene",
      name: "Playback",
      activity: "focus",
      emotions: "calm",
      genres: "Rock",
      energy: "medium",
      familiarity: "balanced",
      tracks: [{ id: "track-one" }, { id: "track-two" }],
    } as unknown as StoredScene;
    mockUpsert.mockImplementation(() => new Promise(() => undefined));

    const first = enqueueStoredSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      scene,
      action: "skip",
      trackIds: ["track-one"],
      flushTiming: { requestTimeoutMs: 5, retryDelaysMs: [0] },
    });
    await expect(Promise.race([
      first,
      new Promise((_, reject) => setTimeout(() => reject(new Error("enqueue blocked on cloud")), 100)),
    ])).resolves.toEqual([expect.objectContaining({
      outcome: "local_stored",
      reason: "cloud_sync_scheduled",
    })]);

    await enqueueStoredSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      scene,
      action: "replay",
      trackIds: ["track-two"],
      flushTiming: { requestTimeoutMs: 5, retryDelaysMs: [0] },
    });
    await Promise.resolve();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const local = [...mockStorage.entries()].find(([key]) =>
      key.includes("scene-recommendation-feedback:v1") && !key.includes("pending"));
    expect(JSON.parse(local?.[1] ?? "[]")).toHaveLength(2);

    await new Promise((resolve) => setTimeout(resolve, 15));
    mockUpsert.mockResolvedValueOnce({ error: null });
    await enqueueStoredSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      scene,
      action: "skip",
      trackIds: ["track-one"],
      flushTiming: { requestTimeoutMs: 20, retryDelaysMs: [0] },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("aborts a hung flush promptly when the account scope changes", async () => {
    mockConfigured = false;
    await recordSceneRecommendationFeedback({
      scope: scopeA,
      currentScope: () => scopeA,
      draft: DEFAULT_SCENE_STUDIO_DRAFT,
      action: "skip",
      trackId: "scope-track",
    });
    mockConfigured = true;
    mockUpsert.mockImplementation(() => new Promise(() => undefined));
    let visibleScope = scopeA as typeof scopeA | typeof scopeB;
    const flush = flushPendingSceneRecommendationFeedback(
      scopeA,
      () => visibleScope,
      { requestTimeoutMs: 1_000, scopePollMs: 2 },
    );
    await Promise.resolve();
    visibleScope = scopeB;
    await expect(flush).resolves.toMatchObject({
      outcome: "local_stored",
      reason: "scope_changed_after_local_write",
    });
  });
});
