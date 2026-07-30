import React from "react";
import {
  AccessibilityInfo,
  Alert,
} from "react-native";

import type {
  ReactElement,
} from "react";

type TestRendererInstance = {
  root: {
    findByProps: (
      props:
        Record<string, unknown>,
    ) => {
      props:
        Record<string, unknown>;
    };
    findByType: (
      type: string,
    ) => {
      props:
        Record<string, unknown>;
    };
  };
  toJSON: () => unknown;
  unmount: () => void;
};

const {
  act,
  create,
} = jest.requireActual(
  "react-test-renderer",
) as {
  act: (
    callback:
      () =>
        | Promise<void>
        | void,
  ) => Promise<void>;
  create: (
    element:
      ReactElement,
  ) => TestRendererInstance;
};

type Deferred<Value> = {
  promise: Promise<Value>;
  reject: (
    error: Error,
  ) => void;
  resolve: (
    value: Value,
  ) => void;
};

function deferred<Value>(): Deferred<Value> {
  let reject:
    (error: Error) => void =
    () => {};

  let resolve:
    (value: Value) => void =
    () => {};

  const promise =
    new Promise<Value>(
      (
        resolvePromise,
        rejectPromise,
      ) => {
        resolve =
          resolvePromise;
        reject =
          rejectPromise;
      },
    );

  return {
    promise,
    reject,
    resolve,
  };
}

const mockAuth = {
  accountEpoch: 1,
  user: {
    created_at:
      "2026-01-01T00:00:00.000Z",
    email:
      "owner@example.test",
    id:
      "owner-a",
    user_metadata: {},
  },
};

let mockAttemptCounter =
  0;

let mockProviderGeneration =
  7;

let mockHeldPrompt:
  Deferred<{
    codeVerifier: string;
    requestState: string;
    response:
      Record<string, unknown>;
  }> | null =
  null;

let mockCurrentReturnAttemptId:
  string | null =
  null;

let mockHookState:
  Record<string, unknown> | null =
  null;

const mockPrepare =
  jest.fn(
    async (
      route: string,
    ) => {
      mockAttemptCounter +=
        1;

      const attemptId =
        `attempt-${mockAttemptCounter}`;

      mockCurrentReturnAttemptId =
        attemptId;

      return {
        attempt: {
          attemptId,
          ownerId:
            mockAuth.user.id,
          sessionGeneration:
            "session-stable",
          spotifyAccountGeneration:
            mockProviderGeneration,
        },
        codeVerifier:
          `verifier-${attemptId}`,
        request: {
          promptAsync:
            jest.fn(),
          state:
            attemptId,
          url:
            `canal://${route}?state=${attemptId}`,
        },
        requestState:
          attemptId,
        requestUrl:
          `canal://${route}?state=${attemptId}`,
      };
    },
  );

const mockPrompt =
  jest.fn(
    async () => {
      if (!mockHeldPrompt) {
        throw new Error(
          "No prompt result was configured.",
        );
      }

      return mockHeldPrompt.promise;
    },
  );

const mockClearRoute =
  jest.fn(
    async (
      attempt: {
        attemptId: string;
      },
    ) => {
      if (
        mockCurrentReturnAttemptId !==
        attempt.attemptId
      ) {
        return false;
      }

      mockCurrentReturnAttemptId =
        null;

      return true;
    },
  );

const mockExchange =
  jest.fn();

const mockFetchProfile =
  jest.fn();

const mockProfileFetch =
  jest.fn();

const mockSaveSession =
  jest.fn();

const mockSyncLibrary =
  jest.fn();

const mockDismiss =
  jest.fn();

const mockAnnounce =
  jest.fn();

const mockAlert =
  jest.fn();

const mockRetryCleanup =
  jest.fn();

jest.mock(
  "expo-router",
  () => {
    const ReactModule =
      jest.requireActual(
        "react",
      ) as typeof React;

    return {
      router: {
        back:
          jest.fn(),
        canGoBack: () =>
          false,
        replace:
          jest.fn(),
      },
      useFocusEffect: (
        callback:
          () =>
            | (() => void)
            | void,
      ) => {
        ReactModule.useEffect(
          callback,
          [],
        );
      },
      useLocalSearchParams:
        () => ({}),
    };
  },
);

jest.mock(
  "expo-auth-session",
  () => ({
    ResponseType: {
      Code: "code",
    },
    exchangeCodeAsync:
      mockExchange,
  }),
);

jest.mock(
  "expo-web-browser",
  () => ({
    dismissAuthSession:
      mockDismiss,
    maybeCompleteAuthSession:
      jest.fn(),
  }),
);

jest.mock(
  "react-native-safe-area-context",
  () => {
    const ReactModule =
      jest.requireActual(
        "react",
      ) as typeof React;

    return {
      SafeAreaView: (
      props:
        Record<string, unknown> & {
          children?: React.ReactNode;
        },
    ) =>
      ReactModule.createElement(
        "SafeAreaView",
        props,
        props.children,
      ),
    };
  },
);

jest.mock(
  "../providers/auth-provider",
  () => ({
    useAuth: () =>
      mockAuth,
  }),
);

jest.mock(
  "../providers/connectivity-provider",
  () => ({
    useConnectivity: () => ({
      refresh:
        jest.fn(
          async () =>
            "online",
        ),
      status:
        "online",
    }),
  }),
);

jest.mock(
  "../hooks/use-reconnect-reload",
  () => ({
    useReconnectReload:
      jest.fn(),
  }),
);

jest.mock(
  "../lib/spotify-config",
  () => ({
    getSpotifyClientId:
      () =>
        "spotify-client",
    getSpotifyRedirectUri:
      () =>
        "canal://spotify-callback",
    SPOTIFY_SCOPES: [
      "playlist-modify-private",
    ],
    spotifyDiscovery: {
      authorizationEndpoint:
        "https://accounts.spotify.test/authorize",
    },
  }),
);

jest.mock(
  "../lib/spotify-auth-return",
  () => {
    const actual =
      jest.requireActual(
        "../lib/spotify-auth-return",
      ) as Record<string, unknown>;

    return {
      ...actual,
      clearSpotifyReturnRoute:
        mockClearRoute,
      prepareSpotifyAuthAttempt:
        mockPrepare,
      promptSpotifyAuthAttempt:
        mockPrompt,
    };
  },
);

jest.mock(
  "../lib/spotify-auth",
  () => {
    const actual =
      jest.requireActual(
        "../lib/spotify-auth",
      ) as Record<string, unknown>;

    return {
      ...actual,
      assertSpotifyAccountScopeCurrent:
        jest.fn(
          async () =>
            undefined,
        ),
      fetchSpotifyProfile:
        mockFetchProfile,
      getMissingSpotifyScopes:
        jest.fn(
          () => [],
        ),
      getValidSpotifySession:
        jest.fn(
          async () =>
            null,
        ),
      saveSpotifySession:
        mockSaveSession,
    };
  },
);

jest.mock(
  "../lib/spotify-library",
  () => ({
    readSpotifyLibrarySnapshot:
      jest.fn(
        async () =>
          null,
      ),
    syncSpotifyLibrary:
      mockSyncLibrary,
  }),
);

jest.mock(
  "../lib/app-session",
  () => ({
    disconnectSpotifyOnly:
      jest.fn(),
    isCanalAccountChangedError:
      () =>
        false,
    isCanalLogoutIncompleteError:
      () =>
        false,
    logoutAllMusicPlatforms:
      jest.fn(),
    retryIncompleteAccountCleanup:
      mockRetryCleanup,
  }),
);

jest.mock(
  "../lib/recovery-issue",
  () => ({
    classifyRecoveryIssue:
      (
        error:
          unknown,
      ) =>
        error
          ? {
            action:
              "retry",
            actionLabel:
              "Retry cleanup",
            body:
              "Retry the scoped cleanup.",
            title:
              "Cleanup needs attention",
          }
          : null,
  }),
);

jest.mock(
  "../components/recovery-notice",
  () => {
    const ReactModule =
      jest.requireActual(
        "react",
      ) as typeof React;

    return {
      RecoveryNotice: (
      props:
        Record<string, unknown>,
    ) =>
      ReactModule.createElement(
        "RecoveryNotice",
        props,
      ),
    };
  },
);

jest.mock(
  "../lib/onboarding",
  () => ({
    isOnboardingRequired:
      jest.fn(
        async () =>
          false,
      ),
    ONBOARDING_METADATA_KEY:
      "onboarding",
  }),
);

jest.spyOn(
  AccessibilityInfo,
  "announceForAccessibility",
).mockImplementation(
  mockAnnounce,
);

jest.spyOn(
  Alert,
  "alert",
).mockImplementation(
  mockAlert,
);

const {
  useSpotifyConnection,
} = jest.requireActual(
  "../hooks/useSpotifyConnection",
) as {
  useSpotifyConnection: (
    route:
      "/connect-music",
  ) =>
    Record<string, unknown>;
};

const {
  default:
    ConnectMusicScreen,
} = jest.requireActual(
  "../app/connect-music",
) as {
  default:
    () => ReactElement;
};

const {
  default:
    MusicServicesScreen,
} = jest.requireActual(
  "../app/music-services",
) as {
  default:
    () => ReactElement;
};

const {
  SpotifyProviderCleanupIncompleteError,
} = jest.requireMock(
  "../lib/spotify-auth",
) as {
  SpotifyProviderCleanupIncompleteError:
    new (
      guard: {
        accountGeneration:
          number;
        configured:
          boolean;
        ownerId:
          string;
      },
      record:
        Record<string, unknown>,
    ) => Error;
};

function HookHarness(): null {
  mockHookState =
    useSpotifyConnection(
      "/connect-music",
    );

  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitFor(
  predicate:
    () => boolean,
): Promise<void> {
  for (
    let attempt =
      0;
    attempt < 30;
    attempt +=
      1
  ) {
    await flush();

    if (predicate()) {
      return;
    }
  }

  throw new Error(
    "The expected caller state did not settle.",
  );
}

async function mount(
  element:
    ReactElement,
): Promise<TestRendererInstance> {
  let renderer:
    TestRendererInstance | null =
    null;

  await act(async () => {
    renderer =
      create(
        element,
      );
  });

  await flush();

  return renderer!;
}

function promptResult(
  outcome:
    | "locked"
    | "reject"
    | "success",
): Deferred<{
  codeVerifier: string;
  requestState: string;
  response:
    Record<string, unknown>;
}> {
  const pending =
    deferred<{
      codeVerifier: string;
      requestState: string;
      response:
        Record<string, unknown>;
    }>();

  if (
    outcome ===
      "reject"
  ) {
    return pending;
  }

  return pending;
}

function resolvePrompt(
  pending:
    Deferred<{
      codeVerifier: string;
      requestState: string;
      response:
        Record<string, unknown>;
    }>,
  outcome:
    | "locked"
    | "success",
  requestState =
    "attempt-a1",
): void {
  pending.resolve({
    codeVerifier:
      `verifier-${requestState}`,
    requestState:
      requestState,
    response:
      outcome ===
        "locked"
        ? {
          type:
            "locked",
        }
        : {
          authentication:
            null,
          errorCode:
            null,
          params: {
            code:
              "late-code-a1",
            state:
              requestState,
          },
          type:
            "success",
          url:
            "canal://spotify-callback",
        },
  });
}

function installDeferredOAuthCommit(
  boundary:
    | "save"
    | "sync",
): {
  credentials: () => string;
  library: () => string;
  releaseFirst: () => void;
  firstStarted: Promise<void>;
} {
  let credentialValue =
    "original-credentials";

  let libraryValue =
    "original-library";

  let authorityValue =
    "original-authority";

  let saveCall =
    0;

  let signalFirst:
    () => void =
      () => {};

  const firstStarted =
    new Promise<void>(
      (resolve) => {
        signalFirst =
          resolve;
      },
    );

  let releaseFirst:
    () => void =
      () => {};

  const firstMayFinish =
    new Promise<void>(
      (resolve) => {
        releaseFirst =
          resolve;
      },
    );

  mockSaveSession.mockImplementation(
    async (
      _session: unknown,
      options: {
        operationCommitGuard?:
          () => boolean;
      } = {},
    ) => {
      saveCall +=
        1;

      const commitGuard =
        options.operationCommitGuard;

      if (
        saveCall ===
          1
      ) {
        if (
          boundary ===
            "sync"
        ) {
          credentialValue =
            "a1-credentials";
          authorityValue =
            "a1-authority";
        }

        signalFirst();
        await firstMayFinish;

        if (
          !commitGuard?.()
        ) {
          if (
            credentialValue ===
              "a1-credentials"
          ) {
            credentialValue =
              "original-credentials";
          }

          if (
            authorityValue ===
              "a1-authority"
          ) {
            authorityValue =
              "original-authority";
          }

          throw new Error(
            "Spotify connection changed",
          );
        }

        credentialValue =
          "a1-credentials";
        authorityValue =
          "a1-authority";
        libraryValue =
          "a1-library";
      } else {
        expect(
          commitGuard?.(),
        ).toBe(true);

        credentialValue =
          "a2-credentials";
        authorityValue =
          "a2-authority";
        libraryValue =
          "a2-library";
      }

      return {
        accountGeneration:
          mockProviderGeneration,
        configured:
          true,
        ownerId:
          mockAuth.user.id,
      };
    },
  );

  return {
    credentials:
      () =>
        `${credentialValue}:${authorityValue}`,
    library:
      () =>
        libraryValue,
    releaseFirst,
    firstStarted,
  };
}

function resetScenario(): void {
  mockAttemptCounter =
    0;
  mockProviderGeneration =
    7;
  mockCurrentReturnAttemptId =
    null;
  mockHeldPrompt =
    null;
  mockHookState =
    null;

  mockPrepare.mockClear();
  mockPrompt.mockClear();
  mockClearRoute.mockClear();
  mockExchange.mockReset();
  mockFetchProfile.mockReset();
  mockProfileFetch.mockReset();
  mockSaveSession.mockReset();
  mockSyncLibrary.mockReset();
  mockDismiss.mockClear();
  mockAnnounce.mockClear();
  mockAlert.mockClear();
  mockRetryCleanup.mockReset();

  mockExchange.mockResolvedValue({
    accessToken:
      "access-b",
    expiresIn:
      3600,
    refreshToken:
      "refresh-b",
    scope:
      "playlist-modify-private",
    tokenType:
      "Bearer",
  });
  mockFetchProfile.mockResolvedValue({
    display_name:
      "Spotify B",
    id:
      "spotify-b",
  });
  mockProfileFetch.mockResolvedValue({
    json:
      async () => ({
        display_name:
          "Spotify B",
        id:
          "spotify-b",
      }),
    ok: true,
  });
  global.fetch =
    mockProfileFetch as
      unknown as
      typeof fetch;
  mockSaveSession.mockResolvedValue({
    accountGeneration:
      mockProviderGeneration,
    configured:
      true,
    ownerId:
      mockAuth.user.id,
  });
  mockSyncLibrary.mockResolvedValue(
    {},
  );
  mockRetryCleanup.mockResolvedValue(
    null,
  );
}

describe(
  "Spotify OAuth real caller lifecycle",
  () => {
    beforeEach(() => {
      resetScenario();
    });

    it.each(
      [
        "success",
        "reject",
        "locked",
      ] as const,
    )(
      "keeps the remounted hook untouched when A1 settles %s",
      async (outcome) => {
        const pending =
          promptResult(
            outcome,
          );

        mockHeldPrompt =
          pending;

        const first =
          await mount(
            React.createElement(
              HookHarness,
            ),
          );

        const connectA1 =
          mockHookState
            ?.connect as
            () => Promise<void>;

        let connection:
          Promise<void> =
          Promise.resolve();

        await act(async () => {
          connection =
            connectA1();
          await Promise.resolve();
        });

        await act(async () => {
          first.unmount();
        });

        const second =
          await mount(
            React.createElement(
              HookHarness,
            ),
          );

        const frozenA2 =
          JSON.stringify({
            message:
              mockHookState
                ?.message,
            profile:
              mockHookState
                ?.profile,
            requestReady:
              mockHookState
                ?.requestReady,
            route:
              mockCurrentReturnAttemptId,
            statusEvent:
              mockHookState
                ?.statusEvent,
          });

        mockExchange.mockClear();
        mockFetchProfile.mockClear();
        mockSaveSession.mockClear();
        mockSyncLibrary.mockClear();
        mockDismiss.mockClear();
        mockAnnounce.mockClear();
        mockAlert.mockClear();
        mockClearRoute.mockClear();

        if (
          outcome ===
            "reject"
        ) {
          pending.reject(
            new Error(
              "late A1 prompt failed",
            ),
          );
        } else {
          resolvePrompt(
            pending,
            outcome,
          );
        }

        await act(async () => {
          await connection;
        });
        await flush();

        expect(
          JSON.stringify({
            message:
              mockHookState
                ?.message,
            profile:
              mockHookState
                ?.profile,
            requestReady:
              mockHookState
                ?.requestReady,
            route:
              mockCurrentReturnAttemptId,
            statusEvent:
              mockHookState
                ?.statusEvent,
          }),
        ).toBe(
          frozenA2,
        );
        expect(
          mockExchange,
        ).not.toHaveBeenCalled();
        expect(
          mockFetchProfile,
        ).not.toHaveBeenCalled();
        expect(
          mockSaveSession,
        ).not.toHaveBeenCalled();
        expect(
          mockSyncLibrary,
        ).not.toHaveBeenCalled();
        expect(
          mockDismiss,
        ).not.toHaveBeenCalled();
        expect(
          mockAnnounce,
        ).not.toHaveBeenCalled();
        expect(
          mockAlert,
        ).not.toHaveBeenCalled();
        expect(
          mockClearRoute,
        ).not.toHaveBeenCalled();

        await act(async () => {
          second.unmount();
        });
      },
    );

    it.each(
      [
        "success",
        "reject",
        "locked",
      ] as const,
    )(
      "keeps the remounted Music Services screen untouched when A1 settles %s",
      async (outcome) => {
        const pending =
          promptResult(
            outcome,
          );

        mockHeldPrompt =
          pending;

        const first =
          await mount(
            React.createElement(
              MusicServicesScreen,
            ),
          );

        const connectButton =
          first.root.findByProps({
            accessibilityLabel:
              "Connect Spotify",
          });

        await act(async () => {
          (
            connectButton
              .props
              .onPress as
              () => void
          )();
          await Promise.resolve();
        });

        await act(async () => {
          first.unmount();
        });

        const second =
          await mount(
            React.createElement(
              MusicServicesScreen,
            ),
          );

        const frozenA2 =
          JSON.stringify({
            route:
              mockCurrentReturnAttemptId,
            tree:
              second.toJSON(),
          });

        mockExchange.mockClear();
        mockFetchProfile.mockClear();
        mockSaveSession.mockClear();
        mockSyncLibrary.mockClear();
        mockDismiss.mockClear();
        mockAnnounce.mockClear();
        mockAlert.mockClear();
        mockClearRoute.mockClear();

        if (
          outcome ===
            "reject"
        ) {
          pending.reject(
            new Error(
              "late A1 prompt failed",
            ),
          );
        } else {
          resolvePrompt(
            pending,
            outcome,
          );
        }

        await flush();
        await flush();

        expect(
          JSON.stringify({
            route:
              mockCurrentReturnAttemptId,
            tree:
              second.toJSON(),
          }),
        ).toBe(
          frozenA2,
        );
        expect(
          mockExchange,
        ).not.toHaveBeenCalled();
        expect(
          mockFetchProfile,
        ).not.toHaveBeenCalled();
        expect(
          mockSaveSession,
        ).not.toHaveBeenCalled();
        expect(
          mockSyncLibrary,
        ).not.toHaveBeenCalled();
        expect(
          mockDismiss,
        ).not.toHaveBeenCalled();
        expect(
          mockAnnounce,
        ).not.toHaveBeenCalled();
        expect(
          mockAlert,
        ).not.toHaveBeenCalled();
        expect(
          mockClearRoute,
        ).not.toHaveBeenCalled();

        await act(async () => {
          second.unmount();
        });
      },
    );

    it.each(
      [
        "save",
        "sync",
      ] as const,
    )(
      "keeps A2 hook credentials and library byte-stable when A1 loses its lease during deferred %s",
      async (boundary) => {
        const scenario =
          installDeferredOAuthCommit(
            boundary,
          );

        const firstPrompt =
          promptResult(
            "success",
          );

        mockHeldPrompt =
          firstPrompt;

        const first =
          await mount(
            React.createElement(
              HookHarness,
            ),
          );

        const firstAttempt =
          mockCurrentReturnAttemptId!;

        let firstConnection:
          Promise<void> =
          Promise.resolve();

        await act(async () => {
          firstConnection =
            (
              mockHookState
                ?.connect as
                () => Promise<void>
            )();
          await Promise.resolve();
          resolvePrompt(
            firstPrompt,
            "success",
            firstAttempt,
          );
        });

        await scenario.firstStarted;

        await act(async () => {
          first.unmount();
        });

        const secondPrompt =
          promptResult(
            "success",
          );

        mockHeldPrompt =
          secondPrompt;

        const second =
          await mount(
            React.createElement(
              HookHarness,
            ),
          );

        const secondAttempt =
          mockCurrentReturnAttemptId!;

        let secondConnection:
          Promise<void> =
          Promise.resolve();

        await act(async () => {
          secondConnection =
            (
              mockHookState
                ?.connect as
                () => Promise<void>
            )();
          await Promise.resolve();
          resolvePrompt(
            secondPrompt,
            "success",
            secondAttempt,
          );
        });

        await act(async () => {
          await secondConnection;
        });

        await waitFor(
          () =>
            scenario.credentials() ===
              "a2-credentials:a2-authority" &&
            scenario.library() ===
              "a2-library",
        );

        const frozenA2 =
          JSON.stringify({
            credentials:
              scenario.credentials(),
            library:
              scenario.library(),
            route:
              mockCurrentReturnAttemptId,
            state:
              mockHookState,
          });

        mockClearRoute.mockClear();
        mockDismiss.mockClear();
        mockAnnounce.mockClear();
        mockAlert.mockClear();

        scenario.releaseFirst();

        await act(async () => {
          await firstConnection;
        });
        await flush();

        expect(
          JSON.stringify({
            credentials:
              scenario.credentials(),
            library:
              scenario.library(),
            route:
              mockCurrentReturnAttemptId,
            state:
              mockHookState,
          }),
        ).toBe(
          frozenA2,
        );
        expect(
          mockClearRoute,
        ).not.toHaveBeenCalled();
        expect(
          mockDismiss,
        ).not.toHaveBeenCalled();
        expect(
          mockAnnounce,
        ).not.toHaveBeenCalled();
        expect(
          mockAlert,
        ).not.toHaveBeenCalled();

        await act(async () => {
          second.unmount();
        });
      },
    );

    it.each(
      [
        "save",
        "sync",
      ] as const,
    )(
      "keeps A2 Music Services state byte-stable when A1 loses its lease during deferred %s",
      async (boundary) => {
        const scenario =
          installDeferredOAuthCommit(
            boundary,
          );

        const firstPrompt =
          promptResult(
            "success",
          );

        mockHeldPrompt =
          firstPrompt;

        const first =
          await mount(
            React.createElement(
              MusicServicesScreen,
            ),
          );

        const firstAttempt =
          mockCurrentReturnAttemptId!;

        await act(async () => {
          (
            first.root.findByProps({
              accessibilityLabel:
                "Connect Spotify",
            }).props
              .onPress as
              () => void
          )();
          await Promise.resolve();
          resolvePrompt(
            firstPrompt,
            "success",
            firstAttempt,
          );
        });

        await scenario.firstStarted;

        await act(async () => {
          first.unmount();
        });

        const secondPrompt =
          promptResult(
            "success",
          );

        mockHeldPrompt =
          secondPrompt;

        const second =
          await mount(
            React.createElement(
              MusicServicesScreen,
            ),
          );

        const secondAttempt =
          mockCurrentReturnAttemptId!;

        await act(async () => {
          (
            second.root.findByProps({
              accessibilityLabel:
                "Connect Spotify",
            }).props
              .onPress as
              () => void
          )();
          await Promise.resolve();
          resolvePrompt(
            secondPrompt,
            "success",
            secondAttempt,
          );
        });

        await waitFor(
          () =>
            scenario.credentials() ===
              "a2-credentials:a2-authority" &&
            scenario.library() ===
              "a2-library",
        );

        const frozenA2 =
          JSON.stringify({
            credentials:
              scenario.credentials(),
            library:
              scenario.library(),
            route:
              mockCurrentReturnAttemptId,
            tree:
              second.toJSON(),
          });

        mockClearRoute.mockClear();
        mockDismiss.mockClear();
        mockAnnounce.mockClear();
        mockAlert.mockClear();

        scenario.releaseFirst();

        await flush();
        await flush();

        expect(
          JSON.stringify({
            credentials:
              scenario.credentials(),
            library:
              scenario.library(),
            route:
              mockCurrentReturnAttemptId,
            tree:
              second.toJSON(),
          }),
        ).toBe(
          frozenA2,
        );
        expect(
          mockClearRoute,
        ).not.toHaveBeenCalled();
        expect(
          mockDismiss,
        ).not.toHaveBeenCalled();
        expect(
          mockAnnounce,
        ).not.toHaveBeenCalled();
        expect(
          mockAlert,
        ).not.toHaveBeenCalled();

        await act(async () => {
          second.unmount();
        });
      },
    );

    it(
      "holds the hook in owner-scoped recovery until cleanup retry succeeds",
      async () => {
        const pending =
          promptResult(
            "success",
          );

        mockHeldPrompt =
          pending;

        mockSaveSession.mockImplementation(
          async () => {
            mockProviderGeneration =
              8;

            throw new SpotifyProviderCleanupIncompleteError(
              {
                accountGeneration:
                  8,
                configured:
                  true,
                ownerId:
                  mockAuth.user.id,
              },
              cleanupRecord(),
            );
          },
        );

        const renderer =
          await mount(
            React.createElement(
              HookHarness,
            ),
          );

        const initialPrepareCount =
          mockPrepare.mock.calls
            .length;

        let connection:
          Promise<void> =
          Promise.resolve();

        await act(async () => {
          connection =
            (
              mockHookState
                ?.connect as
                () => Promise<void>
            )();
          await Promise.resolve();
        });

        resolvePrompt(
          pending,
          "success",
        );

        await act(async () => {
          await connection;
        });

        expect(
          mockHookState
            ?.cleanupRecoveryRequired,
        ).toBe(true);
        expect(
          mockHookState
            ?.isConnecting,
        ).toBe(false);
        expect(
          mockHookState
            ?.profile,
        ).toBeNull();
        expect(
          mockPrepare,
        ).toHaveBeenCalledTimes(
          initialPrepareCount,
        );
        expect(
          mockSaveSession,
        ).toHaveBeenCalledTimes(
          1,
        );
        expect(
          mockClearRoute,
        ).toHaveBeenCalledTimes(
          1,
        );

        mockRetryCleanup.mockResolvedValue({
          cleanupIncomplete:
            null,
        });

        await act(async () => {
          await (
            mockHookState
              ?.retryCleanup as
              () => Promise<void>
          )();
        });

        expect(
          mockHookState
            ?.cleanupRecoveryRequired,
        ).toBe(false);
        expect(
          mockPrepare,
        ).toHaveBeenCalledTimes(
          initialPrepareCount +
            1,
        );

        await act(async () => {
          renderer.unmount();
        });
      },
    );

    it(
      "rediscovers durable hook cleanup after remount before another prompt can start",
      async () => {
        mockRetryCleanup.mockResolvedValueOnce({
          cleanupIncomplete:
            cleanupRecord(),
        });

        const renderer =
          await mount(
            React.createElement(
              HookHarness,
            ),
          );

        await waitFor(
          () =>
            mockHookState
              ?.cleanupRecoveryRequired ===
            true,
        );

        expect(
          mockHookState
            ?.requestReady,
        ).toBe(false);
        expect(
          mockHookState
            ?.message,
        ).toContain(
          "Retry cleanup for this Canal account.",
        );
        expect(
          mockPrompt,
        ).not.toHaveBeenCalled();

        mockRetryCleanup.mockResolvedValueOnce(
          null,
        );

        await act(async () => {
          await (
            mockHookState
              ?.retryCleanup as
              () => Promise<void>
          )();
        });

        expect(
          mockHookState
            ?.cleanupRecoveryRequired,
        ).toBe(false);
        expect(
          mockHookState
            ?.requestReady,
        ).toBe(true);

        await act(async () => {
          renderer.unmount();
        });
      },
    );

    it(
      "announces current Connect Music cleanup once and suppresses the same durable event after remount",
      async () => {
        mockRetryCleanup.mockResolvedValue({
          cleanupIncomplete:
            cleanupRecord(),
        });

        const first =
          await mount(
            React.createElement(
              ConnectMusicScreen,
            ),
          );

        const cleanupMessage =
          "Spotify account cleanup must finish before another account can connect. Retry cleanup for this Canal account.";

        await waitFor(
          () =>
            mockAnnounce
              .mock.calls.filter(
                ([message]) =>
                  message ===
                  cleanupMessage,
              ).length ===
            1,
        );

        expect(
          first.root.findByProps({
            accessibilityLabel:
              "Retry Spotify cleanup",
          }).props.disabled,
        ).toBe(false);

        await act(async () => {
          first.unmount();
        });

        const second =
          await mount(
            React.createElement(
              ConnectMusicScreen,
            ),
          );

        await waitFor(
          () => {
            try {
              second.root.findByProps({
                accessibilityLabel:
                  "Retry Spotify cleanup",
              });

              return true;
            } catch {
              return false;
            }
          },
        );

        expect(
          mockAnnounce
            .mock.calls.filter(
              ([message]) =>
                message ===
                cleanupMessage,
            ),
        ).toHaveLength(
          1,
        );

        await act(async () => {
          second.unmount();
        });
      },
    );

    it(
      "holds Music Services in owner-scoped recovery until cleanup retry succeeds",
      async () => {
        const pending =
          promptResult(
            "success",
          );

        mockHeldPrompt =
          pending;

        mockSaveSession.mockImplementation(
          async () => {
            mockProviderGeneration =
              8;

            throw new SpotifyProviderCleanupIncompleteError(
              {
                accountGeneration:
                  8,
                configured:
                  true,
                ownerId:
                  mockAuth.user.id,
              },
              cleanupRecord(),
            );
          },
        );

        const renderer =
          await mount(
            React.createElement(
              MusicServicesScreen,
            ),
          );

        const initialPrepareCount =
          mockPrepare.mock.calls
            .length;

        const connectButton =
          renderer.root.findByProps({
            accessibilityLabel:
              "Connect Spotify",
          });

        await act(async () => {
          (
            connectButton
              .props
              .onPress as
              () => void
          )();
          await Promise.resolve();
        });

        resolvePrompt(
          pending,
          "success",
        );

        await waitFor(
          () => {
            return mockAnnounce
              .mock.calls.some(
                ([message]) =>
                  message ===
                  "Spotify account cleanup must finish before another account can connect. Retry cleanup for this Canal account.",
              );
          },
        );

        expect(
          mockAnnounce.mock.calls,
        ).toContainEqual([
          "Spotify account cleanup must finish before another account can connect. Retry cleanup for this Canal account.",
        ]);

        const recovery =
          renderer.root.findByType(
            "RecoveryNotice",
          );

        expect(
          JSON.stringify(
            renderer.toJSON(),
          ),
        ).toContain(
          "The replacement Spotify account was not saved.",
        );

        const blockedConnect =
          renderer.root.findByProps({
            accessibilityLabel:
              "Connect Spotify",
          });

        expect(
          blockedConnect.props
            .disabled,
        ).toBe(true);
        expect(
          (
            blockedConnect.props
              .accessibilityState as {
              disabled:
                boolean;
            }
          ).disabled,
        ).toBe(true);

        const promptCountBeforeBlockedPress =
          mockPrompt.mock.calls
            .length;

        await act(async () => {
          (
            blockedConnect
              .props
              .onPress as
              () => void
          )();
          await Promise.resolve();
        });

        expect(
          mockPrompt,
        ).toHaveBeenCalledTimes(
          promptCountBeforeBlockedPress,
        );

        expect(
          mockPrepare,
        ).toHaveBeenCalledTimes(
          initialPrepareCount,
        );
        expect(
          mockSaveSession,
        ).toHaveBeenCalledTimes(
          1,
        );
        expect(
          mockClearRoute,
        ).toHaveBeenCalledTimes(
          1,
        );

        mockRetryCleanup.mockResolvedValue({
          cleanupIncomplete:
            null,
        });

        await act(async () => {
          await (
            recovery.props
              .onAction as
              () => Promise<void>
          )();
        });

        expect(
          mockPrepare,
        ).toHaveBeenCalledTimes(
          initialPrepareCount +
            1,
        );

        await act(async () => {
          renderer.unmount();
        });
      },
    );
  },
);

function cleanupRecord(): Record<
  string,
  unknown
> {
  return {
    action:
      "authority-rotation",
    cacheKeys: [],
    cleanupId:
      "cleanup-owner-a-session-stable-7",
    ownerId:
      mockAuth.user.id,
    phase:
      "cleanup-pending",
    sessionGeneration:
      "session-stable",
    sourceSpotifyAccountGeneration:
      7,
    sourceSpotifyProfileId:
      "spotify-a",
    spotifyAccountGeneration:
      8,
    targets: [
      "spotify-cache-scan",
    ],
    updatedAt:
      "2026-07-30T00:00:00.000Z",
    version: 2,
  };
}
