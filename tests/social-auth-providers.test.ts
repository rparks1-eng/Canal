import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      true,
  }),
);

import {
  clearCanalSocialAuthProviderAvailabilityCache,
  parseCanalSocialAuthProviderAvailability,
  readCanalSocialAuthProviderAvailability,
} from "../lib/social-auth-providers";

function response(
  payload: unknown,
  ok = true,
): Response {
  return {
    ok,
    json:
      async () =>
        payload,
  } as Response;
}

describe(
  "Canal social auth provider settings",
  () => {
    beforeEach(() => {
      clearCanalSocialAuthProviderAvailabilityCache();
      process.env.EXPO_PUBLIC_SUPABASE_URL =
        "https://example.supabase.co";
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_test";
    });

    it(
      "accepts only exact enabled booleans",
      () => {
        expect(
          parseCanalSocialAuthProviderAvailability({
            external: {
              google:
                true,
              apple:
                "true",
            },
          }),
        ).toEqual({
          google: true,
          apple: false,
        });

        expect(
          parseCanalSocialAuthProviderAvailability(
            null,
          ),
        ).toEqual({
          google: false,
          apple: false,
        });
      },
    );

    it(
      "reads each provider independently and caches the public setting",
      async () => {
        const fetchImpl =
          jest.fn<
            typeof fetch
          >(async () =>
            response({
              external: {
                google:
                  false,
                apple:
                  true,
              },
            }),
          );

        await expect(
          readCanalSocialAuthProviderAvailability({
            fetchImpl,
            now: 100,
          }),
        ).resolves.toEqual({
          google: false,
          apple: true,
        });

        await readCanalSocialAuthProviderAvailability({
          fetchImpl,
          now: 101,
        });

        expect(
          fetchImpl,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "fails closed when the public settings request is not successful",
      async () => {
        const fetchImpl =
          jest.fn<
            typeof fetch
          >(async () =>
            response(
              {},
              false,
            ),
          );

        await expect(
          readCanalSocialAuthProviderAvailability({
            fetchImpl,
          }),
        ).rejects.toThrow(
          /verify social sign-in availability/i,
        );
      },
    );
  },
);
