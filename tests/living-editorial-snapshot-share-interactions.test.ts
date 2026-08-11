import React from "react";

import {
  AccessibilityInfo,
  Alert,
  Linking,
  Share,
  StyleSheet,
} from "react-native";

const {
  act,
  create,
} = jest.requireActual("react-test-renderer");

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn(),
};
const mockCreateSnapshotWithStatus = jest.fn();
const mockReadSnapshotsWithStatus = jest.fn();
let mockParams: Record<string, string> = { sceneId: "scene-1" };
let mockAuthIdentity = {
  accountEpoch: 3,
  sessionGeneration: "session-3",
  user: { id: "owner-a" },
};
const mockDeleteCollection = jest.fn(async () => {});

jest.mock("expo-router", () => ({
  router: {
    back: (...args: unknown[]) => mockRouter.back(...args),
    canGoBack: () => mockRouter.canGoBack(),
    push: (...args: unknown[]) => mockRouter.push(...args),
    replace: (...args: unknown[]) => mockRouter.replace(...args),
  },
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) => require("react").createElement("Ionicons", props),
}));

jest.mock("../providers/auth-provider", () => ({
  useAuth: () => mockAuthIdentity,
}));

jest.mock("../providers/connectivity-provider", () => ({
  useConnectivity: () => ({
    refresh: jest.fn(async () => "online"),
    status: "online",
  }),
}));

jest.mock("../components/recovery-notice", () => ({
  RecoveryNotice: () => null,
}));

jest.mock("../lib/analytics", () => ({
  classifyAnalyticsFailure: jest.fn(() => "recoverable"),
  recordAnalyticsEvent: jest.fn(async () => {}),
  recordAnalyticsFailure: jest.fn(async () => {}),
}));

jest.mock("../lib/canal-session", () => ({
  publishSnapshot: jest.fn(async () => {}),
}));

jest.mock("../lib/recovery-issue", () => ({
  classifyRecoveryIssue: jest.fn(() => null),
}));

jest.mock("../lib/snapshots", () => ({
  createSnapshotWithStatus: (input: unknown) => mockCreateSnapshotWithStatus(input),
  deleteSnapshotWithStatus: jest.fn(async () => ({ warning: null })),
  readSnapshotWithStatus: jest.fn(async () => ({
    value: {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "snapshot-1",
      isMine: true,
      mood: "Bright",
      note: "A city memory",
      pendingCloudSync: false,
      sceneName: "City Signals",
      spotifyUrl: "https://open.spotify.com/track/track-1",
      templateBrandLabel: "canal",
      templateTheme: "paper",
      trackArtist: "Artist One",
      trackTitle: "First Light",
      visibility: "private",
    },
    warning: null,
  })),
  readSnapshotsWithStatus: (...args: unknown[]) => mockReadSnapshotsWithStatus(...args),
  syncSnapshotWithStatus: jest.fn(async () => ({ value: { id: "snapshot-1" } })),
  updateSnapshotWithStatus: jest.fn(async () => ({ value: { id: "snapshot-1" }, warning: null })),
}));

jest.mock("../lib/snapshot-templates", () => ({
  BUILT_IN_SNAPSHOT_STYLES: [
    { id: "canal-sunset", name: "Sunset Glow", brandLabel: "canal", theme: "sunset" },
    { id: "canal-midnight", name: "Deep Night", brandLabel: "canal", theme: "midnight" },
    { id: "canal-paper", name: "Paper Note", brandLabel: "canal", theme: "paper" },
  ],
  deleteSnapshotTemplate: jest.fn(async () => {}),
  listOwnSnapshotTemplates: jest.fn(async () => []),
  saveSnapshotTemplate: jest.fn(async () => {}),
  SNAPSHOT_TEMPLATE_THEMES: ["sunset", "midnight", "paper"],
}));

jest.mock("../lib/canal-share", () => ({
  shareSnapshot: jest.fn(async () => ({ method: "native" })),
}));

jest.mock("../hooks/use-reconnect-reload", () => ({
  useReconnectReload: () => 0,
}));

jest.mock("../lib/snapshot-navigation", () => ({
  snapshotReturnAction: jest.fn(() => "back"),
}));

jest.mock("../lib/soundscape", () => ({
  readSoundscape: jest.fn(async () => ({ snapshotIds: [] })),
  saveSoundscape: jest.fn(async () => {}),
}));

jest.mock("../lib/spotify-track-links", () => ({
  canonicalSpotifyTrackUrl: jest.fn(() => "https://open.spotify.com/track/track-1"),
}));

jest.mock("../lib/scene-collections", () => ({
  deleteSceneCollection: () => mockDeleteCollection(),
  loadSceneCollection: jest.fn(async () => ({
    description: "Late night Scenes",
    id: "collection-1",
    isPublic: true,
    items: [],
    ownerId: "owner-a",
    title: "Night Routes",
  })),
  saveSceneCollection: jest.fn(async () => ({ id: "collection-1" })),
}));

jest.mock("../lib/scenes", () => ({
  getSceneById: jest.fn(async () => ({
    activity: "Night drive",
    artists: "Artist One",
    emotions: "Bright and focused",
    energy: "high",
    id: "scene-1",
    name: "City Signals",
    tracks: [
      { artist: "Artist One", id: "track-1", title: "First Light" },
    ],
  })),
  sceneDurationMinutes: jest.fn(() => 42),
  readScenes: jest.fn(async () => []),
  sceneShareText: jest.fn(() => "City Signals on Canal"),
}));

import SceneSnapshotScreen from "../app/scene-snapshot";
import SnapshotTemplatesScreen from "../app/snapshot-templates";
import SnapshotsScreen from "../app/snapshots/index";
import SnapshotDetailScreen from "../app/snapshots/[snapshotId]";
import NewSceneCollectionScreen from "../app/collections/new";
import SceneCollectionScreen from "../app/collections/[collectionId]";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function expectNamedActionsAtLeast48(renderer: any): void {
  const actions = renderer.root.findAll((node: any) =>
    node.props.accessibilityRole === "button" &&
    typeof node.props.accessibilityLabel === "string" &&
    typeof node.props.onPress === "function",
  );

  for (const action of actions) {
    const style = StyleSheet.flatten(
      typeof action.props.style === "function"
        ? action.props.style({ pressed: false })
        : action.props.style,
    );
    expect(Math.max(style?.height ?? 0, style?.minHeight ?? 0)).toBeGreaterThanOrEqual(48);
  }
}

describe("Living Editorial Snapshot and share interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: jest.fn() } as never);
    mockCreateSnapshotWithStatus.mockResolvedValue({
      value: { id: "snapshot-1" },
      warning: null,
    });
    mockReadSnapshotsWithStatus.mockResolvedValue({ value: [], warning: null });
    mockParams = { sceneId: "scene-1" };
    mockAuthIdentity = {
      accountEpoch: 3,
      sessionGeneration: "session-3",
      user: { id: "owner-a" },
    };
  });

  it("defaults to Living Story and exposes tactile formats without enabling Signal Film", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(SceneSnapshotScreen));
    });

    const livingStory = renderer.root.findByProps({
      accessibilityLabel: "Living Story Snapshot format",
    });
    expect(livingStory.props.accessibilityState).toEqual({ checked: true });

    const receipt = renderer.root.findByProps({
      accessibilityLabel: "Receipt Snapshot format",
    });
    await act(async () => receipt.props.onPress());
    expect(renderer.root.findByProps({
      accessibilityLabel: "Receipt Snapshot format",
    }).props.accessibilityState).toEqual({ checked: true });

    expect(renderer.root.findByProps({
      accessibilityLabel: "Signal Film Snapshot format unavailable",
    }).props.accessibilityRole).toBe("text");
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "Spotify artwork is never transformed.",
    );
  });

  it("coalesces Share presses and exposes a stable busy accessibility state", async () => {
    const pendingShare = deferred<{ action: string }>();
    jest.spyOn(Share, "share").mockReturnValue(pendingShare.promise as never);
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(SceneSnapshotScreen));
    });
    const share = renderer.root.findByProps({ accessibilityLabel: "Share Snapshot" });

    await act(async () => {
      share.props.onPress();
      share.props.onPress();
      await Promise.resolve();
    });

    expect(Share.share).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: "Share Snapshot" }).props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    pendingShare.resolve({ action: "sharedAction" });
    await act(async () => { await pendingShare.promise; });
  });

  it("catches Share failures and retries once through the accessible recovery action", async () => {
    jest.spyOn(Share, "share")
      .mockRejectedValueOnce(new Error("Share unavailable"))
      .mockResolvedValueOnce({ action: "sharedAction" } as never);
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(SceneSnapshotScreen));
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Share Snapshot" }).props.onPress();
      await Promise.resolve();
    });

    const retry = renderer.root.findByProps({ accessibilityLabel: "Retry Share" });
    expect(retry.props.accessibilityRole).toBe("button");
    expect(JSON.stringify(renderer.toJSON())).toContain("Share unavailable");
    await act(async () => { retry.props.onPress(); await Promise.resolve(); });
    expect(Share.share).toHaveBeenCalledTimes(2);
  });

  it("coalesces publish presses at the real route action", async () => {
    const pendingPublish = deferred<any>();
    mockCreateSnapshotWithStatus.mockReturnValueOnce(pendingPublish.promise);
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(SceneSnapshotScreen));
    });
    const publish = renderer.root.findByProps({ accessibilityLabel: "Post Snapshot to Canal" });
    await act(async () => {
      publish.props.onPress();
      publish.props.onPress();
      await Promise.resolve();
    });
    expect(mockCreateSnapshotWithStatus).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: "Post Snapshot to Canal" }).props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    pendingPublish.resolve({ value: { id: "snapshot-1" }, warning: null });
    await act(async () => { await pendingPublish.promise; });
  });

  it("keeps every rendered Snapshot format and navigation action at least 48pt", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(SceneSnapshotScreen));
    });
    const actions = renderer.root.findAll((node: any) =>
      ["button", "radio"].includes(node.props.accessibilityRole) &&
      typeof node.props.onPress === "function",
    );

    for (const action of actions) {
      const style = StyleSheet.flatten(
        typeof action.props.style === "function"
          ? action.props.style({ pressed: false })
          : action.props.style,
      );
      expect(Math.max(style?.height ?? 0, style?.minHeight ?? 0)).toBeGreaterThanOrEqual(48);
    }
  });

  it("uses the solid reduced-transparency preview and preserves keyboard interaction", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(SceneSnapshotScreen));
    });

    expect(renderer.root.findAll((node: any) =>
      StyleSheet.flatten(node.props.style)?.width === 310,
    )).toHaveLength(0);
    expect(renderer.root.findAll((node: any) =>
      node.props.keyboardShouldPersistTaps === "handled",
    ).length).toBeGreaterThan(0);
    const signalFilm = renderer.root.findByProps({
      accessibilityLabel: "Signal Film Snapshot format unavailable",
    });
    expect(signalFilm.props.onPress).toBeUndefined();
    expect(signalFilm.props.pointerEvents).not.toBe("none");
  });

  it("renders all six routes and preserves exact navigation, forms, provider link, and destructive confirmation", async () => {
    const templates = await (async () => {
      let renderer: any;
      await act(async () => { renderer = create(React.createElement(SnapshotTemplatesScreen)); });
      return renderer;
    })();
    await act(async () => templates.root.findByProps({ accessibilityLabel: "Go back" }).props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
    expect(templates.root.findByProps({ accessibilityLabel: "Create a new Snapshot template" }).props.accessibilityRole).toBe("button");
    expectNamedActionsAtLeast48(templates);

    mockParams = {};
    let snapshots: any;
    await act(async () => { snapshots = create(React.createElement(SnapshotsScreen)); });
    await act(async () => snapshots.root.findByProps({ accessibilityLabel: "Open Soundscape" }).props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/soundscape");
    expect(snapshots.root.findByProps({ placeholder: "Search Snapshots" })).toBeTruthy();
    expectNamedActionsAtLeast48(snapshots);

    mockParams = { snapshotId: "snapshot-1" };
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    let detail: any;
    await act(async () => { detail = create(React.createElement(SnapshotDetailScreen)); });
    await act(async () => detail.root.findByProps({ accessibilityLabel: "Open captured track in Spotify" }).props.onPress());
    expect(openUrl).toHaveBeenCalledWith("https://open.spotify.com/track/track-1");
    await act(async () => detail.root.findByProps({ accessibilityLabel: "Manage Snapshot" }).props.onPress());
    expect(detail.root.findByProps({ accessibilityLabel: "Delete Snapshot" }).props.accessibilityState).toEqual({ busy: false, disabled: false });
    expectNamedActionsAtLeast48(detail);

    mockParams = {};
    let newCollection: any;
    await act(async () => { newCollection = create(React.createElement(NewSceneCollectionScreen)); });
    expect(newCollection.root.findByProps({ accessibilityLabel: "Collection title" })).toBeTruthy();
    expect(newCollection.root.findByProps({ accessibilityLabel: "Publish collection" }).props.accessibilityState.disabled).toBe(true);
    expectNamedActionsAtLeast48(newCollection);

    mockParams = { collectionId: "collection-1" };
    const alert = jest.spyOn(Alert, "alert");
    let collection: any;
    await act(async () => { collection = create(React.createElement(SceneCollectionScreen)); });
    await act(async () => collection.root.findByProps({ accessibilityLabel: "Delete Night Routes collection" }).props.onPress());
    expect(alert).toHaveBeenCalledWith(
      "Delete collection?",
      '"Night Routes" will be removed. Its Scenes stay in your Library.',
      expect.any(Array),
      expect.any(Object),
    );
    expectNamedActionsAtLeast48(collection);
  });

  it("remounts the Snapshot list on same-user session changes and quarantines a late A1 read", async () => {
    const staleRead = deferred<{ value: Array<Record<string, unknown>>; warning: null }>();
    mockReadSnapshotsWithStatus
      .mockReturnValueOnce(staleRead.promise)
      .mockResolvedValueOnce({ value: [], warning: null });
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(SnapshotsScreen)); });

    mockAuthIdentity = {
      accountEpoch: 4,
      sessionGeneration: "session-4",
      user: { id: "owner-a" },
    };
    await act(async () => { renderer.update(React.createElement(SnapshotsScreen)); });
    expect(JSON.stringify(renderer.toJSON())).not.toContain("A1_PRIVATE");

    staleRead.resolve({
      value: [{
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "snapshot-a1",
        mood: "A1_PRIVATE",
        sceneName: "A1_PRIVATE",
        visibility: "private",
      }],
      warning: null,
    });
    await act(async () => { await staleRead.promise; });

    expect(mockReadSnapshotsWithStatus).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("A1_PRIVATE");
  });
});
