import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

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

const ASYNC_STORAGE_KEY =
  "@canal/spotify-session";

const SECURE_STORAGE_KEY =
  "canal.spotify-session";

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

  await Promise.all([
    AsyncStorage.setItem(
      ASYNC_STORAGE_KEY,
      serialized,
    ),

    SecureStore.setItemAsync(
      SECURE_STORAGE_KEY,
      serialized,
    ),
  ]);
}

export async function readSpotifySession(): Promise<
  SpotifySession | null
> {
  let serialized: string | null =
    null;

  try {
    serialized =
      await SecureStore.getItemAsync(
        SECURE_STORAGE_KEY,
      );
  } catch {
    serialized = null;
  }

  if (!serialized) {
    serialized =
      await AsyncStorage.getItem(
        ASYNC_STORAGE_KEY,
      );
  }

  if (!serialized) {
    return null;
  }

  try {
    return normalizeSession(
      JSON.parse(serialized),
    );
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
  await AsyncStorage.removeItem(
    ASYNC_STORAGE_KEY,
  );

  try {
    await SecureStore.deleteItemAsync(
      SECURE_STORAGE_KEY,
    );
  } catch {
    // Secure storage may be unavailable in some environments.
  }
}

async function refreshSpotifySession(
  session: SpotifySession,
): Promise<SpotifySession> {
  if (!session.refreshToken) {
    throw new Error(
      "Spotify needs to be connected again.",
    );
  }

  const clientId =
    process.env
      .EXPO_PUBLIC_SPOTIFY_CLIENT_ID;

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
    throw new Error(
      payload.error_description ||
        payload.error ||
        "Spotify session refresh failed.",
    );
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

  try {
    return await refreshSpotifySession(
      session,
    );
  } catch {
    await clearSpotifySession();

    return null;
  }
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
