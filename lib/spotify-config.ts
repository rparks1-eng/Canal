import type {
  DiscoveryDocument,
} from "expo-auth-session";
import {
  Platform,
} from "react-native";

export const SPOTIFY_NATIVE_REDIRECT_URI =
  "com.raishawnparks.canal.spotify://callback";

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-top-read",
  "user-library-read",
  "user-read-recently-played",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
] as const;

export const spotifyDiscovery:
  DiscoveryDocument = {
    authorizationEndpoint:
      "https://accounts.spotify.com/authorize",

    tokenEndpoint:
      "https://accounts.spotify.com/api/token",
  };

export function getSpotifyClientId(): string {
  return (
    process.env
      .EXPO_PUBLIC_SPOTIFY_CLIENT_ID
      ?.trim() ?? ""
  );
}

export function getSpotifyRedirectUri(
  platform:
    | typeof Platform.OS
    | "web" =
    Platform.OS,
): string {
  if (platform !== "web") {
    return SPOTIFY_NATIVE_REDIRECT_URI;
  }

  const configuredRedirect =
    process.env
      .EXPO_PUBLIC_SPOTIFY_REDIRECT_URI
      ?.trim() ?? "";

  if (
    configuredRedirect.startsWith(
      "https://",
    )
  ) {
    return configuredRedirect;
  }

  return SPOTIFY_NATIVE_REDIRECT_URI;
}

export function requireSpotifyConfiguration(): {
  clientId: string;
  redirectUri: string;
} {
  const clientId =
    getSpotifyClientId();

  if (!clientId) {
    throw new Error(
      "Spotify is not configured. Add EXPO_PUBLIC_SPOTIFY_CLIENT_ID to the project's .env.local file, then fully reload Canal.",
    );
  }

  const redirectUri =
    getSpotifyRedirectUri();

  return {
    clientId,
    redirectUri,
  };
}
