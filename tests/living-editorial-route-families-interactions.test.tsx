import React from "react";
import { RefreshControl, StyleSheet } from "react-native";

const { act, create } = jest.requireActual("react-test-renderer");
let mockUserId = "owner-a";
const mockCaptureProfileSocialAccount = jest.fn((_userId: string) => ({ userId: mockUserId }));
const mockLoadExploreScenes = jest.fn(async () => []);
const mockLoadProfileFollowing = jest.fn(async (..._args: unknown[]) => []);
jest.mock("@expo/vector-icons", () => {
  const ReactModule = require("react");
  return {
    Ionicons: (props: Record<string, unknown>) =>
      ReactModule.createElement("Ionicons", props),
  };
});
jest.mock("expo-router", () => {
  const ReactModule = require("react");
  return {
    Redirect: (props: Record<string, unknown>) => ReactModule.createElement("Redirect", props),
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
    useFocusEffect: (callback: () => void) => ReactModule.useEffect(callback, []),
    useLocalSearchParams: () => ({}),
  };
});

const mockRouter = (jest.requireMock("expo-router") as { router: Record<string, jest.Mock> }).router;

jest.mock("../components/recovery-notice", () => ({ RecoveryNotice: () => null }));
jest.mock("../components/PublicSnapshotCard", () => ({
  PublicSnapshotCard: () => null,
  PublicSnapshotGrid: () => null,
}));
jest.mock("../components/activity-screen", () => {
  const ReactModule = require("react");
  return {
    __esModule: true,
    default: () => ReactModule.createElement("ActivityScreen", { accessibilityLabel: "Activity" }),
  };
});
jest.mock("../hooks/use-reconnect-reload", () => ({ useReconnectReload: () => 0 }));
jest.mock("../lib/recovery-issue", () => ({ classifyRecoveryIssue: jest.fn(() => null) }));
jest.mock("../lib/spotify-library", () => ({
  getLatestSpotifyLibrarySnapshot: jest.fn(async () => ({ snapshot: null, warning: null, issue: null })),
  syncSpotifyLibrary: jest.fn(async () => null),
}));
jest.mock("../lib/scene-recommendations", () => ({ rankSceneRecommendations: jest.fn(() => []) }));
jest.mock("../lib/scenes", () => ({
  getRecentScenes: jest.fn(() => []),
  readScenes: jest.fn(async () => []),
  sceneDurationMinutes: jest.fn(() => 0),
  deleteScene: jest.fn(async () => {}),
}));
jest.mock("../lib/public-snapshots", () => ({
  loadPublicSnapshotFeed: jest.fn(async () => []),
  loadPublicProfileSnapshots: jest.fn(async () => []),
}));
jest.mock("../lib/social", () => ({
  loadExploreScenes: () => mockLoadExploreScenes(),
  savePublicSceneToLibrary: jest.fn(async () => {}),
  setOwnSceneVisibility: jest.fn(async () => {}),
  loadPublicProfile: jest.fn(async () => null),
}));
jest.mock("../lib/saved-scene-management", () => ({ removeSavedSceneCompletely: jest.fn(async () => {}) }));
jest.mock("../lib/playlist-exports", () => ({ readScenePlaylistExports: jest.fn(async () => []) }));
jest.mock("../lib/scene-collections", () => ({
  listOwnSceneCollections: jest.fn(async () => []),
  listPublicSceneCollections: jest.fn(async () => []),
}));
jest.mock("../lib/snapshots", () => ({ readSnapshotsWithStatus: jest.fn(async () => ({ snapshots: [] })) }));
jest.mock("../lib/snapshot-templates", () => ({ listOwnSnapshotTemplates: jest.fn(async () => []) }));
jest.mock("../lib/supabase", () => ({
  supabase: { from: jest.fn(() => ({ select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: null, error: null })) })) })) })) },
}));
jest.mock("../lib/canal-session", () => ({ readListeningHistory: jest.fn(async () => []) }));
jest.mock("../providers/connectivity-provider", () => ({
  useConnectivity: () => ({ status: "offline" }),
}));
jest.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: mockUserId }, accountEpoch: mockUserId === "owner-a" ? 1 : 2 }),
}));
jest.mock("../lib/profile-social", () => ({
  captureProfileSocialAccount: (userId: string) => mockCaptureProfileSocialAccount(userId),
  loadProfileConnectionSummary: jest.fn(async () => ({ followers: 0, following: 0 })),
  loadProfileFollowers: jest.fn(async () => []),
  loadProfileFollowing: (...args: unknown[]) => mockLoadProfileFollowing(...args),
}));
jest.mock("../lib/relationships", () => ({ followUser: jest.fn(async () => {}), unfollowUser: jest.fn(async () => {}) }));

import HomeScreen from "../app/(tabs)/index";
import ActivityTabScreen from "../app/(tabs)/activity";
import ExploreScreen from "../app/(tabs)/explore";
import LibraryScreen from "../app/(tabs)/library";
import ProfileScreen from "../app/(tabs)/profile";
import ExploreRedirect from "../app/explore";
import HomeRedirect from "../app/home";
import LibraryRedirect from "../app/library";
import FollowingScreen from "../app/following";
import CreatorProfileScreen from "../app/creator/[userId]";

async function render(element: React.ReactElement) {
  let renderer: any;
  await act(async () => { renderer = create(element); });
  return renderer;
}

function effectiveStyle(node: any): Record<string, any> {
  const value = typeof node.props.style === "function"
    ? node.props.style({ pressed: false })
    : node.props.style;
  return StyleSheet.flatten(value) ?? {};
}

function expect48(node: any): void {
  const style = effectiveStyle(node);
  expect(Math.max(style.minHeight ?? 0, style.height ?? 0)).toBeGreaterThanOrEqual(48);
}

describe("Living Editorial primary route families", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = "owner-a";
    mockLoadExploreScenes.mockResolvedValue([{
      creator: { displayName: "Creator A", handle: "creator_a" },
      isMine: false,
      ownerId: "creator-a",
      sceneId: "scene-a",
      scene: { activity: "Focus", emotions: "Calm", name: "Quiet Current", tracks: [] },
    }] as never);
    mockLoadProfileFollowing.mockResolvedValue([]);
  });

  it("preserves exact deep-link redirects", async () => {
    const home = await render(<HomeRedirect />);
    const explore = await render(<ExploreRedirect />);
    const library = await render(<LibraryRedirect />);
    expect(home.root.findByType("Redirect").props.href).toBe("/(tabs)");
    expect(explore.root.findByType("Redirect").props.href).toBe("/(tabs)/explore");
    expect(library.root.findByType("Redirect").props.href).toBe("/(tabs)/library");
  });

  it("renders Home offline without blocking accessible navigation", async () => {
    const renderer = await render(<HomeScreen />);
    const buttons = renderer.root.findAll((node: any) =>
      node.props.accessibilityRole === "button" && typeof node.props.onPress === "function",
    );
    expect(buttons.length).toBeGreaterThan(0);
    await act(async () => buttons[0].props.onPress());
    expect(mockRouter.push).toHaveBeenCalled();
    expect(renderer.root.findAll((node: any) => node.props.allowFontScaling === false)).toHaveLength(0);
  });

  it("rejects a deferred A result after switching to B and keeps B state visible", async () => {
    let resolveA!: (value: never[]) => void;
    mockLoadProfileFollowing.mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve; }));
    const renderer = await render(<FollowingScreen />);
    const buttons = renderer.root.findAll((node: any) =>
      node.props.accessibilityRole === "button" && typeof node.props.onPress === "function",
    );
    expect(buttons.length).toBeGreaterThan(0);
    expect48(buttons[0]);
    expect(renderer.root.findAll((node: any) => node.props.allowFontScaling === false)).toHaveLength(0);
    expect(mockCaptureProfileSocialAccount).toHaveBeenCalledWith("owner-a");
    await act(async () => renderer.unmount());
    mockUserId = "owner-b";
    mockLoadProfileFollowing.mockResolvedValueOnce([{
      profile: { id: "b-friend", displayName: "B Friend", handle: "@b", isCanal: false, isVerified: false },
      viewerIsFollowing: true,
    }] as never);
    const rendererB = await render(<FollowingScreen />);
    expect(mockCaptureProfileSocialAccount).toHaveBeenCalledWith("owner-b");
    await act(async () => resolveA([{
      profile: { id: "a-friend", displayName: "A Secret", handle: "@a", isCanal: false, isVerified: false },
      viewerIsFollowing: true,
    }] as never));
    expect(rendererB.root.findAll((node: any) => node.props.children === "A Secret")).toHaveLength(0);
    expect(rendererB.root.findAll((node: any) => node.props.children === "B Friend").length).toBeGreaterThan(0);
  });

  it("keeps the Activity route delegated to its existing screen contract", async () => {
    const renderer = await render(<ActivityTabScreen />);
    expect(renderer.toJSON()).toBeTruthy();
  });

  it("renders Home, Explore, Library, Profile, and Creator route handlers with accessible targets", async () => {
    const home = await render(<HomeScreen />);
    const explore = await render(<ExploreScreen />);
    const library = await render(<LibraryScreen />);
    const profile = await render(<ProfileScreen />);
    const creator = await render(<CreatorProfileScreen />);
    for (const renderer of [home, explore, library, profile, creator]) {
      expect(renderer.root.findAll((node: any) => node.props.allowFontScaling === false)).toHaveLength(0);
    }
    expect(library.root.findAllByProps({ accessibilityLabel: "Create Scene" })).toHaveLength(0);

    for (const label of ["Filter Library by all", "Filter Library by created", "Filter Library by saved", "Filter Library by favorites"]) {
      expect48(library.root.findByProps({ accessibilityLabel: label }));
    }
    for (const renderer of [home, library, profile]) {
      expect48(renderer.root.findByProps({ accessibilityLabel: "Open Activity notifications" }));
    }
    expect(home.root.findAllByProps({ accessibilityLabel: "Open Settings" })).toHaveLength(0);
    for (const renderer of [library, profile]) {
      expect48(renderer.root.findByProps({ accessibilityLabel: "Open Settings" }));
    }
    const activityNotifications = profile.root.findByProps({ accessibilityLabel: "Open Activity notifications" });
    await act(async () => activityNotifications.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/activity");
    await act(async () => profile.root.findByProps({ accessibilityLabel: "Open Settings" }).props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/settings");

    expect(explore.root.findByType(RefreshControl).props.refreshing).toBe(false);
    expect48(explore.root.findByProps({ accessibilityLabel: "Show Snapshots" }));
    expect48(explore.root.findByProps({ accessibilityLabel: "Show Scenes" }));
    await act(async () => explore.root.findByProps({ accessibilityLabel: "Show Scenes" }).props.onPress());
    const creatorButton = explore.root.findByProps({ accessibilityLabel: "Open creator Creator A" });
    expect48(creatorButton);
    await act(async () => creatorButton.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/creator/[userId]", params: { userId: "creator-a" } });

    const following = await render(<FollowingScreen />);
    expect48(following.root.findByProps({ accessibilityLabel: "Show following" }));
    expect48(following.root.findByProps({ accessibilityLabel: "Show followers" }));
  });

  it("renders Explore failure and invokes its retry without changing the route", async () => {
    mockLoadExploreScenes.mockRejectedValueOnce(new Error("offline"));
    const renderer = await render(<ExploreScreen />);
    const pullToRefresh = renderer.root.findByType(RefreshControl);
    await act(async () => pullToRefresh.props.onRefresh());
    expect(mockLoadExploreScenes).toHaveBeenCalledTimes(2);
  });

  it("renders the named Following retry at 48pt and invokes the exact reload", async () => {
    mockLoadProfileFollowing.mockRejectedValueOnce(new Error("offline"));
    const renderer = await render(<FollowingScreen />);
    const retry = renderer.root.findByProps({ accessibilityLabel: "Retry profile connections" });
    expect48(retry);
    await act(async () => retry.props.onPress());
    expect(mockLoadProfileFollowing).toHaveBeenCalledTimes(2);
  });
});
