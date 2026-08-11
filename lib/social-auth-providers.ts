import {
  isSupabaseConfigured,
} from "./supabase";

export type CanalSocialAuthProviderAvailability = {
  google: boolean;
  apple: boolean;
};

const PROVIDER_SETTINGS_CACHE_MS =
  5 * 60_000;
const PROVIDER_SETTINGS_TIMEOUT_MS =
  5_000;

const NO_SOCIAL_PROVIDERS: CanalSocialAuthProviderAvailability = {
  google: false,
  apple: false,
};

let cachedAvailability:
  | {
      expiresAt: number;
      value: CanalSocialAuthProviderAvailability;
    }
  | null = null;

export function parseCanalSocialAuthProviderAvailability(
  payload: unknown,
): CanalSocialAuthProviderAvailability {
  if (
    !payload ||
    typeof payload !==
      "object" ||
    !("external" in payload) ||
    !payload.external ||
    typeof payload.external !==
      "object"
  ) {
    return {
      ...NO_SOCIAL_PROVIDERS,
    };
  }

  const external =
    payload.external as Record<
      string,
      unknown
    >;

  return {
    google:
      external.google ===
      true,
    apple:
      external.apple ===
      true,
  };
}

export async function readCanalSocialAuthProviderAvailability(
  options: {
    fetchImpl?: typeof fetch;
    now?: number;
    timeoutMs?: number;
  } = {},
): Promise<CanalSocialAuthProviderAvailability> {
  if (!isSupabaseConfigured) {
    return {
      ...NO_SOCIAL_PROVIDERS,
    };
  }

  const now =
    options.now ??
    Date.now();

  if (
    cachedAvailability &&
    cachedAvailability.expiresAt >
      now
  ) {
    return cachedAvailability.value;
  }

  const supabaseUrl =
    process.env
      .EXPO_PUBLIC_SUPABASE_URL
      ?.trim() ??
    "";
  const publishableKey =
    process.env
      .EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?.trim() ??
    "";
  const controller =
    new AbortController();
  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      options.timeoutMs ??
        PROVIDER_SETTINGS_TIMEOUT_MS,
    );

  try {
    const response =
      await (
        options.fetchImpl ??
        fetch
      )(
        `${supabaseUrl}/auth/v1/settings`,
        {
          headers: {
            apikey:
              publishableKey,
          },
          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        "Canal could not verify social sign-in availability.",
      );
    }

    const value =
      parseCanalSocialAuthProviderAvailability(
        await response.json(),
      );

    cachedAvailability = {
      expiresAt:
        now +
        PROVIDER_SETTINGS_CACHE_MS,
      value,
    };

    return value;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

export function clearCanalSocialAuthProviderAvailabilityCache(): void {
  cachedAvailability =
    null;
}
