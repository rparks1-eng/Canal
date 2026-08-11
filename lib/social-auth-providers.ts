import {
  isSupabaseConfigured,
} from "./supabase";

export type CanalSocialAuthProviderAvailability = {
  google: boolean;
  apple: boolean;
};

const PROVIDER_SETTINGS_CACHE_MS = 5 * 60 * 1000;

let cachedAvailability:
  | {
      expiresAt: number;
      value: CanalSocialAuthProviderAvailability;
    }
  | null = null;

export function parseCanalSocialAuthProviderAvailability(
  payload: unknown,
): CanalSocialAuthProviderAvailability {
  const external = payload && typeof payload === "object" &&
    "external" in payload &&
    payload.external && typeof payload.external === "object"
    ? payload.external as Record<string, unknown>
    : {};

  return {
    google: external.google === true,
    apple: external.apple === true,
  };
}

export async function readCanalSocialAuthProviderAvailability(
  options: {
    fetchImpl?: typeof fetch;
    now?: number;
  } = {},
): Promise<CanalSocialAuthProviderAvailability> {
  if (!isSupabaseConfigured) {
    return {
      google: false,
      apple: false,
    };
  }

  const now = options.now ?? Date.now();

  if (cachedAvailability && cachedAvailability.expiresAt > now) {
    return cachedAvailability.value;
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const response = await (options.fetchImpl ?? fetch)(
    `${supabaseUrl}/auth/v1/settings`,
    {
      headers: {
        apikey: publishableKey,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Canal could not verify social sign-in availability.");
  }

  const value = parseCanalSocialAuthProviderAvailability(
    await response.json(),
  );

  cachedAvailability = {
    expiresAt: now + PROVIDER_SETTINGS_CACHE_MS,
    value,
  };

  return value;
}

export function clearCanalSocialAuthProviderAvailabilityCache(): void {
  cachedAvailability = null;
}
