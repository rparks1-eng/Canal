import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  mockAsyncStorage,
  mockStorage,
} from "./helpers/async-storage-mock";

jest.mock(
  "../lib/supabase",
  () => ({
    supabase: {
      auth: {
        getUser:
          jest.fn(
            async () => ({
              data: {
                user: {
                  id:
                    "user-listener",
                },
              },
              error: null,
            }),
          ),
      },
    },
  }),
);

import {
  supabase,
} from "../lib/supabase";

import {
  completeOnboarding,
  isOnboardingRequired,
  readPendingOnboardingDestination,
  rememberPendingSignup,
  subscribeToOnboarding,
} from "../lib/onboarding";

const mockGetUser =
  supabase.auth
    .getUser as jest.MockedFunction<
      typeof supabase.auth.getUser
    >;

describe(
  "first-run onboarding",
  () => {
    beforeEach(() => {
      mockStorage.clear();
      mockAsyncStorage.setItem.mockReset();
      mockAsyncStorage.setItem.mockImplementation(
        async (
          key: string,
          value: string,
        ) => {
          mockStorage.set(
            key,
            value,
          );
        },
      );
      mockGetUser.mockReset();
      mockGetUser.mockResolvedValue(
        {
          data: {
            user: {
              id:
                "user-listener",
            },
          },
          error: null,
        } as Awaited<
          ReturnType<
            typeof supabase.auth.getUser
          >
        >,
      );
    });

    it(
      "requires onboarding for the matching newly registered email",
      async () => {
        await rememberPendingSignup(
          " NewListener@Example.com ",
        );

        await expect(
          isOnboardingRequired(
            "user-new",
            "newlistener@example.com",
            "2026-07-27T12:00:00.000Z",
          ),
        ).resolves.toBe(
          true,
        );
      },
    );

    it(
      "does not force a pre-onboarding account through the new flow",
      async () => {
        await expect(
          isOnboardingRequired(
            "user-existing",
            "existing@example.com",
            "2026-07-20T12:00:00.000Z",
          ),
        ).resolves.toBe(
          false,
        );
      },
    );

    it(
      "honors synchronized completion metadata on a different device",
      async () => {
        await expect(
          isOnboardingRequired(
            "user-complete",
            "complete@example.com",
            "2026-07-28T12:00:00.000Z",
            "connect-shape-export-v1",
          ),
        ).resolves.toBe(
          false,
        );
      },
    );

    it(
      "notifies the navigator after storing account-scoped completion",
      async () => {
        const listener =
          jest.fn();

        const unsubscribe =
          subscribeToOnboarding(
            "user-listener",
            listener,
          );

        await completeOnboarding(
          "user-listener",
          "/(tabs)",
        );

        expect(
          listener,
        ).toHaveBeenCalledWith(
          {
            required: false,
            destination:
              "/(tabs)",
          },
        );

        expect(
          mockStorage.get(
            "@canal/onboarding/connect-shape-export-v1/user/user-listener",
          ),
        ).toBe(
          "complete",
        );

        unsubscribe();
      },
    );

    it(
      "does not publish completion while account-scoped storage is pending",
      async () => {
        mockGetUser.mockResolvedValue(
          {
            data: {
              user: {
                id:
                  "user-deferred",
              },
            },
            error: null,
          } as Awaited<
            ReturnType<
              typeof supabase.auth.getUser
            >
          >,
        );

        let resolveStorage:
          () => void =
            () => {};

        let markStorageStarted:
          () => void =
            () => {};

        const storageStarted =
          new Promise<void>(
            (resolveStarted) => {
              markStorageStarted =
                resolveStarted;
            },
          );

        mockAsyncStorage.setItem.mockImplementation(
          async (
            key: string,
            value: string,
          ) => {
            markStorageStarted();

            await new Promise<void>(
              (resolve) => {
                resolveStorage =
                  resolve;
              },
            );

            mockStorage.set(
              key,
              value,
            );
          },
        );

        const listener =
          jest.fn();

        const unsubscribe =
          subscribeToOnboarding(
            "user-deferred",
            listener,
          );

        const completion =
          completeOnboarding(
            "user-deferred",
            "/scene-studio",
          );

        await storageStarted;

        expect(
          listener,
        ).not.toHaveBeenCalled();

        expect(
          readPendingOnboardingDestination(
            "user-deferred",
          ),
        ).toBe(
          "/scene-studio",
        );

        resolveStorage();

        await completion;

        expect(
          listener,
        ).toHaveBeenCalledWith(
          {
            required: false,
            destination:
              "/scene-studio",
          },
        );

        expect(
          listener,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          readPendingOnboardingDestination(
            "user-deferred",
          ),
        ).toBeNull();

        unsubscribe();
      },
    );

    it(
      "does not publish a destination after the Canal account changes",
      async () => {
        const listener =
          jest.fn();

        mockGetUser
          .mockResolvedValueOnce(
            {
              data: {
                user: {
                  id:
                    "user-a",
                },
              },
              error: null,
            } as Awaited<
              ReturnType<
                typeof supabase.auth.getUser
              >
            >,
          )
          .mockResolvedValueOnce(
            {
              data: {
                user: {
                  id:
                    "user-b",
                },
              },
              error: null,
            } as Awaited<
              ReturnType<
                typeof supabase.auth.getUser
              >
            >,
          );

        let resolveStorage:
          () => void =
            () => {};

        let markStorageStarted:
          () => void =
            () => {};

        const storageStarted =
          new Promise<void>(
            (resolveStarted) => {
              markStorageStarted =
                resolveStarted;
            },
          );

        mockAsyncStorage.setItem.mockImplementation(
          async (
            key: string,
            value: string,
          ) => {
            markStorageStarted();

            await new Promise<void>(
              (resolve) => {
                resolveStorage =
                  resolve;
              },
            );

            mockStorage.set(
              key,
              value,
            );
          },
        );

        const unsubscribe =
          subscribeToOnboarding(
            "user-a",
            listener,
          );

        const completion =
          completeOnboarding(
            "user-a",
            "/scene-studio",
          );

        await storageStarted;
        resolveStorage();

        await expect(
          completion,
        ).rejects.toMatchObject({
          code:
            "CANAL_ONBOARDING_ACCOUNT_CHANGED",
        });

        expect(
          listener,
        ).not.toHaveBeenCalled();

        expect(
          mockStorage.get(
            "@canal/onboarding/connect-shape-export-v1/user/user-b",
          ),
        ).toBeUndefined();

        expect(
          readPendingOnboardingDestination(
            "user-a",
          ),
        ).toBeNull();

        expect(
          mockGetUser,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          mockStorage.get(
            "@canal/onboarding/connect-shape-export-v1/user/user-a",
          ),
        ).toBe(
          "complete",
        );

        unsubscribe();
      },
    );
  },
);
