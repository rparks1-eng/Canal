/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AccessibilityInfo, StyleSheet } from "react-native";

const { act, create } = jest.requireActual("react-test-renderer");
const mockReplace: jest.Mock = jest.fn();
const mockPush: jest.Mock = jest.fn();
const mockBack: jest.Mock = jest.fn();
const mockAddFeedback: jest.Mock = jest.fn(async () => {});
const mockSaveFeedback: jest.Mock = jest.fn(async () => {});
const mockSaveCollaborative: jest.Mock = jest.fn();
const mockExport: jest.Mock = jest.fn(async () => ({ exportedTrackCount: 1, playlistUrl: "https://open.spotify.com/playlist/p" }));
const mockSavePublic: jest.Mock = jest.fn(async () => ({ ...scene, id: "saved-scene-a" }));
const mockShare: jest.Mock = jest.fn(async () => ({ action: "sharedAction" }));
const mockWritePlayer: jest.Mock = jest.fn(async () => {});
const mockRecommendationFeedback: jest.Mock = jest.fn(async () => [{ outcome: "cloud_synced" }]);
const mockSaveSoundscape: jest.Mock = jest.fn();
const mockNativeShare: jest.Mock = jest.fn(async () => ({ action: "sharedAction" }));
const mockWriteScenes: jest.Mock = jest.fn(async () => {});
const mockCanalAlert: jest.Mock = jest.fn();
let mockParams: Record<string, string> = { sceneId: "scene-a" };
let mockAuth: any = { user: { id: "owner-a" }, accountEpoch: 1, sessionGeneration: "session-1" };
let mockConnectivity = "online";
let mockRecoveryIssue: any = null;

const scene = {
  activity: "Focus", createdAt: "2026-01-01", emotions: "Calm", energy: "low",
  familiarity: "balanced", favorite: false, id: "scene-a", libraryType: "created",
  name: "Quiet Current", playCount: 0, source: "canal", tracks: [
    { id: "track-1", title: "First Light", artist: "Canal Artist", durationMs: 180000, provider: "spotify", providerTrackId: "track-1" },
    { id: "track-2", title: "Second Light", artist: "Canal Artist", durationMs: 180000, provider: "spotify", providerTrackId: "track-2" },
  ],
};

jest.mock("expo-router", () => {
  const ReactModule = require("react");
  return {
  router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args), back: () => mockBack(), canGoBack: jest.fn(() => true) },
  useFocusEffect: (callback: () => void) => ReactModule.useEffect(callback, [callback]),
  useLocalSearchParams: () => mockParams,
  usePathname: () => "/scenes/scene-a",
  };
});

jest.mock("expo-image", () => {
  const ReactModule = require("react");
  const Image = (props: any) => ReactModule.createElement("ExpoImage", props);
  Image.prefetch = jest.fn(async () => true);
  return { Image };
});

jest.mock("../providers/auth-provider", () => ({ useAuth: () => mockAuth }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: (props: any) => require("react").createElement("Ionicons", props) }));
jest.mock("react-native/Libraries/Share/Share", () => ({ __esModule: true, default: { share: (...args: unknown[]) => mockNativeShare(...args) } }));
jest.mock("../providers/connectivity-provider", () => ({ useConnectivity: () => ({ status: mockConnectivity, refresh: jest.fn(async () => mockConnectivity) }) }));
jest.mock("../components/CanalBottomNav", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/recovery-notice", () => ({ RecoveryNotice: (props: any) => require("react").createElement("RecoveryNotice", props) }));

jest.mock("../lib/canal-session", () => ({
  addFeedbackEntry: (value: unknown) => mockAddFeedback(value),
  recordListeningHistory: jest.fn(async () => {}),
}));

jest.mock("../lib/scenes", () => ({
  getSceneById: jest.fn(async () => scene),
  saveSceneFeedback: (sceneId: unknown, rating: unknown, note: unknown) =>
    mockSaveFeedback(sceneId, rating, note),
  sceneDurationMinutes: jest.fn(() => 6), sceneShareText: jest.fn(() => "share text"),
  publicSceneShareUrl: jest.fn(() => "https://canal.test/public/creator-a/scene-a"),
  toggleSceneFavorite: jest.fn(async () => ({ ...scene, favorite: true })),
  duplicateScene: jest.fn(async () => ({ ...scene, id: "copy" })), deleteScene: jest.fn(async () => {}),
  createScene: jest.fn(async () => scene), readScenes: jest.fn(async () => []), recordScenePlay: jest.fn(async () => {}),
}));

jest.mock("../lib/scene-collaboration", () => ({
  inviteSceneCollaborator: jest.fn(async () => {}), isSceneRevisionConflictError: jest.fn(() => false),
  listIncomingSceneCollaborations: jest.fn(async () => []), listSceneCollaborators: jest.fn(async () => []),
  loadCollaborativeScene: jest.fn(async () => ({ ownerId: "owner-a", sceneId: "scene-a", revision: 1, scene })),
  respondToSceneCollaboration: jest.fn(async () => {}), revokeSceneCollaborator: jest.fn(async () => {}),
  saveCollaborativeScene: (...args: unknown[]) => mockSaveCollaborative(...args),
}));
jest.mock("../lib/scene-sync", () => ({ assertSceneCacheOwner: jest.fn(async () => {}), capturePreparedSceneCacheOwner: jest.fn(async () => ({ userId: mockAuth.user.id })), syncScenesWithCloud: jest.fn(async () => null), writeScenesForSceneCacheOwner: (...args: unknown[]) => mockWriteScenes(...args) }));
jest.mock("../lib/analytics", () => ({ classifyAnalyticsFailure: jest.fn(() => "recoverable"), recordAnalyticsEvent: jest.fn(async () => {}), recordAnalyticsFailure: jest.fn(async () => {}) }));
jest.mock("../lib/recovery-issue", () => ({ classifyRecoveryIssue: jest.fn(() => mockRecoveryIssue) }));
jest.mock("../lib/playlist-exports", () => ({ captureScenePlaylistExportAccount: jest.fn(async () => ({ userId: mockAuth.user.id })), recordScenePlaylistExport: jest.fn(async () => "saved") }));
jest.mock("../lib/saved-scene-management", () => ({ removeSavedSceneCompletely: jest.fn(async () => {}) }));
jest.mock("../lib/scene-music-export", () => ({ exportSceneToMusicProvider: (...args: unknown[]) => mockExport(...args) }));
jest.mock("../lib/spotify-track-links", () => ({ canonicalSpotifyTrackUrl: jest.fn(() => "https://open.spotify.com/track/track-1") }));
jest.mock("../lib/spotify-scene-artwork", () => ({
  addSpotifyArtworkToStoredScene: jest.fn(async (value: typeof scene) => ({
    ...value,
    tracks: value.tracks.map((track) => ({
      ...track,
      imageUrl: `https://i.scdn.co/image/${track.id}`,
    })),
  })),
}));
jest.mock("../lib/social", () => ({
  loadPublicScene: jest.fn(async () => ({ creator: { displayName: "Creator", handle: "@creator", isCanal: false, isVerified: true }, isMine: false, isSaved: false, ownerId: "creator-a", sceneId: "scene-a", scene })),
  savePublicSceneToLibrary: (...args: unknown[]) => mockSavePublic(...args),
}));
jest.mock("../lib/canal-player", () => ({
  readPlayerSession: jest.fn(async () => null),
  createPlayerSession: jest.fn(() => ({ sceneId: "scene-a", accountKey: "owner-a:1:1", currentIndex: 0, elapsedSeconds: 0, isPlaying: false, startedAt: "2026-01-01" })),
  writePlayerSession: (...args: unknown[]) => mockWritePlayer(...args), clearPlayerSession: jest.fn(async () => {}),
  constrainPlayerSessionToScene: jest.fn((value: unknown) => value), advancePlayerSession: jest.fn((value: any) => value),
  movePlayerSession: jest.fn((value: any, _scene: unknown, delta: number) => ({ ...value, currentIndex: Math.max(0, Math.min(1, value.currentIndex + delta)), trackElapsedSeconds: 0 })),
}));
jest.mock("../lib/scene-recommendation-feedback", () => ({
  enqueueStoredSceneRecommendationFeedback: (...args: unknown[]) => mockRecommendationFeedback(...args),
  recordStoredSceneRecommendationFeedback: jest.fn(async () => []),
}));
jest.mock("../lib/canal-share", () => ({ shareSoundscape: (...args: unknown[]) => mockShare(...args) }));
jest.mock("../lib/canal-alert", () => ({
  CanalAlert: {
    alert: (...args: unknown[]) => mockCanalAlert(...args),
  },
}));
jest.mock("../lib/snapshots", () => ({ readSnapshots: jest.fn(async () => []), Snapshot: {} }));
jest.mock("../lib/soundscape", () => ({
  normalizeUsername: (value: string) => value.trim().toLowerCase(),
  readSoundscape: jest.fn(async () => ({ id: `sound-${mockAuth.user.id}`, userId: mockAuth.user.id, displayName: mockAuth.user.id === "owner-a" ? "Listener A" : "Listener B", username: "listener", bio: "Music notes", genres: ["Rock"], favoriteArtists: ["Artist"], visibility: "private", snapshotIds: [] })),
  saveSoundscape: (...args: unknown[]) => mockSaveSoundscape(...args),
}));
jest.mock("../lib/soundscape-collector", () => ({
  collectSoundscapeAggregationInput: jest.fn(async (accountId: string, period: unknown) => ({
    accountId,
    period,
    generatedAt: "2026-08-11T00:00:00.000Z",
    scenes: [],
    stages: [],
    discoveries: [],
    songDna: [],
    listening: [],
    feedback: [],
    snapshots: [],
  })),
}));
jest.mock("../lib/soundscape-cloud", () => ({
  loadCommonGroundProjection: jest.fn(async () => null),
  loadCommonGroundState: jest.fn(async () => null),
  loadSoundscapeArchive: jest.fn(async () => null),
  refreshSoundscapeArchive: jest.fn(async () => null),
  setCommonGroundApproval: jest.fn(async () => undefined),
  setSoundscapeShareVisibility: jest.fn(async () => undefined),
}));

import SceneFeedbackScreen from "../app/scene-feedback";
import SceneCollaborationScreen from "../app/scene-collaboration";
import SceneDetailScreen from "../app/scenes/[sceneId]";
import PublicSceneScreen from "../app/public-scene";
import NowPlayingScreen from "../app/now-playing";
import SoundscapeScreen from "../app/soundscape";

async function render(element: React.ReactElement) {
  let renderer: any;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}

function effectiveStyle(node: any): Record<string, any> {
  return (
    StyleSheet.flatten(
      typeof node.props.style === "function"
        ? node.props.style({ pressed: false })
        : node.props.style,
    ) ?? {}
  );
}

describe("Living Editorial Scene playback interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { sceneId: "scene-a" };
    mockAuth = { user: { id: "owner-a" }, accountEpoch: 1, sessionGeneration: "session-1" };
    mockConnectivity = "online";
    mockRecoveryIssue = null;
    mockExport.mockResolvedValue({ exportedTrackCount: 1, playlistUrl: "https://open.spotify.com/playlist/p" });
    mockSaveCollaborative.mockImplementation(async (_owner: string, _sceneId: string, revision: number, next: unknown) => ({ ownerId: "owner-a", sceneId: "scene-a", revision: revision + 1, scene: next }));
    mockSaveSoundscape.mockImplementation(async (value: unknown) => value);
  });

  it("renders feedback as an accessible editorial form and coalesces rapid submission", async () => {
    let release!: () => void;
    mockAddFeedback.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const renderer = await render(React.createElement(SceneFeedbackScreen));
    const perfect = renderer.root.findAll(
      (node: any) =>
        node.props.accessibilityRole === "radio" &&
        node.props.accessibilityState?.checked === false,
    )[0];
    expect(
      Math.max(
        effectiveStyle(perfect).minHeight ?? 0,
        effectiveStyle(perfect).height ?? 0,
      ),
    ).toBeGreaterThanOrEqual(48);
    await act(async () => perfect.props.onPress());

    const submit = renderer.root.findByProps({
      accessibilityLabel: "Save feedback and continue",
    });
    expect(submit.props.accessibilityState.disabled).toBe(false);
    let first!: Promise<void>;
    await act(async () => {
      first = submit.props.onPress();
      void submit.props.onPress();
      await Promise.resolve();
    });
    expect(mockAddFeedback).toHaveBeenCalledTimes(1);
    expect(mockSaveFeedback).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await first;
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/scene-snapshot",
      params: { sceneId: "scene-a" },
    });
    expect(
      renderer.root.findAll(
        (node: any) => node.props.allowFontScaling === false,
      ),
    ).toHaveLength(0);
  });

  it("keeps the exact skip route and an accessible multiline note", async () => {
    const renderer = await render(React.createElement(SceneFeedbackScreen));
    const note = renderer.root.findByProps({
      accessibilityLabel: "Optional Scene feedback note",
    });
    expect(note.props.multiline).toBe(true);
    const skip = renderer.root.findByProps({
      accessibilityLabel: "Skip feedback",
    });
    expect(
      Math.max(
        effectiveStyle(skip).minHeight ?? 0,
        effectiveStyle(skip).height ?? 0,
      ),
    ).toBeGreaterThanOrEqual(48);
    await act(async () => skip.props.onPress());
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("renders collaboration, saves once, and fences a remounted account", async () => {
    mockParams = { ownerId: "owner-a", sceneId: "scene-a" };
    let release!: () => void;
    mockSaveCollaborative.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const renderer = await render(React.createElement(SceneCollaborationScreen));
    const cacheWritesBeforeSave = mockWriteScenes.mock.calls.length;
    const save = renderer.root.findByProps({ accessibilityLabel: "Save revision" });
    expect(Math.max(effectiveStyle(save).minHeight ?? 0, effectiveStyle(save).height ?? 0)).toBeGreaterThanOrEqual(48);
    let first!: Promise<void>;
    await act(async () => { first = save.props.onPress(); void save.props.onPress(); await Promise.resolve(); });
    expect(mockSaveCollaborative).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
    mockAuth = { user: { id: "owner-b" }, accountEpoch: 2, sessionGeneration: 2 };
    mockParams = { ownerId: "owner-a", sceneId: "scene-a" };
    const b = await render(React.createElement(SceneCollaborationScreen));
    await act(async () => { release(); await first; });
    expect(b.root.findAllByProps({ accessibilityLabel: "Save revision" })).toHaveLength(0);
    expect(b.root.findAll((node: any) => typeof node.props.children === "string" && node.props.children.includes("Saved revision"))).toHaveLength(0);
    expect(mockWriteScenes).toHaveBeenCalledTimes(cacheWritesBeforeSave);
  });

  it("quarantines a deferred same-user A1 save after A2 session generation mounts", async () => {
    mockParams = { ownerId: "owner-a", sceneId: "scene-a" };
    let release!: (value: unknown) => void;
    mockSaveCollaborative.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const renderer = await render(React.createElement(SceneCollaborationScreen));
    const cacheWritesBeforeSave = mockWriteScenes.mock.calls.length;
    const save = renderer.root.findByProps({ accessibilityLabel: "Save revision" });
    let pending!: Promise<void>;
    await act(async () => { pending = save.props.onPress(); await Promise.resolve(); });
    mockAuth = { user: { id: "owner-a" }, accountEpoch: 2, sessionGeneration: 2 };
    await act(async () => renderer.update(React.createElement(SceneCollaborationScreen)));
    await act(async () => {
      release({ ownerId: "owner-a", sceneId: "scene-a", revision: 2, scene: { ...scene, name: "A1 stale revision" } });
      await pending;
    });
    expect(renderer.root.findAll((node: any) => node.props.children === "A1 stale revision")).toHaveLength(0);
    expect(renderer.root.findAll((node: any) => typeof node.props.children === "string" && node.props.children.includes("Saved revision 2"))).toHaveLength(0);
    expect(mockWriteScenes).toHaveBeenCalledTimes(cacheWritesBeforeSave);
  });

  it("renders Scene detail and preserves start, export, and back handlers", async () => {
    const renderer = await render(React.createElement(SceneDetailScreen));
    const favorite = renderer.root.findByProps({ accessibilityLabel: "Add Scene to favorites" });
    const toggleFavorite = (jest.requireMock("../lib/scenes") as any).toggleSceneFavorite;
    const favoriteCalls = toggleFavorite.mock.calls.length;
    await act(async () => {
      favorite.props.onPress();
      favorite.props.onPress();
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(toggleFavorite).toHaveBeenCalledTimes(favoriteCalls + 1);
    expect(renderer.root.findByProps({ accessibilityLabel: "Remove Scene from favorites" }).props.accessibilityState).toMatchObject({ selected: true });
    const start = renderer.root.findAll((node: any) => node.props.accessibilityRole === "button" && node.findAll?.((child: any) => child.props.children === "Start Scene").length)[0];
    await act(async () => start.props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/now-playing", params: { sceneId: "scene-a" } });
    const exportButton = renderer.root.findByProps({ accessibilityLabel: "Export Scene playlist" });
    await act(async () => {
      exportButton.props.onPress();
      const actions = mockCanalAlert.mock.calls.at(-1)?.[2];
      actions[0].onPress();
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockExport.mock.calls[0]?.[1]).toMatchObject({ providerId: "spotify" });
    const back = renderer.root.findAll((node: any) => node.props.accessibilityRole === "button")[0];
    await act(async () => back.props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders Scene detail export recovery and retries the exact provider action", async () => {
    mockRecoveryIssue = { action: "retry", message: "Try again", title: "Export interrupted" };
    mockExport.mockRejectedValueOnce(new Error("offline"));
    const renderer = await render(React.createElement(SceneDetailScreen));
    const exportButton = renderer.root.findByProps({ accessibilityLabel: "Export Scene playlist" });
    await act(async () => {
      exportButton.props.onPress();
      const actions = mockCanalAlert.mock.calls.at(-1)?.[2];
      actions[1].onPress();
      await new Promise((resolve) => setImmediate(resolve));
    });
    const recovery = renderer.root.findByType("RecoveryNotice");
    await act(async () => { recovery.props.onAction(); await new Promise((resolve) => setImmediate(resolve)); });
    expect(mockExport).toHaveBeenCalledTimes(2);
    expect(mockExport.mock.calls[0]?.[1]).toMatchObject({ providerId: "apple-music" });
    expect(mockExport.mock.calls[1]?.[1]).toMatchObject({ providerId: "apple-music" });
  });

  it("renders public Scene save/share/provider and offline disabled state", async () => {
    mockParams = { ownerId: "creator-a", sceneId: "scene-a" };
    const renderer = await render(React.createElement(PublicSceneScreen));
    expect((jest.requireMock("../lib/spotify-scene-artwork") as { addSpotifyArtworkToStoredScene: jest.Mock }).addSpotifyArtworkToStoredScene).toHaveBeenCalledWith(scene);
    const save = renderer.root.findByProps({ accessibilityLabel: "Save Private Copy" });
    await act(async () => { save.props.onPress(); await new Promise((resolve) => setImmediate(resolve)); });
    expect(mockSavePublic).toHaveBeenCalledTimes(1);
    const share = renderer.root.findByProps({ accessibilityLabel: "Share Quiet Current" });
    await act(async () => { share.props.onPress(); await new Promise((resolve) => setImmediate(resolve)); });
    expect(share.props.accessibilityHint).toContain("sharing options");
    expect(mockNativeShare).toHaveBeenCalledWith({ title: "Quiet Current", message: "share text", url: expect.any(String) });
    const provider = renderer.root.findByProps({ accessibilityLabel: "Export Public Scene playlist" });
    await act(async () => {
      provider.props.onPress();
      const actions = mockCanalAlert.mock.calls.at(-1)?.[2];
      actions[1].onPress();
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(mockExport).toHaveBeenCalled();
    expect(mockExport.mock.calls.at(-1)?.[1]).toMatchObject({ providerId: "apple-music" });
    const play = renderer.root.findByProps({ accessibilityLabel: "Play Quiet Current" });
    await act(async () => { play.props.onPress(); await new Promise((resolve) => setImmediate(resolve)); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/now-playing", params: { sceneId: "saved-scene-a" } });
    const back = renderer.root.findByProps({ accessibilityLabel: "Back from Public Scene" });
    await act(async () => back.props.onPress());
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/(tabs)/explore");
    mockConnectivity = "offline";
    const offline = await render(React.createElement(PublicSceneScreen));
    expect(offline.root.findAll((node: any) => node.props.accessibilityState?.disabled === true).length).toBeGreaterThan(0);
  });

  it("renders Signal Film player controls and invokes play, next, previous, retry, and back", async () => {
    for (const label of ["Previous track", "Next track", "Back from Now Playing"]) {
      const renderer = await render(React.createElement(NowPlayingScreen));
      const control = renderer.root.findByProps({ accessibilityLabel: label });
      expect(Math.max(effectiveStyle(control).minHeight ?? 0, effectiveStyle(control).height ?? 0)).toBeGreaterThanOrEqual(48);
      await act(async () => control.props.onPress());
      await act(async () => renderer.unmount());
    }
    const renderer = await render(React.createElement(NowPlayingScreen));
    const play = renderer.root.findAll((node: any) => node.props.accessibilityLabel === "Play Scene" || node.props.accessibilityLabel === "Pause Scene")[0];
    await act(async () => play.props.onPress());
    expect(mockWritePlayer).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("records one explicit skip before Next and keeps playback working if feedback fails", async () => {
    const renderer = await render(React.createElement(NowPlayingScreen));
    const next = renderer.root.findByProps({ accessibilityLabel: "Next track" });
    await act(async () => {
      void next.props.onPress();
      void next.props.onPress();
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(mockRecommendationFeedback).toHaveBeenCalledTimes(1);
    expect(mockRecommendationFeedback).toHaveBeenCalledWith(expect.objectContaining({
      action: "skip",
      scene: expect.objectContaining({ id: "scene-a" }),
      trackIds: ["track-1"],
    }));
    expect(mockWritePlayer).toHaveBeenCalledWith(expect.objectContaining({ currentIndex: 1 }));

    await act(async () => renderer.unmount());
    jest.clearAllMocks();
    mockRecommendationFeedback.mockRejectedValueOnce(new Error("feedback unavailable"));
    const failureRenderer = await render(React.createElement(NowPlayingScreen));
    await act(async () => {
      await failureRenderer.root.findByProps({ accessibilityLabel: "Next track" }).props.onPress();
    });
    expect(mockWritePlayer).toHaveBeenCalledWith(expect.objectContaining({ currentIndex: 1 }));
    await act(async () => failureRenderer.unmount());
  });

  it("restarts after three seconds and records replay without moving to the prior track", async () => {
    const player = jest.requireMock("../lib/canal-player") as any;
    player.createPlayerSession.mockReturnValueOnce({
      sceneId: "scene-a",
      accountKey: "owner-a:1:session-1",
      currentIndex: 1,
      elapsedSeconds: 12,
      trackElapsedSeconds: 4,
      isPlaying: false,
      startedAt: "2026-01-01",
    });
    const renderer = await render(React.createElement(NowPlayingScreen));
    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: "Previous track" }).props.onPress();
    });
    expect(mockRecommendationFeedback).toHaveBeenCalledWith(expect.objectContaining({
      action: "replay",
      trackIds: ["track-2"],
    }));
    expect(mockWritePlayer).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 1,
      trackElapsedSeconds: 0,
    }));
    await act(async () => renderer.unmount());
  });

  it("fences a pending Next across an A to B account transition", async () => {
    let release!: () => void;
    mockRecommendationFeedback.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve([{ outcome: "cloud_synced" }]); }),
    );
    const renderer = await render(React.createElement(NowPlayingScreen));
    let pending!: Promise<void>;
    await act(async () => {
      pending = renderer.root.findByProps({ accessibilityLabel: "Next track" }).props.onPress();
      await Promise.resolve();
    });
    mockWritePlayer.mockClear();
    mockAuth = { user: { id: "owner-b" }, accountEpoch: 2, sessionGeneration: "session-2" };
    await act(async () => renderer.update(React.createElement(NowPlayingScreen)));
    mockWritePlayer.mockClear();
    await act(async () => {
      release();
      await pending;
    });
    expect(mockWritePlayer).not.toHaveBeenCalledWith(expect.objectContaining({ currentIndex: 1 }));
    await act(async () => renderer.unmount());
  });

  it("hydrates missing artwork for the current track and Up Next without blocking playback", async () => {
    const renderer = await render(React.createElement(NowPlayingScreen));

    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(
      renderer.root.findByProps({
        accessibilityLabel: "First Light album artwork",
      }).props.source,
    ).toEqual({
      uri: "https://i.scdn.co/image/track-1",
    });

    expect(
      renderer.root.findByProps({
        accessibilityLabel: "Second Light album artwork",
      }).props.source,
    ).toEqual({
      uri: "https://i.scdn.co/image/track-2",
    });

    await act(async () => renderer.unmount());
  });

  it("keeps Signal Film controls semantic under Reduce Motion and retries a storage failure", async () => {
    const reduceMotion = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const renderer = await render(React.createElement(NowPlayingScreen));
    mockWritePlayer.mockRejectedValueOnce(new Error("storage unavailable"));
    const play = renderer.root.findAll((node: any) => node.props.accessibilityLabel === "Play Scene" || node.props.accessibilityLabel === "Pause Scene")[0];
    await act(async () => { play.props.onPress(); await new Promise((resolve) => setImmediate(resolve)); });
    const retry = renderer.root.findByProps({ accessibilityLabel: "Retry saving playback progress" });
    expect(Math.max(effectiveStyle(retry).minHeight ?? 0, effectiveStyle(retry).height ?? 0)).toBeGreaterThanOrEqual(48);
    await act(async () => retry.props.onPress());
    expect(mockWritePlayer).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAll((node: any) => node.props.accessibilityLabel === "Play Scene" || node.props.accessibilityLabel === "Pause Scene").length).toBeGreaterThan(0);
    reduceMotion.mockRestore();
    await act(async () => renderer.unmount());
  });

  it("renders the current Soundscape archive and preserves exact back behavior", async () => {
    const reduceMotion = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);
    const renderer = await render(React.createElement(SoundscapeScreen));
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    const back = renderer.root.findByProps({ accessibilityLabel: "Back" });
    (jest.requireMock("expo-router") as any).router.canGoBack.mockReturnValueOnce(false);
    await act(async () => back.props.onPress());
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/profile");
    expect(renderer.root.findByProps({ accessibilityLabel: "Refresh Soundscape" })).toBeTruthy();
    expect(renderer.root.findAll((node: any) => node.props.accessibilityRole === "tab").length).toBeGreaterThanOrEqual(10);
    expect(renderer.root.findAll((node: any) => node.props.allowFontScaling === false)).toHaveLength(0);
    await act(async () => renderer.unmount());
    reduceMotion.mockRestore();
  });

  it("remounts Soundscape for account B without retaining A's visible identity", async () => {
    const reduceMotion = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);
    const a = await render(React.createElement(SoundscapeScreen));
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    await act(async () => a.unmount());
    mockAuth = { user: { id: "owner-b" }, accountEpoch: 2, sessionGeneration: 2 };
    const b = await render(React.createElement(SoundscapeScreen));
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect((jest.requireMock("../lib/soundscape") as any).readSoundscape).toHaveBeenCalledTimes(2);
    expect(
      (jest.requireMock("../lib/soundscape-collector") as any)
        .collectSoundscapeAggregationInput,
    ).toHaveBeenNthCalledWith(1, "owner-a", expect.any(Object));
    expect(
      (jest.requireMock("../lib/soundscape-collector") as any)
        .collectSoundscapeAggregationInput,
    ).toHaveBeenNthCalledWith(2, "owner-b", expect.any(Object));
    expect(JSON.stringify(b.toJSON())).not.toContain("Listener A");
    await act(async () => b.unmount());
    reduceMotion.mockRestore();
  });

  it("keeps route-owned handlers while applying editorial and playback modes", () => {
    const source = (path: string) =>
      readFileSync(join(process.cwd(), path), "utf8");
    const collaboration = source("app/scene-collaboration.tsx");
    const detail = source("app/scenes/[sceneId].tsx");
    const publicScene = source("app/public-scene.tsx");
    const player = source("app/now-playing.tsx");
    const soundscape = source("app/soundscape.tsx");

    expect(collaboration).toContain("saveCollaborativeScene");
    expect(collaboration).toContain("accessibilityLabel={props.label}");
    expect(detail).toContain("createPlayerSession");
    expect(detail).toContain("exportSceneToMusicProvider");
    expect(publicScene).toContain("savePublicSceneToLibrary");
    expect(publicScene).toContain("publicSceneShareUrl");
    expect(player).toContain('accessibilityLabel="Previous track"');
    expect(player).toContain('accessibilityLabel="Next track"');
    expect(player).toContain("<SceneDnaPanel accent={presentation.accent} scene={scene} />");
    expect(player).toContain("setOverride(sceneAtmosphere(scene))");
    expect(player).toContain("const presentation = scenePresentation(scene)");
    expect(player).toContain('backgroundColor: `${presentation.colors[2]}24`');
    expect(soundscape).toContain("collectSoundscapeAggregationInput");
    expect(soundscape).toContain("loadSoundscapeArchive");
    expect(soundscape).toContain("setSoundscapeShareVisibility");
    expect(soundscape).toContain("shareSoundscapeProjection");
    for (const content of [
      collaboration,
      detail,
      publicScene,
      player,
      soundscape,
    ]) {
      expect(content).not.toContain("allowFontScaling={false}");
    }
  });
});
