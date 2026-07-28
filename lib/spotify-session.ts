import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";

export const SPOTIFY_SESSION_KEY =
  "@canal/spotify-session";

const LEGACY_SPOTIFY_KEYS = [
  "@canal/spotify-session",
  "@canal/spotify-secure-session",
  "@canal/spotify-pending-auth",
];

const LEGACY_MUSIC_SERVICES_KEY =
  "@canal/music-services";

const SPOTIFY_API_URL =
  "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-top-read",
  "user-library-read",
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
];

export const spotifyDiscovery:
  AuthSession.DiscoveryDocument = {
    authorizationEndpoint:
      "https://accounts.spotify.com/authorize",
    tokenEndpoint:
      "https://accounts.spotify.com/api/token",
  };

export const spotifyClientId =
  process.env
    .EXPO_PUBLIC_SPOTIFY_CLIENT_ID ??
  "";

const configuredRedirectUri =
  process.env
    .EXPO_PUBLIC_SPOTIFY_REDIRECT_URI ??
  "";

export const spotifyRedirectUri =
  Platform.OS === "web" &&
  configuredRedirectUri
    ? configuredRedirectUri
    : AuthSession.makeRedirectUri({
        scheme: "canal",
        path: "spotify-callback",
      });

export type StoredSpotifySession = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  issuedAt: number;
  scope?: string;
  tokenType?: string;
};

export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  email?: string;
  country?: string;
  product?: string;
  uri?: string;
  external_urls?: {
    spotify?: string;
  };
  images?: {
    url: string;
    height: number | null;
    width: number | null;
  }[];
};

export async function readSpotifySession(): Promise<StoredSpotifySession | null> {
  const storedValue =
    await AsyncStorage.getItem(
      SPOTIFY_SESSION_KEY,
    );

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (
      typeof parsedValue !==
        "object" ||
      parsedValue === null
    ) {
      return null;
    }

    const possibleSession =
      parsedValue as Partial<StoredSpotifySession>;

    if (
      typeof possibleSession.accessToken !==
      "string"
    ) {
      return null;
    }

    return {
      accessToken:
        possibleSession.accessToken,
      refreshToken:
        possibleSession.refreshToken,
      expiresIn:
        possibleSession.expiresIn,
      issuedAt:
        possibleSession.issuedAt ??
        Math.floor(
          Date.now() / 1000,
        ),
      scope:
        possibleSession.scope,
      tokenType:
        possibleSession.tokenType,
    };
  } catch {
    return null;
  }
}

export async function saveSpotifySession(
  session: StoredSpotifySession,
): Promise<void> {
  await AsyncStorage.setItem(
    SPOTIFY_SESSION_KEY,
    JSON.stringify(session),
  );
}

export async function clearSpotifySession(): Promise<void> {
  await AsyncStorage.multiRemove(
    LEGACY_SPOTIFY_KEYS,
  );

  await clearLegacyMusicServicesValue();
}

export async function loadSpotifyProfile(): Promise<SpotifyProfile | null> {
  const session =
    await readSpotifySession();

  if (!session) {
    return null;
  }

  try {
    const accessToken =
      await getValidSpotifyAccessToken(
        session,
      );

    return await fetchSpotifyProfile(
      accessToken,
    );
  } catch (error) {
    console.error(
      "Unable to load Spotify profile:",
      error,
    );

    await clearSpotifySession();

    return null;
  }
}

export async function getValidSpotifyAccessToken(
  existingSession?: StoredSpotifySession,
): Promise<string> {
  const session =
    existingSession ??
    (await readSpotifySession());

  if (!session) {
    throw new Error(
      "Spotify is not connected.",
    );
  }

  if (isSessionFresh(session)) {
    return session.accessToken;
  }

  if (!session.refreshToken) {
    await clearSpotifySession();

    throw new Error(
      "Spotify authorization expired.",
    );
  }

  const refreshedSession =
    await refreshSpotifySession(
      session,
    );

  return refreshedSession.accessToken;
}

export async function refreshSpotifySession(
  session: StoredSpotifySession,
): Promise<StoredSpotifySession> {
  if (!session.refreshToken) {
    throw new Error(
      "Spotify authorization expired.",
    );
  }

  const refreshedResponse =
    await AuthSession.refreshAsync(
      {
        clientId: spotifyClientId,
        refreshToken:
          session.refreshToken,
        scopes: SPOTIFY_SCOPES,
      },
      spotifyDiscovery,
    );

  const refreshedSession:
    StoredSpotifySession = {
      accessToken:
        refreshedResponse.accessToken,
      refreshToken:
        refreshedResponse.refreshToken ??
        session.refreshToken,
      expiresIn:
        refreshedResponse.expiresIn,
      issuedAt:
        Math.floor(
          Date.now() / 1000,
        ),
      scope:
        refreshedResponse.scope ??
        session.scope,
      tokenType:
        refreshedResponse.tokenType ??
        session.tokenType,
    };

  await saveSpotifySession(
    refreshedSession,
  );

  return refreshedSession;
}

export async function fetchSpotifyProfile(
  accessToken: string,
): Promise<SpotifyProfile> {
  const response = await fetch(
    `${SPOTIFY_API_URL}/me`,
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Spotify profile request failed with status ${response.status}.`,
    );
  }

  return response.json() as Promise<SpotifyProfile>;
}

export function isSessionFresh(
  session: StoredSpotifySession,
): boolean {
  if (!session.expiresIn) {
    return true;
  }

  const expirationTime =
    session.issuedAt +
    session.expiresIn;

  const currentTime =
    Math.floor(Date.now() / 1000);

  return (
    currentTime <
    expirationTime - 60
  );
}

export function getSpotifyErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Canal could not complete the Spotify request.";
}

async function clearLegacyMusicServicesValue(): Promise<void> {
  const storedValue =
    await AsyncStorage.getItem(
      LEGACY_MUSIC_SERVICES_KEY,
    );

  if (!storedValue) {
    return;
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (
      typeof parsedValue !==
        "object" ||
      parsedValue === null ||
      Array.isArray(parsedValue)
    ) {
      return;
    }

    const updatedValue = {
      ...parsedValue,
      spotify: false,
      spotifyConnected: false,
    } as Record<string, unknown>;

    delete updatedValue.spotifyToken;
    delete updatedValue.spotifyProfile;
    delete updatedValue.accessToken;
    delete updatedValue.refreshToken;

    await AsyncStorage.setItem(
      LEGACY_MUSIC_SERVICES_KEY,
      JSON.stringify(updatedValue),
    );
  } catch {
    await AsyncStorage.removeItem(
      LEGACY_MUSIC_SERVICES_KEY,
    );
  }
}