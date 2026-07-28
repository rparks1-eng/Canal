import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  mockStorage,
} from "./helpers/async-storage-mock";

jest.mock(
  "../lib/supabase",
  () => ({
    supabase: {
      auth: {
        updateUser:
          jest.fn(
            async () => ({
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
  ONBOARDING_METADATA_KEY,
  rememberPendingSignup,
  subscribeToOnboarding,
} from "../lib/onboarding";

const mockUpdateUser =
  supabase.auth
    .updateUser as jest.MockedFunction<
      typeof supabase.auth.updateUser
    >;

describe(
  "first-run onboarding",
  () => {
    beforeEach(() => {
      mockStorage.clear();
      mockUpdateUser.mockReset();
      mockUpdateUser.mockResolvedValue(
        {
          error: null,
          data: {},
        } as Awaited<
          ReturnType<
            typeof supabase.auth.updateUser
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
      "notifies the navigator and synchronizes completion to the account",
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
        );

        expect(
          listener,
        ).toHaveBeenCalledWith(
          false,
        );

        expect(
          mockUpdateUser,
        ).toHaveBeenCalledWith({
          data: {
            [ONBOARDING_METADATA_KEY]:
              "connect-shape-export-v1",
          },
        });

        unsubscribe();
      },
    );
  },
);
