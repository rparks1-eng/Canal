jest.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
}));

import {
  clearCanalSocialAuthProviderAvailabilityCache,
  parseCanalSocialAuthProviderAvailability,
  readCanalSocialAuthProviderAvailability,
} from "../lib/social-auth-providers";

describe("Canal social auth provider availability", () => {
  const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  beforeEach(() => {
    clearCanalSocialAuthProviderAvailabilityCache();
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  });

  it("fails closed for missing, malformed, or disabled provider settings", () => {
    expect(parseCanalSocialAuthProviderAvailability(null)).toEqual({
      google: false,
      apple: false,
    });
    expect(parseCanalSocialAuthProviderAvailability({
      external: { google: "true", apple: false },
    })).toEqual({
      google: false,
      apple: false,
    });
  });

  it("recognizes only explicitly enabled Google and Apple providers", () => {
    expect(parseCanalSocialAuthProviderAvailability({
      external: { google: true, apple: true, github: true },
    })).toEqual({
      google: true,
      apple: true,
    });
  });

  it("reads the public Auth settings once within the bounded cache window", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ external: { google: true, apple: false } }),
    })) as unknown as typeof fetch;

    await expect(readCanalSocialAuthProviderAvailability({ fetchImpl, now: 100 }))
      .resolves.toEqual({ google: true, apple: false });
    await expect(readCanalSocialAuthProviderAvailability({ fetchImpl, now: 200 }))
      .resolves.toEqual({ google: true, apple: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/settings",
      expect.objectContaining({
        headers: { apikey: "sb_publishable_test" },
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
