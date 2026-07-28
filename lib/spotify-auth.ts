import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  Platform,
} from "react-native";

import {
  getSpotifyClientId,
} from "./spotify-config";

export type SpotifyImage = {
  url: string;
  height?: number | null;
  width?: number | null;
};

export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  email?: string;
  country?: string;
  product?: string;
  images?: SpotifyImage[];

  external_urls?: {
    spotify?: string;
  };

  followers?: {
    total?: number;
  };

  [key: string]: unknown;
};

export type SpotifySession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  expiresIn?: number;
  tokenType: string;
  scope: string;
  profile: SpotifyProfile;

  [key: string]: unknown;
};

export type SaveSpotifySessionOptions = {
  syncLibrary?: boolean;
};

export const SPOTIFY_ASYNC_STORAGE_KEY =
  "@canal/spotify-session";

export const SPOTIFY_SECURE_STORAGE_KEY =
  "canal.spotify-session";

let memorySession:
  SpotifySession | null = null;

let refreshInFlight:
  Promise<SpotifySession> | null =
    null;

function normalizeSession(
  value: unknown,
): SpotifySession | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<SpotifySession>;

  if (
    typeof candidate.accessToken !==
      "string" ||
    !candidate.accessToken
  ) {
    return null;
  }

  if (
    !candidate.profile ||
    typeof candidate.profile.id !==
      "string"
  ) {
    return null;
  }

  const expiresAt =
    typeof candidate.expiresAt ===
      "number"
      ? candidate.expiresAt
      : Date.now() +
        55 * 60 * 1000;

  return {
    ...candidate,

    accessToken:
      candidate.accessToken,

    refreshToken:
      typeof candidate.refreshToken ===
        "string"
        ? candidate.refreshToken
        : undefined,

    expiresAt,

    tokenType:
      typeof candidate.tokenType ===
        "string"
        ? candidate.tokenType
        : "Bearer",

    scope:
      typeof candidate.scope ===
        "string"
        ? candidate.scope
        : "",

    profile:
      candidate.profile,
  };
}

async function persistSession(
  session: SpotifySession,
): Promise<void> {
  const serialized =
    JSON.stringify(session);

  memorySession =
    session;

  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(
      SPOTIFY_ASYNC_STORAGE_KEY,
    );

    return;
  }

  await SecureStore.setItemAsync(
    SPOTIFY_SECURE_STORAGE_KEY,
    serialized,
  );

  await AsyncStorage.removeItem(
    SPOTIFY_ASYNC_STORAGE_KEY,
  );
}

export async function readSpotifySession(): Promise<
  SpotifySession | null
> {
  if (memorySession) {
    return memorySession;
  }

  let serialized: string | null =
    null;

  if (Platform.OS !== "web") {
    try {
      serialized =
        await SecureStore.getItemAsync(
          SPOTIFY_SECURE_STORAGE_KEY,
        );
    } catch {
      serialized = null;
    }
  }

  let cameFromLegacyStorage =
    false;

  if (!serialized) {
    serialized =
      await AsyncStorage.getItem(
        SPOTIFY_ASYNC_STORAGE_KEY,
      );

    cameFromLegacyStorage =
      Boolean(serialized);
  }

  if (!serialized) {
    return null;
  }

  try {
    const parsed: unknown =
      JSON.parse(serialized);

    const normalized =
      normalizeSession(parsed) ??
      (await migrateLegacySession(
        parsed,
      ));

    if (!normalized) {
      if (cameFromLegacyStorage) {
        await AsyncStorage.removeItem(
          SPOTIFY_ASYNC_STORAGE_KEY,
        );
      }

      return null;
    }

    memorySession =
      normalized;

    if (cameFromLegacyStorage) {
      await persistSession(
        normalized,
      );
    }

    return normalized;
  } catch {
    return null;
  }
}

export async function saveSpotifySession(
  session: SpotifySession,
  options: SaveSpotifySessionOptions = {},
): Promise<void> {
  const normalized =
    normalizeSession(session);

  if (!normalized) {
    throw new Error(
      "Canal received an invalid Spotify session.",
    );
  }

  const previousSession =
    await readSpotifySession();

  await persistSession(
    normalized,
  );

  try {
    const {
      markAppSignedIn,
    } = await import(
      "./app-session"
    );

    await markAppSignedIn();
  } catch {
    // The Spotify connection is still valid.
  }

  const isNewConnection =
    !previousSession ||
    previousSession.profile.id !==
      normalized.profile.id;

  const shouldSync =
    options.syncLibrary ??
    isNewConnection;

  if (shouldSync) {
    try {
      const {
        syncSpotifyLibrary,
      } = await import(
        "./spotify-library"
      );

      await syncSpotifyLibrary();
    } catch (error) {
      console.warn(
        "Spotify connected, but automatic library sync failed:",
        error,
      );
    }
  }
}

export async function clearSpotifySession(): Promise<void> {
  memorySession =
    null;

  await AsyncStorage.removeItem(
    SPOTIFY_ASYNC_STORAGE_KEY,
  );

  if (Platform.OS !== "web") {
    try {
      await SecureStore.deleteItemAsync(
        SPOTIFY_SECURE_STORAGE_KEY,
      );
    } catch {
      // Secure storage may be unavailable in some environments.
    }
  }
}

async function refreshSpotifySession(
  session: SpotifySession,
): Promise<SpotifySession> {
  if (!session.refreshToken) {
    const error =
      new Error(
        "Spotify needs to be connected again.",
      ) as Error & {
        authorizationInvalid?: boolean;
      };

    error.authorizationInvalid =
      true;

    throw error;
  }

  const clientId =
    getSpotifyClientId();

  if (!clientId) {
    throw new Error(
      "EXPO_PUBLIC_SPOTIFY_CLIENT_ID is missing.",
    );
  }

  const body =
    new URLSearchParams({
      grant_type:
        "refresh_token",

      refresh_token:
        session.refreshToken,

      client_id:
        clientId,
    });

  const response =
    await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          body.toString(),
      },
    );

  const payload =
    (await response.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

  if (
    !response.ok ||
    !payload.access_token
  ) {
    const error =
      new Error(
        payload.error_description ||
          payload.error ||
          "Spotify session refresh failed.",
      ) as Error & {
        authorizationInvalid?: boolean;
      };

    error.authorizationInvalid =
      response.status === 400 ||
      response.status === 401 ||
      payload.error ===
        "invalid_grant";

    throw error;
  }

  const expiresIn =
    typeof payload.expires_in ===
      "number"
      ? payload.expires_in
      : 3600;

  const refreshedSession: SpotifySession = {
    ...session,

    accessToken:
      payload.access_token,

    refreshToken:
      payload.refresh_token ||
      session.refreshToken,

    tokenType:
      payload.token_type ||
      session.tokenType ||
      "Bearer",

    scope:
      payload.scope ||
      session.scope,

    expiresIn,

    expiresAt:
      Date.now() +
      expiresIn * 1000 -
      60_000,
  };

  await saveSpotifySession(
    refreshedSession,
    {
      syncLibrary: false,
    },
  );

  return refreshedSession;
}

async function refreshSpotifySessionOnce(
  session: SpotifySession,
): Promise<SpotifySession | null> {
  try {
    refreshInFlight ??=
      refreshSpotifySession(
        session,
      ).finally(() => {
        refreshInFlight =
          null;
      });

    return await refreshInFlight;
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error as Error & {
          authorizationInvalid?: boolean;
        }
      ).authorizationInvalid
    ) {
      await clearSpotifySession();

      return null;
    }

    throw error;
  }
}

export async function getValidSpotifySession(): Promise<
  SpotifySession | null
> {
  const session =
    await readSpotifySession();

  if (!session) {
    return null;
  }

  const isStillValid =
    session.expiresAt >
    Date.now() + 30_000;

  if (isStillValid) {
    return session;
  }

  return refreshSpotifySessionOnce(
    session,
  );
}

export async function forceRefreshSpotifySession(): Promise<
  SpotifySession | null
> {
  const session =
    await readSpotifySession();

  if (!session) {
    return null;
  }

  return refreshSpotifySessionOnce(
    session,
  );
}

export async function getSpotifyAccessToken(): Promise<string> {
  const session =
    await getValidSpotifySession();

  if (!session) {
    throw new Error(
      "Spotify is not connected.",
    );
  }

  return session.accessToken;
}

export async function spotifyAuthenticatedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const session =
    await getValidSpotifySession();

  if (!session) {
    throw new Error(
      "Spotify is not connected.",
    );
  }

  const send =
    (
      accessToken: string,
    ): Promise<Response> =>
      fetch(
        input,
        {
          ...init,

          headers: {
            ...(
              init.headers as
                | Record<
                    string,
                    string
                  >
                | undefined
            ),

            Authorization:
              `Bearer ${accessToken}`,
          },
        },
      );

  let response =
    await send(
      session.accessToken,
    );

  if (
    response.status !==
    401
  ) {
    return response;
  }

  const refreshed =
    await forceRefreshSpotifySession();

  if (!refreshed) {
    return response;
  }

  response =
    await send(
      refreshed.accessToken,
    );

  return response;
}

export async function fetchSpotifyProfile(
  accessToken: string,
): Promise<SpotifyProfile> {
  const response =
    await fetch(
      "https://api.spotify.com/v1/me",
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    );

  const payload =
    (await response.json()) as
      SpotifyProfile & {
        error?: {
          message?: string;
        };
      };

  if (
    !response.ok ||
    !payload.id
  ) {
    throw new Error(
      payload.error?.message ||
        "Canal could not load your Spotify profile.",
    );
  }

  return payload;
}

export function getSpotifyErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Canal could not complete the Spotify request.";
}

async function migrateLegacySession(
  value: unknown,
): Promise<SpotifySession | null> {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const candidate =
    value as {
      accessToken?: unknown;
      refreshToken?: unknown;
      expiresIn?: unknown;
      issuedAt?: unknown;
      scope?: unknown;
      tokenType?: unknown;
    };

  if (
    typeof candidate.accessToken !==
      "string" ||
    !candidate.accessToken
  ) {
    return null;
  }

  const expiresIn =
    typeof candidate.expiresIn ===
      "number"
      ? candidate.expiresIn
      : 3600;

  const issuedAt =
    typeof candidate.issuedAt ===
      "number"
      ? candidate.issuedAt
      : Math.floor(
          Date.now() / 1000,
        );

  const profile =
    await fetchSpotifyProfile(
      candidate.accessToken,
    );

  return {
    accessToken:
      candidate.accessToken,

    refreshToken:
      typeof candidate.refreshToken ===
        "string"
        ? candidate.refreshToken
        : undefined,

    expiresIn,

    expiresAt:
      issuedAt * 1000 +
      expiresIn * 1000 -
      60_000,

    scope:
      typeof candidate.scope ===
        "string"
        ? candidate.scope
        : "",

    tokenType:
      typeof candidate.tokenType ===
        "string"
        ? candidate.tokenType
        : "Bearer",

    profile,
  };
}
