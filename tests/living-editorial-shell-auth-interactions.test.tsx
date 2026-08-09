import React from "react";

import {
  AccessibilityInfo,
  Alert,
  StyleSheet,
} from "react-native";

import type {
  ReactElement,
} from "react";

const {
  act,
  create,
} = jest.requireActual("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => TestRenderer;
};

type TestNode = {
  props: Record<string, any>;
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
  findAllByProps: (props: Record<string, unknown>) => TestNode[];
  findAllByType: (type: string) => TestNode[];
  findByProps: (props: Record<string, unknown>) => TestNode;
  findByType: (type: string) => TestNode;
};

type TestRenderer = {
  root: TestNode;
  update: (element: ReactElement) => void;
  unmount: () => void;
};

let mockAuthState: Record<string, any> = {
  accountEpoch: 1,
  configured: true,
  loading: false,
  session: null,
  user: {
    created_at: "2026-01-01T00:00:00.000Z",
    email: "a@example.test",
    id: "owner-a",
    user_metadata: {},
  },
};

let mockSegments = ["login"];
let mockConnectState: Record<string, any>;

const mockSignInWithEmail = jest.fn();
const mockRequestPasswordReset = jest.fn(async () => {});
const mockCompletePasswordRecoveryFromLink = jest.fn(async (_url: string) => {});
const mockUpdateCanalPassword = jest.fn(async (_password: string) => {});
const mockCompleteSupabaseAuthUrl = jest.fn(async (_url: string) => {});
const mockClearAllCanalData = jest.fn(async () => {});
const mockRetryCleanup = jest.fn(async () => {});
const mockCompleteOnboarding = jest.fn(async (
  _userId: string,
  _destination: string,
) => {});
const mockExportCanalData = jest.fn(async () => "{}");
const mockDeleteOwnAnalyticsEvents = jest.fn(async () => ({
  enabled: false,
  message: "Analytics history deleted.",
  pendingCloudDeletion: false,
  queuedEventCount: 0,
}));

jest.mock("expo-router", () => {
  const ReactModule = require("react");
  const Stack = (props: Record<string, unknown>) =>
    ReactModule.createElement("Stack", props, props.children);
  Stack.Screen = (props: Record<string, unknown>) =>
    ReactModule.createElement("StackScreen", props);
  const Tabs = (props: Record<string, unknown>) =>
    ReactModule.createElement("Tabs", props, props.children);
  Tabs.Screen = (props: Record<string, unknown>) =>
    ReactModule.createElement("TabsScreen", props);
  return {
    Stack,
    Tabs,
    router: {
      back: jest.fn(),
      canGoBack: jest.fn(() => true),
      push: jest.fn(),
      replace: jest.fn(),
    },
    useGlobalSearchParams: () => ({}),
    useFocusEffect: jest.fn(),
    useLocalSearchParams: () => ({}),
    useSegments: () => mockSegments,
  };
});

const mockRouter = (
  jest.requireMock("expo-router") as {
    router: {
      back: jest.Mock;
      canGoBack: jest.Mock;
      push: jest.Mock;
      replace: jest.Mock;
    };
  }
).router;

jest.mock("expo-linking", () => ({
  getInitialURL: jest.fn(async () => "canal://auth/callback?code=test"),
  useURL: () => "canal://auth/callback?code=test",
}));

jest.mock("expo-web-browser", () => ({
  dismissAuthSession: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(() => "canal://spotify-callback"),
}));

jest.mock("@expo/vector-icons", () => {
  const ReactModule = require("react");
  return {
    Ionicons: Object.assign(
      (props: Record<string, unknown>) => ReactModule.createElement("Ionicons", props),
      { glyphMap: {} },
    ),
  };
});

jest.mock("../providers/auth-provider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthState,
}));

jest.mock("../providers/connectivity-provider", () => ({
  ConnectivityProvider: ({ children }: { children: React.ReactNode }) => children,
  useConnectivity: () => ({ isOnline: false, status: "offline" }),
}));

jest.mock("../providers/analytics-provider", () => ({
  AnalyticsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../components/connectivity-banner", () => ({
  ConnectivityBanner: () => null,
}));

jest.mock("../lib/onboarding", () => ({
  ONBOARDING_METADATA_KEY: "onboarding",
  isOnboardingRequired: jest.fn(async () => false),
  markOnboardingRequired: jest.fn(async () => {}),
  readPendingOnboardingDestination: jest.fn(async () => null),
  rememberPendingSignup: jest.fn(async () => {}),
  subscribeToOnboarding: jest.fn(() => () => {}),
  completeOnboarding: (userId: string, destination: string) =>
    mockCompleteOnboarding(userId, destination),
}));

jest.mock("../lib/auth-return", () => ({
  consumePublicSceneReturn: jest.fn(async () => null),
  rememberPublicSceneReturn: jest.fn(async () => {}),
}));

jest.mock("../lib/canal-auth", () => ({
  completeSupabaseAuthUrl: (url: string) => mockCompleteSupabaseAuthUrl(url),
  signInWithEmail: (email: string, password: string) => mockSignInWithEmail(email, password),
  signInWithSocial: jest.fn(),
  signUpWithEmail: jest.fn(),
  requestPasswordReset: () => mockRequestPasswordReset(),
  completePasswordRecoveryFromLink: (url: string) => mockCompletePasswordRecoveryFromLink(url),
  isPasswordRecoveryUrl: jest.fn(() => true),
  updateCanalPassword: (password: string) => mockUpdateCanalPassword(password),
}));

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: {} }, error: null })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signOut: jest.fn(async () => ({ error: null })),
    },
  },
}));

jest.mock("../hooks/useSpotifyConnection", () => ({
  useSpotifyConnection: () => mockConnectState,
}));

jest.mock("../lib/spotify-auth-return", () => ({
  announceSpotifyAuthStatusEvent: jest.fn(),
  acquireSpotifyAuthOperationLease: jest.fn(() => ({ id: "operation" })),
  acquireSpotifyAuthPreparationLease: jest.fn(() => ({ id: "preparation" })),
  clearSpotifyReturnRoute: jest.fn(async () => {}),
  createSpotifyAuthSurfaceInstanceId: jest.fn(() => "music-services-test-surface"),
  isSpotifyAuthOperationLeaseCurrent: jest.fn(() => true),
  isSpotifyAuthPreparationLeaseCurrent: jest.fn(() => true),
  isSpotifyAuthPreparationOwnerCurrent: jest.fn(() => true),
  isSameSpotifyAuthAttempt: jest.fn(() => true),
  isSpotifyAuthAttemptAfterProviderRotation: jest.fn(() => false),
  prepareSpotifyAuthAttempt: jest.fn(async () => null),
  promptSpotifyAuthAttempt: jest.fn(async () => null),
  rebindSpotifyAuthAttemptAuthority: jest.fn((attempt: unknown) => attempt),
  readSpotifyReturnRoute: jest.fn(async () => "/music-services"),
  releaseSpotifyAuthOperationLease: jest.fn(),
  releaseSpotifyAuthPreparationLease: jest.fn(),
  SpotifyAuthStateMismatchError: class SpotifyAuthStateMismatchError extends Error {},
}));

jest.mock("../lib/analytics", () => ({
  classifyAnalyticsFailure: jest.fn(() => "recoverable"),
  recordAnalyticsFailure: jest.fn(async () => {}),
  deleteOwnAnalyticsEvents: () => mockDeleteOwnAnalyticsEvents(),
  readAnalyticsControlState: jest.fn(async () => ({
    enabled: false,
    pendingCloudDeletion: false,
    queuedEventCount: 0,
  })),
  setAnalyticsConsent: jest.fn(async (enabled: boolean) => ({ enabled })),
}));

jest.mock("../lib/data-controls", () => ({
  clearAllCanalData: () => mockClearAllCanalData(),
  exportCanalData: () => mockExportCanalData(),
  getCanalStorageSummary: jest.fn(async () => ({
    estimatedCharacters: 0,
    keyCount: 0,
  })),
}));

import RootLayout from "../app/_layout";
import TabLayout from "../app/(tabs)/_layout";
import NotFoundScreen from "../app/+not-found";
import AuthCallbackScreen from "../app/auth/callback";
import ConnectMusicScreen from "../app/connect-music";
import DataControlsScreen from "../app/data-controls";
import HelpScreen from "../app/help";
import LoginScreen from "../app/login";
import MusicServicesScreen from "../app/music-services";
import OnboardingScreen from "../app/onboarding";
import SettingsScreen from "../app/settings";
import ForgotPasswordScreen from "../app/auth/forgot-password";
import ResetPasswordScreen from "../app/auth/reset-password";
import SpotifyCallbackScreen from "../app/spotify-callback";

async function render(element: ReactElement): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}

describe("Living Editorial shell and auth rendered interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    mockSegments = ["login"];
    mockAuthState = {
      accountEpoch: 1,
      configured: true,
      loading: false,
      session: null,
      user: {
        created_at: "2026-01-01T00:00:00.000Z",
        email: "a@example.test",
        id: "owner-a",
        user_metadata: {},
      },
    };
    mockConnectState = {
      changeAccount: jest.fn(),
      cleanupRecoveryRequired: true,
      connect: jest.fn(),
      isConnecting: false,
      isDisconnecting: false,
      isLoading: false,
      message: "Offline cleanup needs attention.",
      profile: null,
      requestReady: true,
      retryCleanup: mockRetryCleanup,
      statusEvent: null,
    };
  });

  it("uses reduced motion in the account-keyed shell", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: jest.fn() } as never);
    const renderer = await render(<RootLayout />);
    expect(renderer.root.findByType("Stack").props.screenOptions.animation).toBe("none");
    expect(renderer.root.findAll((node) => node.props.allowFontScaling === false)).toHaveLength(0);
  });

  it("fails closed while the reduced-motion preference is unresolved", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: jest.fn() } as never);
    const renderer = await render(<RootLayout />);
    expect(renderer.root.findByType("Stack").props.screenOptions.animation).toBe("none");
  });

  it("renders the account-keyed tab route family with accessible tab controls", async () => {
    const renderer = await render(<TabLayout />);
    expect(renderer.root.findAllByType("TabsScreen").length).toBeGreaterThan(0);
    expect(renderer.root.findAll((node) => node.props.allowFontScaling === false)).toHaveLength(0);
  });

  it("guards duplicate sign-in and preserves auth mode, labels, and recovery route", async () => {
    let resolveSignIn!: (value: unknown) => void;
    mockSignInWithEmail.mockReturnValue(new Promise((resolve) => { resolveSignIn = resolve; }));
    const renderer = await render(<LoginScreen />);
    const signIn = renderer.root.findByProps({ accessibilityLabel: "Sign In to Canal" });
    await act(async () => {
      signIn.props.onPress();
      signIn.props.onPress();
    });
    expect(mockSignInWithEmail).toHaveBeenCalledTimes(1);
    expect(signIn.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(renderer.root.findByProps({ accessibilityLabel: "Continue with Google" }).props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(renderer.root.findByProps({ accessibilityLabel: "Continue with Apple" }).props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(renderer.root.findByProps({ accessibilityLabel: "Sign in mode" }).props.accessibilityState).toEqual({ selected: true });
    expect(StyleSheet.flatten(renderer.root.findByProps({ accessibilityLabel: "Forgot password" }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Forgot password" }).props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/auth/forgot-password");
    await act(async () => {
      resolveSignIn({ user: mockAuthState.user });
      await Promise.resolve();
    });
  });

  it("executes auth deep-link completion and exact callback navigation", async () => {
    await render(<AuthCallbackScreen />);
    expect(mockCompleteSupabaseAuthUrl).toHaveBeenCalledWith("canal://auth/callback?code=test");
    expect(mockRouter.replace).toHaveBeenCalledWith("/login");
  });

  it("exposes an accessible auth-callback recovery action and invokes its exact route", async () => {
    mockCompleteSupabaseAuthUrl.mockRejectedValueOnce(new Error("Expired callback"));
    const renderer = await render(<AuthCallbackScreen />);
    const recovery = renderer.root.findByProps({ accessibilityLabel: "Return to Login" });
    expect(recovery.props.accessibilityRole).toBe("button");
    expect(recovery.props.accessibilityState).toEqual({ disabled: false });
    await act(async () => recovery.props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith("/login");
  });

  it("keeps back and not-found recovery callbacks exact", async () => {
    const help = await render(<HelpScreen />);
    await act(async () => help.root.findAllByProps({ accessibilityRole: "button" })[0].props.onPress());
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    const inline = help.root.findAllByProps({ accessibilityRole: "button" })[1];
    expect(StyleSheet.flatten(inline.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(help.root.findAll((node) => node.props.allowFontScaling === false)).toHaveLength(0);

    const missing = await render(<NotFoundScreen />);
    const buttons = missing.root.findAllByProps({ accessibilityRole: "button" }).filter(
      (button) => typeof button.props.onPress === "function",
    );
    await act(async () => buttons[0].props.onPress());
    await act(async () => buttons[1].props.onPress());
    expect(mockRouter.replace).toHaveBeenNthCalledWith(1, "/(tabs)");
    expect(mockRouter.replace).toHaveBeenNthCalledWith(2, "/(tabs)/explore");
  });

  it("renders offline cleanup retry with busy/disabled accessibility state", async () => {
    const renderer = await render(<ConnectMusicScreen />);
    const retry = renderer.root.findByProps({ accessibilityLabel: "Retry Spotify cleanup" });
    expect(retry.props.accessibilityState).toEqual({ busy: false, disabled: false });
    await act(async () => retry.props.onPress());
    expect(mockRetryCleanup).toHaveBeenCalledTimes(1);

    mockConnectState = { ...mockConnectState, isConnecting: true };
    await act(async () => renderer.update(<ConnectMusicScreen />));
    expect(renderer.root.findByProps({ accessibilityLabel: "Retry Spotify cleanup" }).props.disabled).toBe(true);
  });

  it("replaces connected-account visuals when the account epoch changes", async () => {
    mockConnectState = {
      ...mockConnectState,
      cleanupRecoveryRequired: false,
      profile: { display_name: "Listener A", email: "a@example.test", images: [] },
    };
    const renderer = await render(<ConnectMusicScreen />);
    expect(renderer.root.findAll((node) => node.props.children === "Listener A").length).toBeGreaterThan(0);

    mockAuthState = {
      ...mockAuthState,
      accountEpoch: 2,
      user: { ...mockAuthState.user, id: "owner-b" },
    };
    mockConnectState = {
      ...mockConnectState,
      profile: { display_name: "Listener B", email: "b@example.test", images: [] },
    };
    await act(async () => renderer.update(<ConnectMusicScreen />));
    expect(renderer.root.findAll((node) => node.props.children === "Listener A")).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.children === "Listener B").length).toBeGreaterThan(0);
  });

  it("keeps destructive reset behind confirmation and executes it once", async () => {
    let resolveClear!: () => void;
    mockClearAllCanalData.mockReturnValueOnce(new Promise<void>((resolve) => { resolveClear = resolve; }));
    const alert = jest.spyOn(Alert, "alert");
    const renderer = await render(<DataControlsScreen />);
    const clear = renderer.root.findByProps({ accessibilityLabel: "Clear This Device" });
    await act(async () => clear.props.onPress());
    expect(alert).toHaveBeenCalledTimes(1);
    const options = alert.mock.calls[0][2] as Array<{ style?: string; onPress?: () => void }>;
    const destructive = options.find((option) => option.style === "destructive");
    await act(async () => { destructive?.onPress?.(); await Promise.resolve(); });
    expect(mockClearAllCanalData).toHaveBeenCalledTimes(1);
    const busyClear = renderer.root.findByProps({ accessibilityLabel: "Clear This Device" });
    expect(busyClear.props.accessibilityRole).toBe("button");
    expect(busyClear.props.accessibilityState).toEqual({ busy: true, disabled: true });
    await act(async () => { resolveClear(); await Promise.resolve(); });
  });

  it("exposes exact busy and disabled state for analytics deletion and export", async () => {
    let resolveDelete!: (value: {
      enabled: boolean;
      message: string;
      pendingCloudDeletion: boolean;
      queuedEventCount: number;
    }) => void;
    mockDeleteOwnAnalyticsEvents.mockReturnValueOnce(new Promise((resolve) => { resolveDelete = resolve; }));
    const renderer = await render(<DataControlsScreen />);
    const deleteAnalytics = renderer.root.findByProps({ accessibilityLabel: "Delete Analytics History" });
    await act(async () => { deleteAnalytics.props.onPress(); await Promise.resolve(); });
    expect(renderer.root.findByProps({ accessibilityLabel: "Delete Analytics History" }).props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(renderer.root.findByProps({ accessibilityLabel: "Export Canal Data" }).props.accessibilityState).toEqual({ busy: false, disabled: true });
    await act(async () => {
      resolveDelete({
        enabled: false,
        message: "Analytics history deleted.",
        pendingCloudDeletion: false,
        queuedEventCount: 0,
      });
      await Promise.resolve();
    });

    let resolveExport!: (value: string) => void;
    mockExportCanalData.mockReturnValueOnce(new Promise((resolve) => { resolveExport = resolve; }));
    const exportData = renderer.root.findByProps({ accessibilityLabel: "Export Canal Data" });
    await act(async () => { exportData.props.onPress(); await Promise.resolve(); });
    expect(renderer.root.findByProps({ accessibilityLabel: "Export Canal Data" }).props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(renderer.root.findByProps({ accessibilityLabel: "Clear This Device" }).props.accessibilityState).toEqual({ busy: false, disabled: true });
    await act(async () => { resolveExport("{}"); await Promise.resolve(); });
  });

  it("preserves onboarding navigation through the rendered provider action", async () => {
    const renderer = await render(<OnboardingScreen />);
    const connect = renderer.root.findByProps({ accessibilityLabel: "Connect Spotify" });
    await act(async () => connect.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/connect-music",
      params: { mode: "onboarding" },
    });
    expect(renderer.root.findAll((node) => node.props.allowFontScaling === false)).toHaveLength(0);
  });

  it("invokes settings and music-services navigation handlers without weakening provider gating", async () => {
    const settings = await render(<SettingsScreen />);
    const services = await render(<MusicServicesScreen />);
    await act(async () => settings.root.findByProps({ accessibilityLabel: "Open Spotify settings" }).props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/music-services");
    await act(async () => settings.root.findByProps({ accessibilityLabel: "Open Data Controls" }).props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/data-controls");
    const back = services.root.findByProps({ accessibilityLabel: "Go back" });
    await act(async () => back.props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
    const connect = services.root.findAllByProps({ accessibilityLabel: "Connect Spotify" })[0];
    if (connect) {
      expect(connect.props.accessibilityState.disabled).toBe(connect.props.disabled);
    }
    expect(settings.root.findAll((node) => node.props.allowFontScaling === false)).toHaveLength(0);
    expect(services.root.findAll((node) => node.props.allowFontScaling === false)).toHaveLength(0);
  });

  it("preserves the Spotify callback route handoff", async () => {
    jest.useFakeTimers();
    await render(<SpotifyCallbackScreen />);
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(mockRouter.replace).toHaveBeenCalledWith("/music-services");
    jest.useRealTimers();
  });

  it("synchronously coalesces reset-email submission and exposes busy state", async () => {
    let resolveReset!: () => void;
    mockRequestPasswordReset.mockReturnValue(new Promise<void>((resolve) => { resolveReset = resolve; }));
    const renderer = await render(<ForgotPasswordScreen />);
    const email = renderer.root.findAllByType("TextInput")[0];
    await act(async () => email.props.onChangeText("listener@example.test"));
    const send = renderer.root.findByProps({ accessibilityLabel: "Send Reset Email" });
    await act(async () => {
      send.props.onPress();
      send.props.onPress();
    });
    expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: "Send Reset Email" }).props.accessibilityState).toEqual({ busy: true, disabled: true });
    await act(async () => { resolveReset(); await Promise.resolve(); });
  });

  it("synchronously coalesces password updates and announces busy state", async () => {
    let resolveUpdate!: () => void;
    mockUpdateCanalPassword.mockReturnValue(new Promise<void>((resolve) => { resolveUpdate = resolve; }));
    const renderer = await render(<ResetPasswordScreen />);
    const inputs = renderer.root.findAllByType("TextInput");
    await act(async () => {
      inputs[0].props.onChangeText("a-long-password");
      inputs[1].props.onChangeText("a-long-password");
    });
    const update = renderer.root.findByProps({ accessibilityLabel: "Update Password" });
    await act(async () => {
      update.props.onPress();
      update.props.onPress();
    });
    expect(mockUpdateCanalPassword).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: "Update Password" }).props.accessibilityState).toEqual({ busy: true, disabled: true });
    await act(async () => { resolveUpdate(); await Promise.resolve(); });
  });
});
