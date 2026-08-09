import {
  createMusicProviderRegistry,
} from "../lib/music-provider";

import type {
  MusicProviderAdapter,
} from "../lib/music-provider";

import {
  createSpotifyMusicProviderAdapter,
} from "../lib/music-providers/spotify";

import type {
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "../lib/spotify-api";

import type {
  SpotifyConnectionGuard,
  SpotifyProfile,
} from "../lib/spotify-auth";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

type SpotifyAdapterDependencies =
  NonNullable<
    Parameters<
      typeof createSpotifyMusicProviderAdapter
    >[0]
  >;

const ACCOUNT_GUARD:
  SpotifyConnectionGuard = {
    profileId:
      "spotify-account-a",
    connectionGeneration:
      4,
    connectionAuthority:
      7,
    canalOwnerId:
      "canal-user-a",
    canalAccountGeneration:
      9,
  };

const TRACK_ID =
  "4uLU6hMCjMI75M1A2tKUQC";

const SECOND_TRACK_ID =
  "0VjIjW4GlUZAMYd2vXMi3b";

function spotifyTrack(
  trackId = TRACK_ID,
): SpotifyTrack {
  return {
    id:
      trackId,
    name:
      "  Provider Track  ",
    uri:
      `spotify:track:${trackId}`,
    href:
      `https://api.spotify.com/v1/tracks/${trackId}`,
    duration_ms:
      204_321,
    explicit:
      true,
    popularity:
      91,
    preview_url:
      "https://audio.example/preview.mp3",
    artists: [
      {
        id:
          "artist-a",
        name:
          "  Provider Artist  ",
        uri:
          "spotify:artist:artist-a",
        href:
          "https://api.spotify.com/v1/artists/artist-a",
      },
    ],
    album: {
      id:
        "album-a",
      name:
        "  Provider Album  ",
      uri:
        "spotify:album:album-a",
      imageUrl:
        "https://i.scdn.co/image/album-a",
      popularity:
        88,
    } as SpotifyTrack["album"],
    external_urls: {
      spotify:
        `https://open.spotify.com/track/${trackId}`,
    },
  };
}

function spotifyArtist(): SpotifyArtist {
  return {
    id:
      "artist-a",
    name:
      "  Provider Artist  ",
    uri:
      "spotify:artist:artist-a",
    genres: [
      "ambient",
      " ambient ",
      "",
    ],
    popularity:
      99,
    images: [
      {
        url:
          "https://images.example/artist.jpg",
      },
    ],
  };
}

function spotifyPlaylist(): SpotifyPlaylist {
  return {
    id:
      "playlist-a",
    name:
      "  Provider Playlist  ",
    uri:
      "spotify:playlist:playlist-a",
    public:
      false,
    owner: {
      id:
        "spotify-account-a",
    },
    external_urls: {
      spotify:
        "https://open.spotify.com/playlist/playlist-a",
    },
    tracks: {
      total:
        12,
    },
  };
}

function spotifyProfile(): SpotifyProfile {
  return {
    id:
      "spotify-account-a",
    display_name:
      "  Listener A  ",
    email:
      "listener@example.com",
    country:
      "US",
    accessToken:
      "must-not-leak",
    images: [
      {
        url:
          "https://images.example/listener.jpg",
      },
    ],
  };
}

function spotifyLibrarySnapshot():
  SpotifyLibrarySnapshot {
  return {
    syncedAt:
      "2026-07-28T12:00:00.000Z",
    profile:
      spotifyProfile(),
    topArtists: [
      spotifyArtist(),
    ],
    topTracks: [
      spotifyTrack(),
    ],
    recentTracks: [],
    savedTracks: [],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [
      spotifyPlaylist(),
    ],
    topGenres: [
      {
        name:
          " ambient ",
        count:
          2.8,
      },
    ],
    trackGenres: {
      [TRACK_ID]: [
        "ambient",
        " ambient ",
        "",
      ],
    },
    warnings: [
      " cached snapshot ",
      "",
    ],
  };
}

function createDependencies(
  overrides: Partial<
    SpotifyAdapterDependencies
  > = {},
): SpotifyAdapterDependencies {
  return {
    requireLibrarySession:
      jest.fn(
        async () => ({
          connectionGuard:
            ACCOUNT_GUARD,
        }),
      ),
    requireExportSession:
      jest.fn(
        async () => ({
          connectionGuard:
            ACCOUNT_GUARD,
        }),
      ),
    assertGuardCurrent:
      jest.fn(
        async () =>
          undefined,
      ),
    searchTracks:
      jest.fn(
        async () => [
          spotifyTrack(),
        ],
      ),
    readLibrary:
      jest.fn(
        async () =>
          spotifyLibrarySnapshot(),
      ),
    syncLibrary:
      jest.fn(
        async () =>
          spotifyLibrarySnapshot(),
      ),
    createPlaylist:
      jest.fn(
        async () =>
          spotifyPlaylist(),
      ),
    addItems:
      jest.fn(
        async () =>
          undefined,
      ),
    ...overrides,
  };
}

function collectObjectKeys(
  value: unknown,
): string[] {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return [];
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.flatMap(
      collectObjectKeys,
    );
  }

  return Object.entries(
    value,
  ).flatMap(
    ([
      key,
      nestedValue,
    ]) => [
      key,
      ...collectObjectKeys(
        nestedValue,
      ),
    ],
  );
}

describe(
  "music provider adapter boundary",
  () => {
    it(
      "normalizes catalog output without leaking provider payload or credentials",
      async () => {
        const dependencies =
          createDependencies({
            searchTracks:
              jest.fn(
                async () => [
                  spotifyTrack(),
                  {
                    ...spotifyTrack(
                      SECOND_TRACK_ID,
                    ),
                    artists:
                      [],
                  },
                ],
              ),
          });
        const adapter =
          createSpotifyMusicProviderAdapter(
            dependencies,
          );

        const result =
          await adapter.searchCatalog(
            {
              query:
                "  focus  ",
              limit:
                99,
            },
          );

        expect(
          dependencies.searchTracks,
        ).toHaveBeenCalledWith(
          "focus",
          10,
          {
            connectionGuard:
              ACCOUNT_GUARD,
          },
        );
        expect(
          dependencies.assertGuardCurrent,
        ).toHaveBeenCalledWith(
          ACCOUNT_GUARD,
        );
        expect(
          result,
        ).toEqual([
          {
            reference: {
              providerId:
                "spotify",
              itemId:
                TRACK_ID,
              uri:
                `spotify:track:${TRACK_ID}`,
              webUrl:
                `https://open.spotify.com/track/${TRACK_ID}`,
            },
            name:
              "Provider Track",
            durationMs:
              204_321,
            explicit:
              true,
            artists: [
              {
                artistId:
                  "artist-a",
                name:
                  "Provider Artist",
              },
            ],
            album: {
              albumId:
                "album-a",
              name:
                "Provider Album",
              imageUrl:
                "https://i.scdn.co/image/album-a",
            },
          },
        ]);

        expect(
          collectObjectKeys(
            result,
          ),
        ).not.toEqual(
          expect.arrayContaining([
            "accessToken",
            "authorization",
            "email",
            "headers",
            "href",
            "popularity",
            "preview_url",
            "refreshToken",
            "session",
          ]),
        );
      },
    );

    it(
      "rejects a catalog result when the captured account guard becomes stale",
      async () => {
        const dependencies =
          createDependencies({
            assertGuardCurrent:
              jest.fn(
                async () => {
                  throw new Error(
                    "The connected account changed.",
                  );
                },
              ),
          });
        const adapter =
          createSpotifyMusicProviderAdapter(
            dependencies,
          );

        await expect(
          adapter.searchCatalog(
            {
              query:
                "focus",
            },
          ),
        ).rejects.toThrow(
          "connected account changed",
        );
      },
    );

    it(
      "normalizes library data into provider-neutral safe values",
      async () => {
        const dependencies =
          createDependencies();
        const adapter =
          createSpotifyMusicProviderAdapter(
            dependencies,
          );

        const snapshot =
          await adapter
            .readLibrarySnapshot();

        expect(
          snapshot,
        ).not.toBeNull();

        if (!snapshot) {
          throw new Error(
            "Expected a normalized library snapshot.",
          );
        }

        expect(
          snapshot.account,
        ).toEqual({
          accountId:
            "spotify-account-a",
          displayName:
            "Listener A",
          avatarUrl:
            "https://images.example/listener.jpg",
        });
        expect(
          snapshot.topArtists,
        ).toEqual([
          {
            reference: {
              providerId:
                "spotify",
              artistId:
                "artist-a",
            },
            name:
              "Provider Artist",
            genres: [
              "ambient",
            ],
            imageUrl:
              "https://images.example/artist.jpg",
          },
        ]);
        expect(
          snapshot.playlists,
        ).toEqual([
          {
            reference: {
              providerId:
                "spotify",
              playlistId:
                "playlist-a",
              uri:
                "spotify:playlist:playlist-a",
              webUrl:
                "https://open.spotify.com/playlist/playlist-a",
            },
            name:
              "Provider Playlist",
            trackCount:
              12,
          },
        ]);
        expect(
          snapshot.topGenres,
        ).toEqual([
          {
            name:
              "ambient",
            count:
              2,
          },
        ]);
        expect(
          snapshot.trackGenres,
        ).toEqual({
          [TRACK_ID]: [
            "ambient",
          ],
        });
        expect(
          snapshot.warnings,
        ).toEqual([
          "cached snapshot",
        ]);
        expect(
          collectObjectKeys(
            snapshot,
          ),
        ).not.toEqual(
          expect.arrayContaining([
            "accessToken",
            "country",
            "email",
            "followers",
            "href",
            "popularity",
            "preview_url",
            "product",
            "refreshToken",
            "session",
          ]),
        );
      },
    );

    it(
      "pins both export writes to one guard and returns only a neutral receipt",
      async () => {
        const dependencies =
          createDependencies();
        const adapter =
          createSpotifyMusicProviderAdapter(
            dependencies,
          );

        const result =
          await adapter.exportScene(
            {
              name:
                "  Night Drive  ",
              activity:
                "driving",
              tracks: [
                {
                  providerId:
                    "spotify",
                  itemId:
                    TRACK_ID,
                  uri:
                    `spotify:track:${TRACK_ID}`,
                },
                {
                  providerId:
                    "spotify",
                  itemId:
                    TRACK_ID,
                  webUrl:
                    `https://open.spotify.com/track/${TRACK_ID}`,
                },
                {
                  providerId:
                    "spotify",
                  itemId:
                    SECOND_TRACK_ID,
                  webUrl:
                    `https://open.spotify.com/track/${SECOND_TRACK_ID}`,
                },
                {
                  providerId:
                    "apple-music",
                  itemId:
                    "apple-track-a",
                },
                {
                  providerId:
                    "spotify",
                  itemId:
                    "invalid",
                  uri:
                    "spotify:track:invalid",
                },
              ],
            },
          );

        expect(
          dependencies.createPlaylist,
        ).toHaveBeenCalledWith(
          {
            name:
              "Canal: Night Drive",
            description:
              "A Scene exported from Canal for driving.",
            isPublic:
              false,
          },
          {
            connectionGuard:
              ACCOUNT_GUARD,
          },
        );
        expect(
          dependencies.addItems,
        ).toHaveBeenCalledWith(
          "playlist-a",
          [
            `spotify:track:${TRACK_ID}`,
            `spotify:track:${SECOND_TRACK_ID}`,
          ],
          {
            connectionGuard:
              ACCOUNT_GUARD,
          },
        );
        expect(
          dependencies.assertGuardCurrent,
        ).toHaveBeenNthCalledWith(
          1,
          ACCOUNT_GUARD,
        );
        expect(
          dependencies.assertGuardCurrent,
        ).toHaveBeenNthCalledWith(
          2,
          ACCOUNT_GUARD,
        );
        expect(
          result,
        ).toEqual({
          providerId:
            "spotify",
          collectionId:
            "playlist-a",
          collectionUri:
            "spotify:playlist:playlist-a",
          collectionUrl:
            "https://open.spotify.com/playlist/playlist-a",
          exportedTrackCount:
            2,
          skippedTrackCount:
            3,
        });
        expect(
          collectObjectKeys(
            result,
          ),
        ).not.toEqual(
          expect.arrayContaining([
            "accessToken",
            "authorization",
            "headers",
            "owner",
            "session",
            "token",
          ]),
        );
      },
    );

    it(
      "stops export before the second write when the account changes after create",
      async () => {
        const dependencies =
          createDependencies({
            assertGuardCurrent:
              jest.fn(
                async () => {
                  throw new Error(
                    "The connected account changed.",
                  );
                },
              ),
          });
        const adapter =
          createSpotifyMusicProviderAdapter(
            dependencies,
          );

        await expect(
          adapter.exportScene(
            {
              name:
                "Pinned export",
              tracks: [
                {
                  providerId:
                    "spotify",
                  itemId:
                    TRACK_ID,
                  uri:
                    `spotify:track:${TRACK_ID}`,
                },
              ],
            },
          ),
        ).rejects.toThrow(
          "connected account changed",
        );
        expect(
          dependencies.addItems,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects the receipt when the account changes during the second write",
      async () => {
        const assertGuardCurrent =
          jest.fn(
            async () => {
              if (
                assertGuardCurrent
                  .mock.calls
                  .length ===
                2
              ) {
                throw new Error(
                  "The connected account changed.",
                );
              }
            },
          );
        const dependencies =
          createDependencies({
            assertGuardCurrent,
          });
        const adapter =
          createSpotifyMusicProviderAdapter(
            dependencies,
          );

        await expect(
          adapter.exportScene(
            {
              name:
                "Pinned export",
              tracks: [
                {
                  providerId:
                    "spotify",
                  itemId:
                    TRACK_ID,
                  uri:
                    `spotify:track:${TRACK_ID}`,
                },
              ],
            },
          ),
        ).rejects.toThrow(
          "connected account changed",
        );
        expect(
          dependencies.addItems,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "uses declared capabilities to block unsupported provider workflows",
      () => {
        const noExportProvider:
          MusicProviderAdapter = {
            descriptor: {
              id:
                "apple-music",
              displayName:
                "Apple Music",
              capabilities: [
                "catalog-search",
              ],
            },
            searchCatalog:
              async () =>
                [],
            readLibrarySnapshot:
              async () =>
                null,
            syncLibrary:
              async () => {
                throw new Error(
                  "Not supported.",
                );
              },
            exportScene:
              async () => {
                throw new Error(
                  "Not supported.",
                );
              },
          };
        const registry =
          createMusicProviderRegistry([
            noExportProvider,
          ]);

        expect(
          registry.require(
            "apple-music",
            "catalog-search",
          ),
        ).toBe(
          noExportProvider,
        );
        expect(() =>
          registry.require(
            "apple-music",
            "scene-export",
          ),
        ).toThrow(
          "does not support scene-export",
        );
        expect(() =>
          createMusicProviderRegistry([
            noExportProvider,
            noExportProvider,
          ]),
        ).toThrow(
          "more than once",
        );
      },
    );
  },
);
