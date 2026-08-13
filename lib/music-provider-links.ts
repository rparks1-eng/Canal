import type { MusicProviderId } from "./music-provider-model";
import { canonicalSpotifyTrackUrl } from "./spotify-track-links";

export function canonicalAppleMusicUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;

  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== "https:" ||
      (host !== "music.apple.com" && host !== "geo.music.apple.com") ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.hash ||
      !parsed.pathname.startsWith("/")
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function canonicalMusicProviderUrl(
  providerId: MusicProviderId | undefined,
  providerUrl: unknown,
  spotifyUri?: unknown,
): string | null {
  if (providerId === "apple-music") return canonicalAppleMusicUrl(providerUrl);
  if (providerId === "spotify") return canonicalSpotifyTrackUrl(providerUrl, spotifyUri);
  return null;
}
