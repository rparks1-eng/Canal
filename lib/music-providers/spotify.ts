import {
  addSpotifyItemsToPlaylist,
  createSpotifyPlaylist,
  searchSpotifyCatalogTracks,
} from "../spotify-api";

import type {
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "../spotify-api";

import {
  assertSpotifyConnectionGuardCurrent,
  requireGuardedSpotifyLibrarySession,
  requireGuardedSpotifyPlaylistExportSession,
} from "../spotify-auth";

import type {
  SpotifyConnectionGuard,
  SpotifyProfile,
} from "../spotify-auth";

import {
  readSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "../spotify-library";

import type {
  SpotifyLibrarySnapshot,
} from "../spotify-library";

import {
  normalizeSpotifyTrackLinks,
} from "../spotify-track-links";

import type {
  MusicCatalogTrack,
  MusicItemReference,
  MusicLibraryArtist,
  MusicLibraryPlaylist,
  MusicLibrarySnapshot,
  MusicSceneExportRequest,
} from "../music-provider-model";

import type {
  MusicProviderAdapter,
} from "../music-provider";

type SpotifyGuardResult = {
  connectionGuard:
    SpotifyConnectionGuard;
};

type SpotifyMusicProviderDependencies = {
  requireLibrarySession():
    Promise<SpotifyGuardResult>;

  requireExportSession():
    Promise<SpotifyGuardResult>;

  assertGuardCurrent(
    connectionGuard:
      SpotifyConnectionGuard,
  ): Promise<void>;

  searchTracks(
    query: string,
    limit: number,
    options: {
      connectionGuard:
        SpotifyConnectionGuard;
    },
  ): Promise<SpotifyTrack[]>;

  readLibrary():
    Promise<
      SpotifyLibrarySnapshot | null
    >;

  syncLibrary():
    Promise<
      SpotifyLibrarySnapshot
    >;

  createPlaylist(
    input: {
      name: string;
      description: string;
      isPublic: boolean;
    },
    options: {
      connectionGuard:
        SpotifyConnectionGuard;
    },
  ): Promise<SpotifyPlaylist>;

  addItems(
    playlistId: string,
    uris: string[],
    options: {
      connectionGuard:
        SpotifyConnectionGuard;
    },
  ): Promise<void>;
};

const defaultDependencies:
  SpotifyMusicProviderDependencies = {
    requireLibrarySession:
      requireGuardedSpotifyLibrarySession,

    requireExportSession:
      requireGuardedSpotifyPlaylistExportSession,

    assertGuardCurrent:
      assertSpotifyConnectionGuardCurrent,

    searchTracks:
      searchSpotifyCatalogTracks,

    readLibrary:
      readSpotifyLibrarySnapshot,

    syncLibrary:
      syncSpotifyLibrary,

    createPlaylist:
      createSpotifyPlaylist,

    addItems:
      addSpotifyItemsToPlaylist,
  };

export function createSpotifyMusicProviderAdapter(
  dependencies:
    SpotifyMusicProviderDependencies =
      defaultDependencies,
): MusicProviderAdapter {
  return {
    descriptor: {
      id: "spotify",
      displayName: "Spotify",
      capabilities: [
        "catalog-search",
        "library-sync",
        "scene-export",
      ],
    },

    searchCatalog:
      async (
        request,
      ) => {
        const query =
          request.query.trim();

        if (
          query.length <
          2
        ) {
          throw new Error(
            "Enter at least two characters to search this music service.",
          );
        }

        const limit =
          Math.min(
            Math.max(
              Math.trunc(
                request.limit ??
                  10,
              ),
              1,
            ),
            10,
          );
        const {
          connectionGuard,
        } =
          await dependencies
            .requireLibrarySession();
        const tracks =
          await dependencies
            .searchTracks(
              query,
              limit,
              {
                connectionGuard,
              },
            );

        await dependencies
          .assertGuardCurrent(
            connectionGuard,
          );

        return tracks
          .map(
            normalizeSpotifyTrack,
          )
          .filter(
            (
              track,
            ): track is MusicCatalogTrack =>
              track !== null,
          );
      },

    readLibrarySnapshot:
      async () => {
        const snapshot =
          await dependencies
            .readLibrary();

        return snapshot
          ? normalizeSpotifyLibrarySnapshot(
              snapshot,
            )
          : null;
      },

    syncLibrary:
      async () =>
        normalizeSpotifyLibrarySnapshot(
          await dependencies
            .syncLibrary(),
        ),

    exportScene:
      async (
        request,
      ) =>
        exportSpotifyScene(
          request,
          dependencies,
        ),
  };
}

export const spotifyMusicProvider =
  createSpotifyMusicProviderAdapter();

function normalizeSpotifyTrack(
  track:
    SpotifyTrack,
): MusicCatalogTrack | null {
  const trackId =
    cleanText(
      track.id,
    );
  const name =
    cleanText(
      track.name,
    );
  const artists =
    Array.isArray(
      track.artists,
    )
      ? track.artists
          .map(
            (artist) => {
              const artistName =
                cleanText(
                  artist.name,
                );

              return artistName
                ? {
                    ...(cleanText(
                      artist.id,
                    )
                      ? {
                          artistId:
                            cleanText(
                              artist.id,
                            ),
                        }
                      : {}),
                    name:
                      artistName,
                  }
                : null;
            },
          )
          .filter(
            (
              artist,
            ): artist is {
              artistId?: string;
              name: string;
            } =>
              artist !== null,
          )
      : [];

  if (
    !trackId ||
    !name ||
    artists.length ===
      0
  ) {
    return null;
  }

  const albumId =
    cleanText(
      track.album?.id,
    );
  const albumName =
    cleanText(
      track.album?.name,
    );
  const albumImageUrl =
    cleanText(track.album?.imageUrl) ??
    cleanText(track.album?.images?.[0]?.url);
  const safeAlbumImageUrl =
    albumImageUrl?.startsWith("https://")
      ? albumImageUrl
      : undefined;
  const uri =
    cleanText(
      track.uri,
    );
  const webUrl =
    cleanText(
      track.external_urls
        ?.spotify,
    );

  return {
    reference: {
      providerId:
        "spotify",
      itemId:
        trackId,
      ...(uri
        ? {
            uri,
          }
        : {}),
      ...(webUrl
        ? {
            webUrl,
          }
        : {}),
    },
    name,
    durationMs:
      typeof track.duration_ms ===
        "number" &&
      Number.isFinite(
        track.duration_ms,
      ) &&
      track.duration_ms >
        0
        ? Math.round(
            track.duration_ms,
          )
        : 210_000,
    explicit:
      track.explicit ===
      true,
    artists,
    ...(albumId ||
    albumName ||
    safeAlbumImageUrl
      ? {
          album: {
            ...(albumId
              ? {
                  albumId,
                }
              : {}),
            ...(albumName
              ? {
                  name:
                    albumName,
                }
              : {}),
            ...(safeAlbumImageUrl
              ? { imageUrl: safeAlbumImageUrl }
              : {}),
          },
        }
      : {}),
  };
}

function normalizeSpotifyLibrarySnapshot(
  snapshot:
    SpotifyLibrarySnapshot,
): MusicLibrarySnapshot {
  return {
    providerId:
      "spotify",
    syncedAt:
      snapshot.syncedAt,
    account:
      normalizeSpotifyProfile(
        snapshot.profile,
      ),
    topArtists:
      normalizeSpotifyArtists(
        snapshot.topArtists,
      ),
    topTracks:
      normalizeSpotifyTracks(
        snapshot.topTracks,
      ),
    recentTracks:
      normalizeSpotifyTracks(
        snapshot.recentTracks,
      ),
    savedTracks:
      normalizeSpotifyTracks(
        snapshot.savedTracks,
      ),
    playlistTracks:
      normalizeSpotifyTracks(
        snapshot.playlistTracks,
      ),
    discoveryTracks:
      normalizeSpotifyTracks(
        snapshot.discoveryTracks,
      ),
    playlists:
      normalizeSpotifyPlaylists(
        snapshot.playlists,
      ),
    topGenres:
      snapshot.topGenres
        .map(
          (genre) => ({
            name:
              cleanText(
                genre.name,
              ),
            count:
              Math.max(
                0,
                Math.trunc(
                  genre.count,
                ),
              ),
          }),
        )
        .filter(
          (genre) =>
            Boolean(
              genre.name,
            ),
        ),
    trackGenres:
      Object.fromEntries(
        Object.entries(
          snapshot.trackGenres,
        ).map(
          ([
            trackId,
            genres,
          ]) => [
            trackId,
            Array.from(
              new Set(
                genres
                  .map(
                    cleanText,
                  )
                  .filter(
                    Boolean,
                  ),
              ),
            ),
          ],
        ),
      ),
    warnings:
      snapshot.warnings
        .map(
          cleanText,
        )
        .filter(
          Boolean,
        ),
  };
}

function normalizeSpotifyProfile(
  profile:
    SpotifyProfile,
): MusicLibrarySnapshot["account"] {
  const avatarUrl =
    profile.images
      ?.map(
        (image) =>
          cleanText(
            image.url,
          ),
      )
      .find(
        Boolean,
      );

  return {
    accountId:
      cleanText(
        profile.id,
      ),
    displayName:
      cleanText(
        profile.display_name,
      ) ||
      "Spotify listener",
    ...(avatarUrl
      ? {
          avatarUrl,
        }
      : {}),
  };
}

function normalizeSpotifyArtists(
  artists:
    readonly SpotifyArtist[],
): MusicLibraryArtist[] {
  return artists
    .map(
      (
        artist,
      ): MusicLibraryArtist | null => {
        const artistId =
          cleanText(
            artist.id,
          );
        const name =
          cleanText(
            artist.name,
          );

        if (
          !artistId ||
          !name
        ) {
          return null;
        }

        const imageUrl =
          artist.images
            ?.map(
              (image) =>
                cleanText(
                  image.url,
                ),
            )
            .find(
              Boolean,
            );

        return {
          reference: {
            providerId:
              "spotify" as const,
            artistId,
          },
          name,
          genres:
            Array.from(
              new Set(
                (
                  artist.genres ??
                  []
                )
                  .map(
                    cleanText,
                  )
                  .filter(
                    Boolean,
                  ),
              ),
            ),
          ...(imageUrl
            ? {
                imageUrl,
              }
            : {}),
        };
      },
    )
    .filter(
      (
        artist,
      ): artist is MusicLibraryArtist =>
        artist !== null,
    );
}

function normalizeSpotifyTracks(
  tracks:
    readonly SpotifyTrack[],
): MusicCatalogTrack[] {
  return tracks
    .map(
      normalizeSpotifyTrack,
    )
    .filter(
      (
        track,
      ): track is MusicCatalogTrack =>
        track !== null,
    );
}

function normalizeSpotifyPlaylists(
  playlists:
    readonly SpotifyPlaylist[],
): MusicLibraryPlaylist[] {
  return playlists
    .map(
      (
        playlist,
      ): MusicLibraryPlaylist | null => {
        const playlistId =
          cleanText(
            playlist.id,
          );
        const name =
          cleanText(
            playlist.name,
          );

        if (
          !playlistId ||
          !name
        ) {
          return null;
        }

        const uri =
          cleanText(
            playlist.uri,
          );
        const webUrl =
          cleanText(
            playlist.external_urls
              ?.spotify,
          );

        return {
          reference: {
            providerId:
              "spotify" as const,
            playlistId,
            ...(uri
              ? {
                  uri,
                }
              : {}),
            ...(webUrl
              ? {
                  webUrl,
                }
              : {}),
          },
          name,
          trackCount:
            Math.max(
              0,
              Math.trunc(
                playlist.items
                  ?.total ??
                playlist.tracks
                  ?.total ??
                0,
              ),
            ),
        };
      },
    )
    .filter(
      (
        playlist,
      ): playlist is MusicLibraryPlaylist =>
        playlist !== null,
    );
}

async function exportSpotifyScene(
  request:
    MusicSceneExportRequest,
  dependencies:
    SpotifyMusicProviderDependencies,
) {
  const name =
    cleanText(
      request.name,
    );

  if (!name) {
    throw new Error(
      "A Scene name is required before export.",
    );
  }

  const uris =
    spotifyUrisForExport(
      request.tracks,
    );

  if (
    uris.length ===
    0
  ) {
    throw new Error(
      "This Scene has no tracks that this music service can export.",
    );
  }

  const {
    connectionGuard,
  } =
    await dependencies
      .requireExportSession();
  const playlist =
    await dependencies
      .createPlaylist(
        {
          name:
            `Canal: ${name}`.slice(
              0,
              100,
            ),
          description:
            (
              cleanText(
                request.description,
              ) ||
              `A Scene exported from Canal for ${cleanText(request.activity) || "listening"}.`
            ).slice(
              0,
              300,
            ),
          isPublic:
            false,
        },
        {
          connectionGuard,
        },
      );

  await dependencies
    .assertGuardCurrent(
      connectionGuard,
    );

  const playlistId =
    cleanText(
      playlist.id,
    );

  if (!playlistId) {
    throw new Error(
      "The music service created no usable playlist.",
    );
  }

  await dependencies
    .addItems(
      playlistId,
      uris,
      {
        connectionGuard,
      },
    );

  await dependencies
    .assertGuardCurrent(
      connectionGuard,
    );

  return {
    providerId:
      "spotify" as const,
    collectionId:
      playlistId,
    collectionUri:
      cleanText(
        playlist.uri,
      ) ||
      null,
    collectionUrl:
      cleanText(
        playlist.external_urls
          ?.spotify,
      ) ||
      null,
    exportedTrackCount:
      uris.length,
    skippedTrackCount:
      Math.max(
        0,
        request.tracks.length -
          uris.length,
      ),
  };
}

function spotifyUrisForExport(
  references:
    readonly MusicItemReference[],
): string[] {
  return Array.from(
    new Set(
      references
        .filter(
          (reference) =>
            reference.providerId ===
            "spotify",
        )
        .map(
          (reference) =>
            normalizeSpotifyTrackLinks(
              reference.uri,
              reference.webUrl,
            ).spotifyUri,
        )
        .filter(
          (
            uri,
          ): uri is string =>
            Boolean(
              uri,
            ),
        ),
    ),
  );
}

function cleanText(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}
