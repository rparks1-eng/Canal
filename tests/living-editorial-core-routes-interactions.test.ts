import React from "react";

import { Alert, StyleSheet } from "react-native";

const { act, create } = jest.requireActual("react-test-renderer");

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn(),
};
const mockShareInvite = jest.fn(async () => ({ method: "native" }));
const mockShareSoundscape = jest.fn<Promise<{ method: string }>, [unknown]>(async () => ({ method: "native" }));
const mockRemoveFavorite = jest.fn<Promise<void>, [string]>(async () => {});
const mockFollowUser = jest.fn<Promise<{ blocked: string[]; following: string[] }>, [string, string]>(async () => ({ blocked: [], following: ["maya.wav"] }));
const mockUnfollowUser = jest.fn<Promise<{ blocked: string[]; following: string[] }>, [string, string]>(async () => ({ blocked: [], following: [] }));
const mockBlockUser = jest.fn<Promise<{ blocked: string[]; following: string[] }>, [string, string]>(async () => ({ blocked: ["maya.wav"], following: [] }));
const mockUnblockUser = jest.fn<Promise<{ blocked: string[]; following: string[] }>, [string, string, string?]>(async () => ({ blocked: [], following: [] }));
const mockReadScenes = jest.fn<Promise<Array<Record<string, unknown>>>, []>(async () => []);
const mockResolvePublicProfileIdByHandle = jest.fn<Promise<string>, [string]>(
  async () => "profile-maya",
);
const mockClearUnreadCount = jest.fn();
const mockRefreshUnreadCount = jest.fn(async () => {});
let mockParams: Record<string, string> = { username: "maya.wav" };
let mockIdentity = {
  accountEpoch: 1,
  sessionGeneration: "session-1",
  user: { id: "owner-a" },
};

const person = {
  bio: "Music for late-night drives.",
  displayName: "Maya Thompson",
  favoriteArtists: ["Artist One"],
  genres: ["R&B"],
  initials: "MT",
  recentScenes: ["Night Drive"],
  username: "maya.wav",
  visibility: "public",
};

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

jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) => require("react").createElement("Ionicons", props),
}));
jest.mock("../providers/auth-provider", () => ({ useAuth: () => mockIdentity }));
jest.mock("../providers/connectivity-provider", () => ({
  useConnectivity: () => ({ refresh: jest.fn(async () => "online"), status: "online" }),
}));
jest.mock("../providers/notification-center-provider", () => ({
  useNotificationCenter: () => ({
    clearUnreadCount: mockClearUnreadCount,
    refreshUnreadCount: mockRefreshUnreadCount,
    unreadCount: 0,
  }),
}));
jest.mock("../hooks/use-reconnect-reload", () => ({ useReconnectReload: jest.fn() }));
jest.mock("../components/recovery-notice", () => ({ RecoveryNotice: () => null }));
jest.mock("../lib/recovery-issue", () => ({ classifyRecoveryIssue: jest.fn(() => null) }));
jest.mock("../lib/canal-invites", () => ({ shareCanalInvite: () => mockShareInvite() }));
jest.mock("../lib/canal-share", () => ({ shareSoundscape: (input: unknown) => mockShareSoundscape(input) }));
jest.mock("../lib/favorite-scenes", () => ({
  readFavoriteSceneIds: jest.fn(async () => ["late-night-drive"]),
  removeFavoriteScene: (sceneId: string) => mockRemoveFavorite(sceneId),
}));
jest.mock("../lib/live-stages", () => ({
  getCurrentLiveStageTrack: jest.fn(() => null),
  readLiveStages: jest.fn(async () => []),
}));
jest.mock("../lib/scenes", () => ({ readScenes: () => mockReadScenes() }));
jest.mock("../lib/snapshots", () => ({ readSnapshots: jest.fn(async () => []) }));
jest.mock("../lib/social", () => ({
  loadExploreScenes: jest.fn(async () => [{
    creator: {
      bio: person.bio,
      displayName: person.displayName,
      favoriteActivities: "Driving",
      handle: person.username,
      id: "profile-maya",
      isVerified: false,
    },
    isMine: false,
    ownerId: "profile-maya",
    scene: {
      artists: person.favoriteArtists.join(", "),
      genres: person.genres.join(", "),
      tracks: [],
    },
  }]),
  resolvePublicProfileIdByHandle: (handle: string) =>
    mockResolvePublicProfileIdByHandle(handle),
}));
jest.mock("../lib/supabase", () => ({ isSupabaseConfigured: false }));
jest.mock("../lib/user-directory", () => ({
  getDirectoryUser: jest.fn(() => person),
  getDirectoryUsers: jest.fn(() => [person]),
}));
jest.mock("../lib/relationships", () => ({
  blockUser: (username: string, displayName: string) => mockBlockUser(username, displayName),
  clearActivity: jest.fn(async () => {}),
  followUser: (username: string, displayName: string) => mockFollowUser(username, displayName),
  markAllActivityRead: jest.fn(async () => {}),
  readActivity: jest.fn(async () => [{
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "Followed Maya",
    id: "activity-1",
    isRead: false,
    title: "New connection",
    type: "follow",
    username: "maya.wav",
  }]),
  readBlockedUserReferences: jest.fn(async () => [{ username: "maya.wav" }]),
  readBlockedUsers: jest.fn(async () => []),
  readRelationshipState: jest.fn(async () => ({ blocked: [], following: [] })),
  unblockUser: (username: string, displayName: string, targetUserId?: string) =>
    mockUnblockUser(username, displayName, targetUserId),
  unfollowUser: (username: string, displayName: string) => mockUnfollowUser(username, displayName),
}));

import CreateTabScreen from "../app/(tabs)/create";
import ActivityTabScreen from "../app/(tabs)/activity";
import SearchScreen from "../app/search";
import FavoritesScreen from "../app/favorites";
import FriendsScreen from "../app/friends";
import FriendProfileScreen from "../app/friend/[username]";
import BlockedUsersScreen from "../app/blocked-users";
import InviteFriendsScreen from "../app/invite-friends";

function namedButtonsAreAtLeast48(renderer: any): void {
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
    const target = Math.max(style?.height ?? 0, style?.minHeight ?? 0);
    if (target < 48) {
      throw new Error(`${action.props.accessibilityLabel} target is ${target}pt`);
    }
  }
}

describe("Living Editorial core route interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockParams = { username: "maya.wav" };
    mockIdentity = {
      accountEpoch: 1,
      sessionGeneration: "session-1",
      user: { id: "owner-a" },
    };
  });

  it("preserves exact Create navigation and renders the Activity tab", async () => {
    let createRoute: any;
    let activity: any;
    await act(async () => {
      createRoute = create(React.createElement(CreateTabScreen));
      activity = create(React.createElement(ActivityTabScreen));
    });
    await act(async () => createRoute.root.findByProps({ accessibilityLabel: "Set the Scene" }).props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/scene-studio");
    expect(JSON.stringify(activity.toJSON())).toContain("Activity");
    await act(async () => {
      await activity.root.findByProps({
        accessibilityLabel: "New connection. Followed Maya",
      }).props.onPress();
    });
    expect(mockResolvePublicProfileIdByHandle).toHaveBeenCalledWith("maya.wav");
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/creator/[userId]",
      params: { userId: "profile-maya" },
    });
    const backToProfile = activity.root.findByProps({ accessibilityLabel: "Back to Profile" });
    await act(async () => backToProfile.props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/profile");
    namedButtonsAreAtLeast48(createRoute);
    namedButtonsAreAtLeast48(activity);
  });

  it("renders search, favorites, friends, profile, blocked, and invite routes with preserved actions", async () => {
    const routes: any[] = [];
    for (const Route of [SearchScreen, FavoritesScreen, FriendsScreen, FriendProfileScreen, BlockedUsersScreen, InviteFriendsScreen]) {
      await act(async () => { routes.push(create(React.createElement(Route))); });
    }
    await act(async () => routes[0].root.findByProps({ accessibilityLabel: "Go back" }).props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
    expect(routes[1].root.findAllByProps({ accessibilityLabel: "Explore Scenes" }).length).toBeGreaterThan(0);
    expect(routes[2].root.findByProps({ accessibilityLabel: "Invite friends" })).toBeTruthy();
    expect(routes[3].root.findAllByProps({ accessibilityLabel: "Share Maya Thompson Soundscape" }).length).toBeGreaterThan(0);
    expect(JSON.stringify(routes[4].toJSON())).toContain("Blocked");
    expect(routes[5].root.findByProps({ accessibilityLabel: "Share Canal invite" }).props.accessibilityState).toEqual({ busy: false, disabled: false });
    routes.forEach(namedButtonsAreAtLeast48);
  });

  it("coalesces invite sharing and keeps its busy accessibility state", async () => {
    let resolveShare!: (value: { method: string }) => void;
    const pending = new Promise<{ method: string }>((resolve) => { resolveShare = resolve; });
    mockShareInvite.mockReturnValueOnce(pending);
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(InviteFriendsScreen)); });
    const share = renderer.root.findByProps({ accessibilityLabel: "Share Canal invite" });
    await act(async () => {
      share.props.onPress();
      share.props.onPress();
      await Promise.resolve();
    });
    expect(mockShareInvite).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: "Share Canal invite" }).props.accessibilityState).toEqual({ busy: true, disabled: true });
    resolveShare({ method: "native" });
    await act(async () => { await pending; });
  });

  it("remounts account-scoped social state for same-user A1 to A2", async () => {
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(FriendsScreen)); });
    await act(async () => {
      renderer.root.findByProps({ placeholder: "Search people or music taste" }).props.onChangeText("A1_PRIVATE");
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("A1_PRIVATE");
    mockIdentity = {
      accountEpoch: 2,
      sessionGeneration: "session-2",
      user: { id: "owner-a" },
    };
    await act(async () => { renderer.update(React.createElement(FriendsScreen)); });
    expect(JSON.stringify(renderer.toJSON())).not.toContain("A1_PRIVATE");
  });

  it("keeps destructive confirmation copy intact", async () => {
    const alert = jest.spyOn(Alert, "alert");
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(ActivityTabScreen)); });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Clear Activity history" }).props.onPress());
    expect(alert).toHaveBeenCalledWith(
      "Clear activity history?",
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("drives Search query results, exact deep links, empty state, errors, and back", async () => {
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(SearchScreen)); });
    const input = renderer.root.findByProps({ placeholder: "Search Canal" });
    await act(async () => input.props.onChangeText("Late Night Drive"));
    const result = renderer.root.findAll((node: any) =>
      typeof node.props.accessibilityLabel === "string" &&
      node.props.accessibilityLabel.includes("Late Night Drive"),
    )[0];
    await act(async () => result.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/scenes/[sceneId]", params: { sceneId: "late-night-drive" } });
    await act(async () => input.props.onChangeText("no-match-at-all"));
    expect(JSON.stringify(renderer.toJSON())).toContain("No results found");
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Go back" }).props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();

    mockReadScenes.mockRejectedValueOnce(new Error("offline"));
    let errorRoute: any;
    await act(async () => { errorRoute = create(React.createElement(SearchScreen)); });
    expect(JSON.stringify(errorRoute.toJSON())).toContain("offline");
    expect(errorRoute.root.findByProps({ accessibilityLabel: "Retry Search" })).toBeTruthy();
  });

  it("confirms Favorite removal, performs the exact mutation, and permits a retry after failure", async () => {
    const alert = jest.spyOn(Alert, "alert");
    mockRemoveFavorite.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(FavoritesScreen)); });
    const remove = renderer.root.findByProps({ accessibilityLabel: "Remove Late Night Drive from Favorites" });
    await act(async () => remove.props.onPress());
    const firstConfirmation = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => firstConfirmation.find((action) => action.text === "Remove")?.onPress?.());
    expect(mockRemoveFavorite).toHaveBeenNthCalledWith(1, "late-night-drive");
    expect(alert).toHaveBeenCalledWith(
      "Unable to update",
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
    await act(async () => remove.props.onPress());
    const retryConfirmation = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => retryConfirmation.find((action) => action.text === "Remove")?.onPress?.());
    expect(mockRemoveFavorite).toHaveBeenCalledTimes(2);
  });

  it("preserves Friends invite, profile routing, and follow mutation", async () => {
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(FriendsScreen)); });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Invite friends" }).props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/invite-friends");
    await act(async () => renderer.root.findAllByProps({ accessibilityLabel: "Open Maya Thompson" })[0].props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/creator/[userId]", params: { userId: "profile-maya" } });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Follow Maya Thompson" }).props.onPress());
    expect(mockFollowUser).toHaveBeenCalledWith("maya.wav", "Maya Thompson");
  });

  it("preserves Friend follow, share, and block confirmation mutations", async () => {
    const alert = jest.spyOn(Alert, "alert");
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(FriendProfileScreen)); });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Follow Maya Thompson" }).props.onPress());
    expect(mockFollowUser).toHaveBeenCalledWith("maya.wav", "Maya Thompson");
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Unfollow Maya Thompson" }).props.onPress());
    expect(mockUnfollowUser).toHaveBeenCalledWith("maya.wav", "Maya Thompson");
    await act(async () => renderer.root.findAllByProps({ accessibilityLabel: "Share Maya Thompson Soundscape" })[0].props.onPress());
    expect(mockShareSoundscape).toHaveBeenCalledWith(expect.objectContaining({ username: "maya.wav" }));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Block Maya Thompson" }).props.onPress());
    const confirmation = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => confirmation.find((action) => action.text === "Block")?.onPress?.());
    expect(mockBlockUser).toHaveBeenCalledWith("maya.wav", "Maya Thompson");
  });

  it("confirms Blocked Users unblock, preserves failure state, and retries the exact mutation", async () => {
    const alert = jest.spyOn(Alert, "alert");
    mockUnblockUser.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ blocked: [], following: [] });
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(BlockedUsersScreen)); });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Unblock Maya Thompson" }).props.onPress());
    const confirmation = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => confirmation.find((action) => action.text === "Unblock")?.onPress?.());
    expect(mockUnblockUser).toHaveBeenCalledWith("maya.wav", "Maya Thompson", undefined);
    expect(alert).toHaveBeenCalledWith(
      "Unable to unblock",
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Unblock Maya Thompson" }).props.onPress());
    const retryConfirmation = alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => retryConfirmation.find((action) => action.text === "Unblock")?.onPress?.());
    expect(mockUnblockUser).toHaveBeenCalledTimes(2);
  });

  it("shows accessible Invite failure recovery and retries idempotently", async () => {
    mockShareInvite.mockRejectedValueOnce(new Error("Native share unavailable")).mockResolvedValueOnce({ method: "native" });
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(InviteFriendsScreen)); });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Share Canal invite" }).props.onPress());
    expect(JSON.stringify(renderer.toJSON())).toContain("Native share unavailable");
    const retry = renderer.root.findByProps({ accessibilityLabel: "Retry sharing Canal invite" });
    expect(retry.props.accessibilityState).toEqual({ busy: false, disabled: false });
    await act(async () => retry.props.onPress());
    expect(mockShareInvite).toHaveBeenCalledTimes(2);
  });

  it("quarantines a deferred A1 Search load after same-user A2 remount", async () => {
    let resolveA1!: (value: Array<Record<string, unknown>>) => void;
    const pendingA1 = new Promise<Array<Record<string, unknown>>>((resolve) => { resolveA1 = resolve; });
    mockReadScenes.mockReturnValueOnce(pendingA1).mockResolvedValueOnce([]);
    let renderer: any;
    await act(async () => { renderer = create(React.createElement(SearchScreen)); });
    mockIdentity = { accountEpoch: 2, sessionGeneration: "session-2", user: { id: "owner-a" } };
    await act(async () => { renderer.update(React.createElement(SearchScreen)); });
    resolveA1([{ activity: "A1_PRIVATE", id: "a1", name: "A1_PRIVATE", tracks: [] }]);
    await act(async () => { await pendingA1; });
    expect(mockReadScenes).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("A1_PRIVATE");
  });
});
