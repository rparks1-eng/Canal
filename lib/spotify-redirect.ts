import {
  getSpotifyRedirectUri as getCanonicalSpotifyRedirectUri,
  SPOTIFY_NATIVE_REDIRECT_URI,
} from "./spotify-config";

export const SPOTIFY_REDIRECT_URI =
  SPOTIFY_NATIVE_REDIRECT_URI;

export const getSpotifyRedirectUri =
  getCanonicalSpotifyRedirectUri;
