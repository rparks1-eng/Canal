import {
  CanalAppleMusic,
} from "../../modules/canal-apple-music";

import {
  assertCanalAccountSessionGuardCurrent,
  captureCanalAccountSessionGuard,
} from "../canal-auth";

import {
  normalizeAppleMusicTrack,
  readAppleMusicLibrarySnapshot,
  syncAppleMusicLibrary,
} from "../apple-music";

import type {
  MusicCatalogTrack,
  MusicItemReference,
  MusicSceneExportRequest,
} from "../music-provider-model";

import type {
  MusicProviderAdapter,
} from "../music-provider";

export function createAppleMusicProviderAdapter(): MusicProviderAdapter {
  return {
    descriptor: {
      id: "apple-music",
      displayName: "Apple Music",
      capabilities: [
        "catalog-search",
        "library-sync",
        "scene-export",
      ],
    },

    searchCatalog: async (request) => {
      const query = request.query.trim();
      if (query.length < 2) {
        throw new Error(
          "Enter at least two characters to search Apple Music.",
        );
      }

      const guard =
        await captureCanalAccountSessionGuard();
      const tracks =
        await CanalAppleMusic.searchCatalog(
          query,
          Math.min(Math.max(Math.trunc(request.limit ?? 10), 1), 10),
        );

      await assertCanalAccountSessionGuardCurrent(guard);
      return tracks.map(normalizeAppleMusicTrack);
    },

    readLibrarySnapshot:
      readAppleMusicLibrarySnapshot,

    syncLibrary:
      syncAppleMusicLibrary,

    exportScene:
      exportAppleMusicScene,
  };
}

export const appleMusicProvider =
  createAppleMusicProviderAdapter();

async function exportAppleMusicScene(
  request: MusicSceneExportRequest,
) {
  const guard =
    await captureCanalAccountSessionGuard();
  const resolved =
    await resolveAppleMusicTracks(request.tracks);

  await assertCanalAccountSessionGuardCurrent(guard);

  if (resolved.length === 0) {
    throw new Error(
      "Canal could not match this Scene's tracks in Apple Music.",
    );
  }

  const receipt =
    await CanalAppleMusic.createPlaylist(
      request.name,
      request.description?.trim() ||
        `A Canal Scene for ${request.activity?.toLowerCase() || "this moment"}.`,
      resolved.map((track) => track.reference.itemId),
    );

  await assertCanalAccountSessionGuardCurrent(guard);

  return {
    providerId: "apple-music" as const,
    collectionId: receipt.id,
    collectionUri: null,
    collectionUrl: receipt.url,
    exportedTrackCount: receipt.trackCount,
    skippedTrackCount: Math.max(0, request.tracks.length - receipt.trackCount),
  };
}

async function resolveAppleMusicTracks(
  references: readonly MusicItemReference[],
): Promise<MusicCatalogTrack[]> {
  const results: MusicCatalogTrack[] = [];

  for (const reference of references.slice(0, 100)) {
    if (!reference.name) {
      continue;
    }

    const artist = reference.artistNames?.[0]?.trim() ?? "";
    const query = [reference.name, artist].filter(Boolean).join(" ");
    const matches =
      await CanalAppleMusic.searchCatalog(query, 5);
    const normalizedName = normalizeMatchText(reference.name);
    const normalizedArtist = normalizeMatchText(artist);
    const best =
      matches.find((match) =>
        normalizeMatchText(match.name) === normalizedName &&
        (!normalizedArtist || normalizeMatchText(match.artistName) === normalizedArtist),
      ) ?? matches.find((match) => normalizeMatchText(match.name) === normalizedName);

    if (best) {
      results.push(normalizeAppleMusicTrack(best));
    }
  }

  return Array.from(
    new Map(results.map((track) => [track.reference.itemId, track])).values(),
  );
}

function normalizeMatchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLowerCase();
}
