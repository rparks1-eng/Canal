import React from "react";

import type {
  ReactElement,
} from "react";

type TestRenderer = {
  root: {
    findAll: (
      predicate: (
        node: {
          props: Record<string, unknown>;
        },
      ) => boolean,
    ) => Array<{
      props: Record<string, unknown>;
    }>;
  };
  toJSON: () => unknown;
  unmount: () => void;
  update: (
    element: ReactElement,
  ) => void;
};

const {
  act,
  create,
} = jest.requireActual(
  "react-test-renderer",
) as {
  act: (
    callback: () => Promise<void> | void,
  ) => Promise<void>;
  create: (
    element: ReactElement,
  ) => TestRenderer;
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
  let reject: (error: Error) => void =
    () => {};

  let resolve: (value: Value) => void =
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

const OWNER_ID =
  "00000000-0000-4000-8000-000000000101";

const mockAlert =
  jest.fn();

jest.mock(
  "../lib/canal-alert",
  () => ({
    CanalAlert: {
      alert: (...args: unknown[]) =>
        mockAlert(...args),
    },
  }),
);

const mockAnnounce =
  jest.fn();

const mockCaptureAccount =
  jest.fn();

const mockConnectivityRefresh =
  jest.fn(
    async () =>
      "online",
  );

const mockListCollections =
  jest.fn();

const mockListRunSheets =
  jest.fn();

const mockLoadRunSheet =
  jest.fn();

const mockRouter = {
  back:
    jest.fn(),
  canGoBack:
    jest.fn(
      () => false,
    ),
  push:
    jest.fn(),
  replace:
    jest.fn(),
};

const mockSaveRunSheet =
  jest.fn();

const mockStartRunSheet =
  jest.fn();

const mockAdvanceRunSheet =
  jest.fn();

const mockCompleteRunSheet =
  jest.fn();

const mockDeleteRunSheet =
  jest.fn();

let mockAuth = {
  accountEpoch:
    1,
  user: {
    id:
      OWNER_ID,
  },
};

let mockParams: {
  collectionId?: string;
  runSheetId?: string;
} = {};

jest.mock(
  "expo-router",
  () => {
    const ReactModule =
      jest.requireActual(
        "react",
      ) as typeof React;

    return {
      router:
        mockRouter,
      useFocusEffect: (
        callback: () => void | (() => void),
      ) => {
        ReactModule.useEffect(
          callback,
          [
            callback,
          ],
        );
      },
      useLocalSearchParams:
        () =>
          mockParams,
    };
  },
);

jest.mock(
  "react-native",
  () => {
    const ReactModule =
      jest.requireActual(
        "react",
      ) as typeof React;

    const nativeHost =
      (name: string) =>
        ReactModule.forwardRef(
          (
            props: {
              children?: React.ReactNode;
            },
            ref,
          ) =>
            ReactModule.createElement(
              name,
              {
                ...props,
                ref,
              },
              props.children,
            ),
        );

    return {
      AccessibilityInfo: {
        announceForAccessibility:
          mockAnnounce,
        setAccessibilityFocus:
          mockAnnounce,
      },
      ActivityIndicator:
        nativeHost(
          "ActivityIndicator",
        ),
      Alert: {
        alert:
          mockAlert,
      },
      findNodeHandle:
        jest.fn(
          () => 42,
        ),
      Platform: {
        OS:
          "web",
      },
      Pressable:
        nativeHost(
          "Pressable",
        ),
      ScrollView:
        nativeHost(
          "ScrollView",
        ),
      StyleSheet: {
        create: <Value,>(
          styles: Value,
        ) =>
          styles,
        hairlineWidth:
          1,
      },
      Text:
        nativeHost(
          "Text",
        ),
      TextInput:
        nativeHost(
          "TextInput",
        ),
      View:
        nativeHost(
          "View",
        ),
    };
  },
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
        props: {
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
  "@react-native-community/datetimepicker",
  () =>
    "DateTimePicker",
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
        props: Record<string, unknown>,
      ) =>
        ReactModule.createElement(
          "RecoveryNotice",
          props,
        ),
    };
  },
);

jest.mock(
  "../hooks/use-reconnect-reload",
  () => ({
    useReconnectReload:
      jest.fn(),
  }),
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
        mockConnectivityRefresh,
      status:
        "online",
    }),
  }),
);

jest.mock(
  "../lib/event-run-sheet-datetime",
  () => ({
    eventRunSheetLocalDateTimeFromInstant:
      () =>
        "2026-08-01T19:00",
    formatEventRunSheetInstant:
      () =>
        "Aug 1, 2026, 7:00 PM",
    resolveEventRunSheetLocalDateTime:
      () => ({
        instant:
          "2026-08-01T23:00:00.000Z",
        overlap:
          "none",
      }),
    resolvedEventRunSheetTimeZone:
      () =>
        "America/New_York",
  }),
);

jest.mock(
  "../lib/event-run-sheets",
  () => ({
    advanceEventRunSheet:
      mockAdvanceRunSheet,
    captureEventRunSheetAccount:
      mockCaptureAccount,
    completeEventRunSheet:
      mockCompleteRunSheet,
    deleteEventRunSheet:
      mockDeleteRunSheet,
    listOwnEventRunSheets:
      mockListRunSheets,
    loadEventRunSheet:
      mockLoadRunSheet,
    saveEventRunSheet:
      mockSaveRunSheet,
    startEventRunSheet:
      mockStartRunSheet,
  }),
);

jest.mock(
  "../lib/scene-collections",
  () => ({
    listOwnSceneCollections:
      mockListCollections,
  }),
);

const EventRunSheetHubScreen =
  require(
    "../app/event-run-sheets/index",
  ).default as React.ComponentType;

const EventRunSheetBuilderScreen =
  require(
    "../app/event-run-sheets/new",
  ).default as React.ComponentType;

const EventRunSheetDetailScreen =
  require(
    "../app/event-run-sheets/[runSheetId]",
  ).default as React.ComponentType;

function accountForCurrentAuth(): {
  accountEpoch: number;
  sessionGeneration: string;
  userId: string;
} {
  return {
    accountEpoch:
      mockAuth.accountEpoch,
    sessionGeneration:
      `session:${mockAuth.user.id}:${mockAuth.accountEpoch}`,
    userId:
      mockAuth.user.id,
  };
}

function collection(
  title: string,
): Record<string, unknown> {
  return {
    id:
      "00000000-0000-4000-8000-000000000201",
    isPublic:
      false,
    sceneCount:
      2,
    title,
  };
}

function runSheet(
  title: string,
  status: "planned" | "running" | "completed" = "running",
): Record<string, unknown> {
  return {
    activePosition:
      0,
    collectionId:
      "00000000-0000-4000-8000-000000000201",
    completedAt:
      null,
    createdAt:
      "2026-08-01T20:00:00.000Z",
    id:
      "00000000-0000-4000-8000-000000000301",
    ownerId:
      OWNER_ID,
    sourceCollectionTitle:
      "Private collection",
    startedAt:
      status === "planned"
        ? null
        : "2026-08-01T23:00:00.000Z",
    startsAt:
      "2026-08-01T23:00:00.000Z",
    status,
    timeZone:
      "America/New_York",
    title,
    updatedAt:
      "2026-08-01T20:00:00.000Z",
    venueLabel:
      "Canal Hall",
    version:
      2,
  };
}

function runSheetDetail(
  title: string,
  itemCount =
    1,
): Record<string, unknown> {
  return {
    ...runSheet(
      title,
    ),
    items:
      Array.from(
        {
          length:
            itemCount,
        },
        (
          _,
          position,
        ) => ({
          activityLabel:
            "Dinner",
          createdAt:
            "2026-08-01T20:00:00.000Z",
          durationLabel:
            "30 min",
          position,
          runSheetId:
            "00000000-0000-4000-8000-000000000301",
          sceneId:
            `00000000-0000-4000-8000-${(401 + position).toString().padStart(12, "0")}`,
          sceneRevision:
            1,
          title:
            `${title} Scene ${position + 1}`,
          trackCount:
            4,
        }),
      ),
  };
}

function renderedText(
  renderer: TestRenderer,
): string {
  return JSON.stringify(
    renderer.toJSON(),
  );
}

async function flushEffects(): Promise<void> {
  await act(
    async () => {
      for (
        let turn =
          0;
        turn <
        12;
        turn +=
          1
      ) {
        await Promise.resolve();
      }
    },
  );
}

async function settle<Value>(
  pending: Deferred<Value>,
  result:
    | {
        kind: "resolve";
        value: Value;
      }
    | {
        error: Error;
        kind: "reject";
      },
): Promise<void> {
  await act(
    async () => {
      if (
        result.kind ===
        "resolve"
      ) {
        pending.resolve(
          result.value,
        );
      } else {
        pending.reject(
          result.error,
        );
      }

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  );
}

async function renderRoute(
  Route: React.ComponentType,
): Promise<TestRenderer> {
  let renderer: TestRenderer | null =
    null;

  await act(
    async () => {
      renderer =
        create(
          React.createElement(
            Route,
          ),
        );

      await Promise.resolve();
      await Promise.resolve();
    },
  );

  if (!renderer) {
    throw new Error(
      "Route did not render.",
    );
  }

  return renderer;
}

function controlPress(
  renderer: TestRenderer,
  accessibilityLabel: string,
): () => void {
  const control =
    renderer.root
      .findAll(
        (node) =>
          node.props
            .accessibilityLabel ===
            accessibilityLabel &&
          typeof node.props
            .onPress ===
            "function",
      )
      [0];

  if (!control) {
    throw new Error(
      `Could not find ${accessibilityLabel}.`,
    );
  }

  return control.props
    .onPress as () => void;
}

async function pressControl(
  renderer: TestRenderer,
  accessibilityLabel: string,
): Promise<void> {
  const press =
    controlPress(
      renderer,
      accessibilityLabel,
    );

  await act(
    async () => {
      press();
      await Promise.resolve();
      await Promise.resolve();
    },
  );
}

async function changeText(
  renderer: TestRenderer,
  accessibilityLabel: string,
  value: string,
): Promise<void> {
  const input =
    renderer.root
      .findAll(
        (node) =>
          node.props
            .accessibilityLabel ===
            accessibilityLabel &&
          typeof node.props
            .onChangeText ===
            "function",
      )
      [0];

  if (!input) {
    throw new Error(
      `Could not find ${accessibilityLabel}.`,
    );
  }

  const onChangeText =
    input.props
      .onChangeText as (next: string) => void;

  await act(
    async () => {
      onChangeText(
        value,
      );
      await Promise.resolve();
    },
  );
}

async function confirmAlertAction(
  label: string,
): Promise<void> {
  const actions =
    mockAlert.mock.calls[
      mockAlert.mock.calls.length -
        1
    ]?.[2] as
      | Array<{
          onPress?: () => void;
          text?: string;
        }>
      | undefined;

  const action =
    actions?.find(
      (candidate) =>
        candidate.text ===
        label,
    );

  if (!action?.onPress) {
    throw new Error(
      `Could not confirm ${label}.`,
    );
  }

  await act(
    async () => {
      action.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  );
}

function expectStaleMutationToBeInert(
  renderer: TestRenderer,
  before: string,
): void {
  expect(
    renderedText(
      renderer,
    ),
  ).toBe(
    before,
  );
  expect(
    mockRouter.push,
  ).not.toHaveBeenCalled();
  expect(
    mockRouter.replace,
  ).not.toHaveBeenCalled();
  expect(
    mockAnnounce,
  ).not.toHaveBeenCalled();
  expectNoRecoveryOrStaleContent(
    renderer,
  );
}

function switchToA2(
  renderer: TestRenderer,
  Route: React.ComponentType,
): Promise<void> {
  mockAuth = {
    accountEpoch:
      2,
    user: {
      id:
        OWNER_ID,
    },
  };

  return act(
    async () => {
      renderer.update(
        React.createElement(
          Route,
        ),
      );

      await Promise.resolve();
      await Promise.resolve();
    },
  );
}

function unmountRoute(
  renderer: TestRenderer,
): Promise<void> {
  return act(
    async () => {
      renderer.unmount();
      await Promise.resolve();
    },
  );
}

function expectNoRecoveryOrStaleContent(
  renderer: TestRenderer,
): void {
  const text =
    renderedText(
      renderer,
    );

  expect(
    text,
  ).not.toContain(
    "A1_PRIVATE",
  );
  expect(
    text,
  ).not.toContain(
    "A1_ONLY_ERROR",
  );
  expect(
    renderer.root.findAll(
      (node) =>
        node.props
          .accessibilityRole ===
        "header",
    ).length,
  ).toBeGreaterThan(
    0,
  );
}

describe(
  "Event Run Sheet route account-epoch isolation",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockAuth = {
        accountEpoch:
          1,
        user: {
          id:
            OWNER_ID,
        },
      };
      mockParams = {};
      mockCaptureAccount.mockImplementation(
        async () =>
          accountForCurrentAuth(),
      );
      mockLoadRunSheet.mockResolvedValue(
        null,
      );
      mockListCollections.mockResolvedValue(
        [],
      );
      mockListRunSheets.mockResolvedValue(
        [],
      );
    });

    afterEach(() => {
      mockParams = {};
    });

    it.each([
      "success",
      "error",
    ] as const)(
      "keeps a hub A2 tree inert when a late A1 read settles as %s",
      async (outcome) => {
        const first =
          deferred<
            Record<string, unknown>[]
          >();
        const second =
          deferred<
            Record<string, unknown>[]
          >();

        mockListRunSheets
          .mockImplementationOnce(
            () =>
              first.promise,
          )
          .mockImplementationOnce(
            () =>
              second.promise,
          );

        const renderer =
          await renderRoute(
            EventRunSheetHubScreen,
          );

        await switchToA2(
          renderer,
          EventRunSheetHubScreen,
        );

        const beforeLateA1 =
          renderedText(
            renderer,
          );

        await settle(
          first,
          outcome === "success"
            ? {
                kind: "resolve",
                value: [
                  runSheet(
                    "A1_PRIVATE",
                  ),
                ],
              }
            : {
                error:
                  new Error(
                    "A1_ONLY_ERROR",
                  ),
                kind: "reject",
              },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toBe(
          beforeLateA1,
        );
        expect(
          mockRouter.push,
        ).not.toHaveBeenCalled();
        expect(
          mockRouter.replace,
        ).not.toHaveBeenCalled();
        expect(
          mockAnnounce,
        ).not.toHaveBeenCalled();
        expectNoRecoveryOrStaleContent(
          renderer,
        );

        await settle(
          second,
          {
            kind: "resolve",
            value: [
              runSheet(
                "A2_CURRENT",
              ),
            ],
          },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toContain(
          "A2_CURRENT",
        );
        expect(
          mockAnnounce,
        ).toHaveBeenCalledWith(
          42,
        );

        await unmountRoute(renderer);
      },
    );

    it.each([
      "success",
      "error",
    ] as const)(
      "keeps a builder A2 tree inert when a late A1 bootstrap settles as %s",
      async (outcome) => {
        const first =
          deferred<
            Record<string, unknown>[]
          >();
        const second =
          deferred<
            Record<string, unknown>[]
          >();

        mockListCollections
          .mockImplementationOnce(
            () =>
              first.promise,
          )
          .mockImplementationOnce(
            () =>
              second.promise,
          );

        const renderer =
          await renderRoute(
            EventRunSheetBuilderScreen,
          );

        await switchToA2(
          renderer,
          EventRunSheetBuilderScreen,
        );

        const beforeLateA1 =
          renderedText(
            renderer,
          );

        await settle(
          first,
          outcome === "success"
            ? {
                kind: "resolve",
                value: [
                  collection(
                    "A1_PRIVATE",
                  ),
                ],
              }
            : {
                error:
                  new Error(
                    "A1_ONLY_ERROR",
                  ),
                kind: "reject",
              },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toBe(
          beforeLateA1,
        );
        expect(
          mockRouter.push,
        ).not.toHaveBeenCalled();
        expect(
          mockRouter.replace,
        ).not.toHaveBeenCalled();
        expect(
          mockAnnounce,
        ).not.toHaveBeenCalled();
        expectNoRecoveryOrStaleContent(
          renderer,
        );

        await settle(
          second,
          {
            kind: "resolve",
            value: [
              collection(
                "A2_CURRENT",
              ),
            ],
          },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toContain(
          "A2_CURRENT",
        );
        expect(
          mockAnnounce,
        ).toHaveBeenCalledWith(
          42,
        );

        await unmountRoute(renderer);
      },
    );

    it.each([
      "success",
      "error",
    ] as const)(
      "keeps a detail A2 tree inert when a late A1 load settles as %s",
      async (outcome) => {
        mockParams = {
          runSheetId:
            "00000000-0000-4000-8000-000000000301",
        };

        const first =
          deferred<
            Record<string, unknown> | null
          >();
        const second =
          deferred<
            Record<string, unknown> | null
          >();

        mockLoadRunSheet
          .mockImplementationOnce(
            () =>
              first.promise,
          )
          .mockImplementationOnce(
            () =>
              second.promise,
          );

        const renderer =
          await renderRoute(
            EventRunSheetDetailScreen,
          );

        await switchToA2(
          renderer,
          EventRunSheetDetailScreen,
        );

        const beforeLateA1 =
          renderedText(
            renderer,
          );

        await settle(
          first,
          outcome === "success"
            ? {
                kind: "resolve",
                value:
                  runSheetDetail(
                    "A1_PRIVATE",
                  ),
              }
            : {
                error:
                  new Error(
                    "A1_ONLY_ERROR",
                  ),
                kind: "reject",
              },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toBe(
          beforeLateA1,
        );
        expect(
          mockRouter.push,
        ).not.toHaveBeenCalled();
        expect(
          mockRouter.replace,
        ).not.toHaveBeenCalled();
        expect(
          mockAnnounce,
        ).not.toHaveBeenCalled();
        expectNoRecoveryOrStaleContent(
          renderer,
        );

        await settle(
          second,
          {
            kind: "resolve",
            value:
              runSheetDetail(
                "A2_CURRENT",
              ),
          },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toContain(
          "A2_CURRENT",
        );
        expect(
          mockAnnounce,
        ).toHaveBeenCalledWith(
          42,
        );

        await unmountRoute(renderer);
      },
    );

    it(
      "does not navigate when a retained A1 hub row action runs after the A2 remount",
      async () => {
        const first =
          deferred<
            Record<string, unknown>[]
          >();
        const second =
          deferred<
            Record<string, unknown>[]
          >();

        mockListRunSheets
          .mockImplementationOnce(
            () =>
              first.promise,
          )
          .mockImplementationOnce(
            () =>
              second.promise,
          );

        const renderer =
          await renderRoute(
            EventRunSheetHubScreen,
          );

        await settle(
          first,
          {
            kind: "resolve",
            value: [
              runSheet(
                "A1_PRIVATE",
              ),
            ],
          },
        );

        const staleOpen =
          controlPress(
            renderer,
            "A1_PRIVATE, RUNNING, Aug 1, 2026, 7:00 PM",
          );

        await switchToA2(
          renderer,
          EventRunSheetHubScreen,
        );

        mockRouter.push.mockClear();
        mockRouter.replace.mockClear();
        mockAnnounce.mockClear();

        await act(
          async () => {
            staleOpen();
            await Promise.resolve();
          },
        );

        expect(
          mockRouter.push,
        ).not.toHaveBeenCalled();
        expect(
          mockRouter.replace,
        ).not.toHaveBeenCalled();
        expect(
          mockAnnounce,
        ).not.toHaveBeenCalled();

        await settle(
          second,
          {
            kind: "resolve",
            value: [
              runSheet(
                "A2_CURRENT",
              ),
            ],
          },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toContain(
          "A2_CURRENT",
        );

        await unmountRoute(renderer);
      },
    );

    it.each([
      "success",
      "error",
    ] as const)(
      "keeps the R2 detail tree inert when a late R1 read settles as %s",
      async (outcome) => {
        const first =
          deferred<
            Record<string, unknown> | null
          >();
        const second =
          deferred<
            Record<string, unknown> | null
          >();

        mockParams = {
          runSheetId:
            "00000000-0000-4000-8000-000000000301",
        };
        mockLoadRunSheet
          .mockImplementationOnce(
            () =>
              first.promise,
          )
          .mockImplementationOnce(
            () =>
              second.promise,
          );

        const renderer =
          await renderRoute(
            EventRunSheetDetailScreen,
          );

        mockParams = {
          runSheetId:
            "00000000-0000-4000-8000-000000000302",
        };

        await act(
          async () => {
            renderer.update(
              React.createElement(
                EventRunSheetDetailScreen,
              ),
            );
            await Promise.resolve();
            await Promise.resolve();
          },
        );

        const beforeLateR1 =
          renderedText(
            renderer,
          );

        mockRouter.push.mockClear();
        mockRouter.replace.mockClear();
        mockAnnounce.mockClear();

        await settle(
          first,
          outcome === "success"
            ? {
                kind: "resolve",
                value:
                  runSheetDetail(
                    "A1_PRIVATE",
                  ),
              }
            : {
                error:
                  new Error(
                    "A1_ONLY_ERROR",
                  ),
                kind: "reject",
              },
        );

        expectStaleMutationToBeInert(
          renderer,
          beforeLateR1,
        );

        await settle(
          second,
          {
            kind: "resolve",
            value:
              runSheetDetail(
                "R2_CURRENT",
              ),
          },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toContain(
          "R2_CURRENT",
        );

        await unmountRoute(renderer);
      },
    );

    it.each([
      "create",
      "save",
      "delete",
      "start",
    ] as const)(
      "keeps the A2 builder tree inert when an A1 %s outcome settles",
      async (action) => {
        const pending =
          deferred<
            Record<string, unknown>
          >();
        const editingExisting =
          action !==
          "create";

        mockParams = editingExisting
          ? {
              runSheetId:
                "00000000-0000-4000-8000-000000000301",
            }
          : {};
        mockListCollections
          .mockResolvedValueOnce([
            collection(
              "A1 collection",
            ),
          ])
          .mockResolvedValueOnce([
            collection(
              "A2 collection",
            ),
          ]);

        if (editingExisting) {
          mockLoadRunSheet
            .mockResolvedValueOnce(
              runSheet(
                "A1_PRIVATE",
                "planned",
              ),
            )
            .mockResolvedValueOnce(
              runSheet(
                "A2_CURRENT",
                "planned",
              ),
            );
        }

        if (
          action ===
          "delete"
        ) {
          mockDeleteRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        } else if (
          action ===
          "start"
        ) {
          mockSaveRunSheet.mockResolvedValueOnce(
            runSheet(
              "A1_PRIVATE",
              "planned",
            ),
          );
          mockStartRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        } else {
          mockSaveRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        }

        const renderer =
          await renderRoute(
            EventRunSheetBuilderScreen,
          );

        await flushEffects();
        await changeText(
          renderer,
          "Venue or room label",
          "Canal Hall",
        );
        await flushEffects();

        if (
          action ===
          "create"
        ) {
          await pressControl(
            renderer,
            "A1 collection, 2 Scenes",
          );
          await flushEffects();
        }

        if (
          action ===
          "delete"
        ) {
          await pressControl(
            renderer,
            "Delete planned Event Run Sheet A1_PRIVATE",
          );
          await confirmAlertAction(
            "Delete plan",
          );
        } else {
          await pressControl(
            renderer,
            action ===
              "start"
              ? "Start frozen Event Run Sheet"
              : "Save Event Run Sheet plan",
          );
        }

        await flushEffects();

        expect(
          action === "delete"
            ? mockDeleteRunSheet
            : action === "start"
              ? mockStartRunSheet
              : mockSaveRunSheet,
        ).toHaveBeenCalledTimes(
          1,
        );

        await switchToA2(
          renderer,
          EventRunSheetBuilderScreen,
        );
        await flushEffects();

        const beforeLateA1 =
          renderedText(
            renderer,
          );

        mockRouter.push.mockClear();
        mockRouter.replace.mockClear();
        mockAnnounce.mockClear();

        await settle(
          pending,
          {
            kind: "resolve",
            value:
              action === "start"
                ? runSheet(
                    "A1_PRIVATE",
                    "running",
                  )
                : runSheet(
                    "A1_PRIVATE",
                    "planned",
                  ),
          },
        );

        expectStaleMutationToBeInert(
          renderer,
          beforeLateA1,
        );

        await unmountRoute(renderer);
      },
    );

    it.each([
      "create",
      "save",
      "delete",
      "start",
    ] as const)(
      "keeps the A2 builder tree inert when an A1 %s error settles",
      async (action) => {
        const pending =
          deferred<
            Record<string, unknown>
          >();
        const editingExisting =
          action !==
          "create";

        mockParams = editingExisting
          ? {
              runSheetId:
                "00000000-0000-4000-8000-000000000301",
            }
          : {};
        mockListCollections
          .mockResolvedValueOnce([
            collection(
              "A1 collection",
            ),
          ])
          .mockResolvedValueOnce([
            collection(
              "A2 collection",
            ),
          ]);

        if (editingExisting) {
          mockLoadRunSheet
            .mockResolvedValueOnce(
              runSheet(
                "A1_PRIVATE",
                "planned",
              ),
            )
            .mockResolvedValueOnce(
              runSheet(
                "A2_CURRENT",
                "planned",
              ),
            );
        }

        if (
          action ===
          "delete"
        ) {
          mockDeleteRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        } else if (
          action ===
          "start"
        ) {
          mockSaveRunSheet.mockResolvedValueOnce(
            runSheet(
              "A1_PRIVATE",
              "planned",
            ),
          );
          mockStartRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        } else {
          mockSaveRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        }

        const renderer =
          await renderRoute(
            EventRunSheetBuilderScreen,
          );

        await flushEffects();
        await changeText(
          renderer,
          "Venue or room label",
          "Canal Hall",
        );
        await flushEffects();

        if (
          action ===
          "create"
        ) {
          await pressControl(
            renderer,
            "A1 collection, 2 Scenes",
          );
          await flushEffects();
        }

        if (
          action ===
          "delete"
        ) {
          await pressControl(
            renderer,
            "Delete planned Event Run Sheet A1_PRIVATE",
          );
          await confirmAlertAction(
            "Delete plan",
          );
        } else {
          await pressControl(
            renderer,
            action ===
              "start"
              ? "Start frozen Event Run Sheet"
              : "Save Event Run Sheet plan",
          );
        }

        await flushEffects();

        await switchToA2(
          renderer,
          EventRunSheetBuilderScreen,
        );
        await flushEffects();

        const beforeLateA1 =
          renderedText(
            renderer,
          );

        mockRouter.push.mockClear();
        mockRouter.replace.mockClear();
        mockAnnounce.mockClear();

        await settle(
          pending,
          {
            error:
              new Error(
                "A1_ONLY_ERROR",
            ),
            kind: "reject",
          },
        );

        expectStaleMutationToBeInert(
          renderer,
          beforeLateA1,
        );

        await unmountRoute(renderer);
      },
    );

    it.each([
      "advance",
      "complete",
    ] as const)(
      "keeps the A2 detail tree inert when an A1 %s outcome settles",
      async (action) => {
        const pending =
          deferred<
            Record<string, unknown>
          >();
        const itemCount =
          action ===
          "advance"
            ? 2
            : 1;

        mockParams = {
          runSheetId:
            "00000000-0000-4000-8000-000000000301",
        };
        mockLoadRunSheet
          .mockResolvedValueOnce(
            runSheetDetail(
              "A1_PRIVATE",
              itemCount,
            ),
          )
          .mockResolvedValueOnce(
            runSheetDetail(
              "A2_CURRENT",
              itemCount,
            ),
          );

        if (
          action ===
          "advance"
        ) {
          mockAdvanceRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        } else {
          mockCompleteRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        }

        const renderer =
          await renderRoute(
            EventRunSheetDetailScreen,
          );

        await flushEffects();
        await pressControl(
          renderer,
          action ===
            "advance"
            ? "Advance to next Scene"
            : "Complete Event Run Sheet",
        );
        await flushEffects();

        await switchToA2(
          renderer,
          EventRunSheetDetailScreen,
        );
        await flushEffects();

        const beforeLateA1 =
          renderedText(
            renderer,
          );

        mockRouter.push.mockClear();
        mockRouter.replace.mockClear();
        mockAnnounce.mockClear();

        await settle(
          pending,
          {
            kind: "resolve",
            value:
              action === "advance"
                ? {
                    activePosition:
                      1,
                    status:
                      "running",
                    version:
                      3,
                  }
                : {
                    activePosition:
                      0,
                    completedAt:
                      "2026-08-02T00:00:00.000Z",
                    status:
                      "completed",
                    version:
                      3,
                  },
          },
        );

        expectStaleMutationToBeInert(
          renderer,
          beforeLateA1,
        );

        await unmountRoute(renderer);
      },
    );

    it.each([
      "advance",
      "complete",
    ] as const)(
      "keeps the A2 detail tree inert when an A1 %s error settles",
      async (action) => {
        const pending =
          deferred<
            Record<string, unknown>
          >();
        const itemCount =
          action ===
          "advance"
            ? 2
            : 1;

        mockParams = {
          runSheetId:
            "00000000-0000-4000-8000-000000000301",
        };
        mockLoadRunSheet
          .mockResolvedValueOnce(
            runSheetDetail(
              "A1_PRIVATE",
              itemCount,
            ),
          )
          .mockResolvedValueOnce(
            runSheetDetail(
              "A2_CURRENT",
              itemCount,
            ),
          );

        if (
          action ===
          "advance"
        ) {
          mockAdvanceRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        } else {
          mockCompleteRunSheet.mockImplementationOnce(
            () =>
              pending.promise,
          );
        }

        const renderer =
          await renderRoute(
            EventRunSheetDetailScreen,
          );

        await flushEffects();
        await pressControl(
          renderer,
          action ===
            "advance"
            ? "Advance to next Scene"
            : "Complete Event Run Sheet",
        );
        await flushEffects();

        await switchToA2(
          renderer,
          EventRunSheetDetailScreen,
        );
        await flushEffects();

        const beforeLateA1 =
          renderedText(
            renderer,
          );

        mockRouter.push.mockClear();
        mockRouter.replace.mockClear();
        mockAnnounce.mockClear();

        await settle(
          pending,
          {
            error:
              new Error(
                "A1_ONLY_ERROR",
            ),
            kind: "reject",
          },
        );

        expectStaleMutationToBeInert(
          renderer,
          beforeLateA1,
        );

        await unmountRoute(renderer);
      },
    );

    it(
      "focuses the current recovery summary once without repeating it on rerender",
      async () => {
        const current =
          deferred<
            Record<string, unknown>[]
          >();

        mockListRunSheets
          .mockImplementationOnce(
            () =>
              current.promise,
          );

        const renderer =
          await renderRoute(
            EventRunSheetHubScreen,
          );

        await settle(
          current,
          {
            error:
              new Error(
                "CURRENT_LOAD_ERROR",
              ),
            kind: "reject",
          },
        );

        expect(
          renderedText(
            renderer,
          ),
        ).toContain(
          "RecoveryNotice",
        );
        expect(
          mockAnnounce,
        ).toHaveBeenCalledWith(
          42,
        );

        const focusCalls =
          mockAnnounce.mock.calls.length;

        await act(
          async () => {
            renderer.update(
              React.createElement(
                EventRunSheetHubScreen,
              ),
            );

            await Promise.resolve();
          },
        );

        expect(
          mockAnnounce.mock.calls.length,
        ).toBe(
          focusCalls,
        );

        await unmountRoute(renderer);
      },
    );
  },
);
