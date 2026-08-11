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
          jest.fn(),
      },
    },
  }),
);

import {
  supabase,
} from "../lib/supabase";

import {
  consumeOnboardingSceneSeed,
  writeOnboardingSceneSeed,
} from "../lib/onboarding-scene-seed";

const mockGetUser =
  supabase.auth
    .getUser as jest.MockedFunction<
      typeof supabase.auth.getUser
    >;

const seed = {
  activity:
    "Focus",
  moods: [
    "Calm",
    "Dreamy",
  ],
  genres: [
    "Ambient",
  ],
  familiarity:
    "Balanced",
  allowAdjacentGenres:
    false,
  allowExplicit:
    false,
  notes:
    "Soft motion",
};

describe(
  "onboarding Scene direction",
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
      mockAsyncStorage.removeItem.mockClear();
      mockGetUser.mockReset();
      mockGetUser.mockResolvedValue(
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
      );
    });

    it(
      "stores and consumes one normalized account-scoped seed",
      async () => {
        await writeOnboardingSceneSeed(
          "user-a",
          seed,
        );

        await expect(
          consumeOnboardingSceneSeed(
            "user-a",
          ),
        ).resolves.toEqual(
          seed,
        );

        await expect(
          consumeOnboardingSceneSeed(
            "user-a",
          ),
        ).resolves.toBeNull();
      },
    );

    it(
      "rejects an account switch before writing",
      async () => {
        mockGetUser.mockResolvedValueOnce(
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

        await expect(
          writeOnboardingSceneSeed(
            "user-a",
            seed,
          ),
        ).rejects.toMatchObject({
          code:
            "CANAL_ONBOARDING_SCENE_ACCOUNT_CHANGED",
        });

        expect(
          mockStorage.size,
        ).toBe(0);
      },
    );

    it(
      "removes the exact seed when the account changes after writing",
      async () => {
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

        await expect(
          writeOnboardingSceneSeed(
            "user-a",
            seed,
          ),
        ).rejects.toMatchObject({
          code:
            "CANAL_ONBOARDING_SCENE_ACCOUNT_CHANGED",
        });

        expect(
          mockStorage.size,
        ).toBe(0);
      },
    );

    it(
      "rejects invalid or unbounded required choices",
      async () => {
        await expect(
          writeOnboardingSceneSeed(
            "user-a",
            {
              ...seed,
              activity:
                "",
              moods: [],
            },
          ),
        ).rejects.toThrow(
          /activity and at least one mood/i,
        );
      },
    );
  },
);
