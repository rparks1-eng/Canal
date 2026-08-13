import { readAppleMusicLibrarySnapshot } from "./apple-music";
import type { MusicProviderId } from "./music-provider-model";
import type { SongGenreEvidence } from "./song-dna";
import { readSpotifyLibrarySnapshot } from "./spotify-library";
import {
  assertCanalAccountSessionGuardCurrent,
  captureCanalAccountSessionGuard,
} from "./canal-auth";

export type ProviderSongMetadata = Readonly<{
  artworkUrl?: string;
  providerUrl?: string;
  providerId?: MusicProviderId;
  providerTrackId?: string;
  genreEvidence: readonly SongGenreEvidence[];
}>;

function identity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLowerCase();
}

export async function readProviderSongMetadata(input: {
  trackId: string;
  providerId?: MusicProviderId;
  providerTrackId?: string;
  title?: string;
  artist?: string;
}): Promise<ProviderSongMetadata> {
  const guard = await captureCanalAccountSessionGuard();
  const [spotifyResult, appleResult] = await Promise.allSettled([
    readSpotifyLibrarySnapshot(),
    readAppleMusicLibrarySnapshot(),
  ]);
  await assertCanalAccountSessionGuardCurrent(guard);
  const spotify = spotifyResult.status === "fulfilled" ? spotifyResult.value : null;
  const apple = appleResult.status === "fulfilled" ? appleResult.value : null;
  const requestedTitle = identity(input.title ?? "");
  const requestedArtist = identity(input.artist ?? "");
  const spotifyTracks = spotify ? [
    ...spotify.recentTracks,
    ...spotify.topTracks,
    ...spotify.savedTracks,
    ...spotify.playlistTracks,
    ...spotify.discoveryTracks,
  ] : [];
  const appleTracks = apple ? [
    ...apple.recentTracks,
    ...apple.topTracks,
    ...apple.savedTracks,
    ...apple.playlistTracks,
    ...apple.discoveryTracks,
  ] : [];
  const spotifyTrack = spotifyTracks.find((candidate) =>
    candidate.id === input.trackId ||
    (input.providerId === "spotify" && candidate.id === input.providerTrackId) ||
    (requestedTitle && requestedArtist && identity(candidate.name) === requestedTitle &&
      identity(candidate.artists[0]?.name ?? "") === requestedArtist),
  );
  const appleTrack = appleTracks.find((candidate) =>
    candidate.reference.itemId === input.trackId ||
    `apple-music:${candidate.reference.itemId}` === input.trackId ||
    (input.providerId === "apple-music" && candidate.reference.itemId === input.providerTrackId) ||
    (requestedTitle && requestedArtist && identity(candidate.name) === requestedTitle &&
      identity(candidate.artists[0]?.name ?? "") === requestedArtist),
  );
  if (!spotifyTrack && !appleTrack) return { genreEvidence: [] };

  const providerId: MusicProviderId = input.providerId === "apple-music" && appleTrack
    ? "apple-music"
    : input.providerId === "spotify" && spotifyTrack
      ? "spotify"
      : appleTrack ? "apple-music" : "spotify";
  const artworkUrl = appleTrack?.album?.imageUrl ??
    spotifyTrack?.album?.imageUrl ?? spotifyTrack?.album?.images?.[0]?.url;
  const appleGenres = appleTrack ? [
    ...(appleTrack.genres ?? []),
    ...(apple?.trackGenres[appleTrack.reference.itemId] ?? []),
  ] : [];
  const spotifyGenres = spotifyTrack ? spotify?.trackGenres[spotifyTrack.id] ?? [] : [];
  const providerTrackId = providerId === "apple-music"
    ? appleTrack?.reference.itemId
    : spotifyTrack?.id;
  const providerUrl = providerId === "apple-music"
    ? appleTrack?.reference.webUrl
    : spotifyTrack?.external_urls?.spotify;
  return {
    ...(artworkUrl ? { artworkUrl } : {}),
    ...(providerUrl ? { providerUrl } : {}),
    providerId,
    ...(providerTrackId ? { providerTrackId } : {}),
    genreEvidence: [
      ...(appleGenres.length ? [{ provider: "apple-music" as const, genres: appleGenres }] : []),
      ...(spotifyGenres.length ? [{ provider: "spotify" as const, genres: spotifyGenres }] : []),
    ],
  };
}
