import {
  mockAsyncStorage,
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  mockSecureStore,
  mockSecureValues,
} from "./helpers/secure-store-mock";

import {
  supabase,
} from "../lib/supabase";

import {
  CANAL_REQUIRED_SPOTIFY_SCOPES,
} from "../lib/spotify-config";

import {
  clearSpotifySession,
  saveSpotifySession,
} from "../lib/spotify-auth";

import type {
  SpotifySession,
} from "../lib/spotify-auth";

import {
  getLatestSpotifyLibrarySnapshot,
  readSpotifyLibraryImportStatus,
  readSpotifyLibrarySnapshot,
  saveSpotifyLibrarySnapshot,
  SpotifyLibraryImportIncompleteError,
  syncSpotifyLibrary,
} from "../lib/spotify-library";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

let mockCanalOwnerId:
  string | null =
  "canal-user-a";

jest.mock(
  "../lib/supabase",
  () => ({
    get isSupabaseConfigured() {
      return true;
    },
    supabase: {
      auth: {
        getSession: jest.fn(),
      },
    },
  }),
);

const mockGetSession =
  jest.mocked(
    supabase.auth.getSession,
  );

function mockCanalSession() {
  return {
    data: {
      session: mockCanalOwnerId
        ? {
            user: {
              id: mockCanalOwnerId,
            },
          }
        : null,
    },
    error: null,
  } as never;
}

function session(
  profileId: string,
): SpotifySession {
  return {
    accessToken: `access-${profileId}`,
    refreshToken: `refresh-${profileId}`,
    expiresAt:
      Date.now() +
      60 * 60 * 1000,
    tokenType: "Bearer",
    scope:
      CANAL_REQUIRED_SPOTIFY_SCOPES.join(
        " ",
      ),
    profile: {
      id: profileId,
      display_name: profileId,
    },
  };
}

function response(
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    text: async () =>
      JSON.stringify(payload),
    headers: {
      get: (name: string) =>
        headers[name.toLowerCase()] ??
        null,
    },
  } as Response;
}

function track(index: number) {
  return {
    id: `track-${index}`,
    name: `Track ${index}`,
    uri: `spotify:track:${index}`,
    artists: [
      {
        id: "artist-1",
        name: "Artist",
        uri: "spotify:artist:1",
      },
    ],
  };
}

function adversarialTrack(index: number) {
  return {
    ...track(index),
    href:
      `https://api.spotify.com/v1/tracks/${index}`,
    preview_url:
      `https://audio.example/preview-${index}.mp3`,
    external_urls: {
      spotify:
        `https://open.spotify.com/track/${index}`,
    },
    authorization:
      `Bearer forbidden-${index}`,
    headers: {
      authorization:
        `Bearer forbidden-${index}`,
    },
    nestedUnknownProviderPayload: {
      token:
        `forbidden-token-${index}`,
    },
    album: {
      id: `album-${index}`,
      name: `Album ${index}`,
      uri:
        `spotify:album:${index}`,
      images: [
        {
          url:
            `https://images.example/album-${index}.jpg`,
        },
      ],
      external_urls: {
        spotify:
          `https://open.spotify.com/album/${index}`,
      },
    },
    artists: [
      {
        id: "artist-1",
        name: "Artist",
        uri: "spotify:artist:1",
        href:
          "https://api.spotify.com/v1/artists/artist-1",
        external_urls: {
          spotify:
            "https://open.spotify.com/artist/artist-1",
        },
      },
    ],
  };
}

function collectObjectKeys(
  value: unknown,
  keys: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeys(
        item,
        keys,
      );
    }

    return keys;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (
      const [key, nestedValue] of Object.entries(
        value,
      )
    ) {
      keys.push(key);
      collectObjectKeys(
        nestedValue,
        keys,
      );
    }
  }

  return keys;
}

function collectStringValues(
  value: unknown,
  values: string[] = [],
): string[] {
  if (typeof value === "string") {
    values.push(value);

    return values;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(
        item,
        values,
      );
    }

    return values;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (const nestedValue of Object.values(value)) {
      collectStringValues(
        nestedValue,
        values,
      );
    }
  }

  return values;
}

function expectPersistedLibraryDataToBeSafe(
  value: unknown,
): void {
  expect(
    collectObjectKeys(value),
  ).not.toEqual(
    expect.arrayContaining([
      "accessToken",
      "authorization",
      "external_urls",
      "headers",
      "href",
      "images",
      "nestedUnknownProviderPayload",
      "preview_url",
      "refreshToken",
      "token",
      "url",
    ]),
  );

  expect(
    collectStringValues(value).join("\n"),
  ).not.toMatch(
    /audio\.example|forbidden-|images\.example|open\.spotify\.com|api\.spotify\.com/u,
  );
}

function snapshot(
  profileId: string,
): SpotifyLibrarySnapshot {
  return {
    syncedAt:
      new Date().toISOString(),
    profile: {
      id: profileId,
      display_name: profileId,
    },
    topArtists: [],
    topTracks: [],
    recentTracks: [],
    savedTracks: [track(9999)],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [],
    trackGenres: {},
    warnings: [],
  };
}

function urlOffset(
  url: string,
): number {
  return Number(
    new URL(url).searchParams.get(
      "offset",
    ) ?? "0",
  );
}

describe(
  "Spotify full-library import",
  () => {
    beforeEach(async () => {
      mockCanalOwnerId =
        "canal-user-a";
      mockGetSession.mockImplementation(
        async () =>
          mockCanalSession(),
      );
      await clearSpotifySession();
      mockStorage.clear();
      mockSecureValues.clear();
      jest.restoreAllMocks();
    });

    it(
      "imports thousands of saved tracks, all playlists, and permitted playlist items with bounded access",
      async () => {
        await saveSpotifySession(
          session("spotify-a"),
          { syncLibrary: false },
        );

        const requestedUrls: string[] = [];
        const followedPlaylistId =
          "playlist-followed";

        jest.spyOn(global, "fetch").mockImplementation(
          async (input) => {
            const url = String(input);
            requestedUrls.push(url);

            if (
              url.includes("/me/top/") ||
              url.includes("/recently-played")
            ) {
              return response(200, { items: [] });
            }

            if (url.includes("/me/tracks")) {
              const offset = urlOffset(url);
              const total = 1200;
              const items = Array.from(
                {
                  length: Math.min(50, total - offset),
                },
                (_, index) => ({
                  added_at: "2030-01-01T00:00:00.000Z",
                  track: track(offset + index),
                }),
              );

              return response(200, {
                items,
                offset,
                total,
                next:
                  offset + items.length < total
                    ? `https://api.spotify.com/v1/me/tracks?limit=50&offset=${offset + items.length}`
                    : null,
              });
            }

            if (url.includes("/me/playlists")) {
              const offset = urlOffset(url);
              const total = 52;
              const items = Array.from(
                {
                  length: Math.min(50, total - offset),
                },
                (_, index) => {
                  const playlistIndex =
                    offset + index;
                  const id =
                    playlistIndex === 51
                      ? followedPlaylistId
                      : `playlist-${playlistIndex}`;

                  return {
                    id,
                    name: `Playlist ${playlistIndex}`,
                    uri: `spotify:playlist:${id}`,
                    collaborative:
                      playlistIndex === 1,
                    owner: {
                      id:
                        playlistIndex === 1
                          ? "someone-else"
                          : playlistIndex === 51
                            ? "followed-owner"
                            : "spotify-a",
                    },
                    items: {
                      total: 2,
                    },
                  };
                },
              );

              return response(200, {
                items,
                offset,
                total,
                next:
                  offset + items.length < total
                    ? `https://api.spotify.com/v1/me/playlists?limit=50&offset=${offset + items.length}`
                    : null,
              });
            }

            const playlistMatch =
              url.match(
                /\/playlists\/([^/]+)\/items/,
              );

            if (playlistMatch) {
              const playlistId =
                decodeURIComponent(
                  playlistMatch[1],
                );

              if (
                playlistId ===
                followedPlaylistId
              ) {
                throw new Error(
                  "Followed playlist items must not be requested.",
                );
              }

              if (
                playlistId ===
                "playlist-2"
              ) {
                return response(403, {
                  error: {
                    status: 403,
                    message: "Spotify did not allow access.",
                  },
                });
              }

              const offset =
                urlOffset(url);

              if (
                playlistId ===
                "playlist-0"
              ) {
                const items = Array.from(
                  {
                    length:
                      offset === 0
                        ? 50
                        : 1,
                  },
                  (_, index) => ({
                    track: track(
                      3000 +
                        offset +
                        index,
                    ),
                  }),
                );

                return response(200, {
                  items,
                  offset,
                  total: 51,
                  next:
                    offset === 0
                      ? "https://api.spotify.com/v1/playlists/playlist-0/items?limit=50&offset=50"
                      : null,
                });
              }

              return response(200, {
                items: [
                  { track: track(0) },
                  {
                    track: track(
                      Number(
                        playlistId.split("-")[1],
                      ) + 2000,
                    ),
                  },
                ],
                offset: 0,
                total: 2,
                next: null,
              });
            }

            throw new Error(
              `Unexpected Spotify URL: ${url}`,
            );
          },
        );

        const imported =
          await syncSpotifyLibrary();

        expect(
          imported.savedTracks,
        ).toHaveLength(1200);
        expect(
          imported.playlists,
        ).toHaveLength(52);
        expect(
          imported.playlistTracks,
        ).toHaveLength(101);
        expect(
          imported.importStatus,
        ).toMatchObject({
          state: "complete",
          savedTracks: {
            state: "complete",
            importedCount: 1200,
          },
          playlists: {
            state: "complete",
            importedCount: 52,
          },
          playlistTracks: {
            state: "complete",
            importedCount: 101,
          },
        });
        expect(
          imported.importStatus
            ?.skippedPlaylists,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              playlistId:
                followedPlaylistId,
              reason: "followed-playlist",
            }),
            expect.objectContaining({
              playlistId: "playlist-2",
              reason: "inaccessible",
            }),
          ]),
        );
        expect(requestedUrls).toEqual(
          expect.arrayContaining([
            expect.stringContaining(
              "/me/tracks?limit=50&offset=1150",
            ),
            expect.stringContaining(
              "/me/playlists?limit=50&offset=50",
            ),
            expect.stringContaining(
              "/playlists/playlist-0/items?limit=50&offset=0",
            ),
            expect.stringContaining(
              "/playlists/playlist-0/items?limit=50&offset=50",
            ),
          ]),
        );
        expect(requestedUrls.join("\n")).not.toContain(
          `/playlists/${followedPlaylistId}/items`,
        );
      },
    );

    it(
      "retains a complete snapshot and resumes from the rate-limited saved-track page",
      async () => {
        let now = Date.now();
        jest
          .spyOn(Date, "now")
          .mockImplementation(() => now);

        await saveSpotifySession(
          session("spotify-a"),
          { syncLibrary: false },
        );
        await saveSpotifyLibrarySnapshot(
          snapshot("spotify-a"),
        );

        let retryWindow = true;
        const savedOffsets: number[] = [];

        jest.spyOn(global, "fetch").mockImplementation(
          async (input) => {
            const url = String(input);

            if (
              url.includes("/me/top/") ||
              url.includes("/recently-played")
            ) {
              return response(200, { items: [] });
            }

            if (url.includes("/me/tracks")) {
              const offset = urlOffset(url);
              savedOffsets.push(offset);

              if (
                offset === 50 &&
                retryWindow
              ) {
                return response(
                  429,
                  {
                    error: {
                      status: 429,
                      message: "Quota exceeded",
                    },
                  },
                  { "retry-after": "2" },
                );
              }

              const items = Array.from(
                { length: 50 },
                (_, index) => ({
                  added_at: "2030-01-01T00:00:00.000Z",
                  track: track(offset + index),
                }),
              );

              return response(200, {
                items,
                offset,
                total: 100,
                next:
                  offset === 0
                    ? "https://api.spotify.com/v1/me/tracks?limit=50&offset=50"
                    : null,
              });
            }

            if (url.includes("/me/playlists")) {
              return response(200, {
                items: [],
                offset: 0,
                total: 0,
                next: null,
              });
            }

            throw new Error(`Unexpected URL: ${url}`);
          },
        );

        await expect(
          syncSpotifyLibrary(),
        ).rejects.toBeInstanceOf(
          SpotifyLibraryImportIncompleteError,
        );

        expect(
          await readSpotifyLibrarySnapshot(),
        ).toMatchObject({
          savedTracks: [
            {
              id: "track-9999",
            },
          ],
        });
        await expect(
          readSpotifyLibraryImportStatus(),
        ).resolves.toMatchObject({
          state: "incomplete",
          savedTracks: {
            state: "partial",
            importedCount: 50,
          },
        });

        retryWindow = false;
        now += 3_000;
        const resumed =
          await syncSpotifyLibrary();

        expect(resumed.savedTracks).toHaveLength(100);
        expect(savedOffsets).toEqual([
          0,
          50,
          50,
        ]);
        await expect(
          readSpotifyLibraryImportStatus(),
        ).resolves.toBeNull();
      },
    );

    it(
      "persists only allowlisted Spotify metadata in snapshots and resumable checkpoints",
      async () => {
        let now = Date.now();
        jest
          .spyOn(Date, "now")
          .mockImplementation(() => now);

        await saveSpotifySession(
          session("spotify-a"),
          { syncLibrary: false },
        );

        const rawPlaylist = {
          id: "playlist-1",
          name: "Private playlist",
          uri: "spotify:playlist:playlist-1",
          description: "not needed for import storage",
          external_urls: {
            spotify:
              "https://open.spotify.com/playlist/playlist-1",
          },
          href:
            "https://api.spotify.com/v1/playlists/playlist-1",
          images: [
            {
              url:
                "https://images.example/playlist-1.jpg",
            },
          ],
          owner: {
            id: "spotify-a",
            display_name: "Owner",
            href:
              "https://api.spotify.com/v1/users/spotify-a",
          },
          items: {
            total: 1,
          },
          arbitraryProviderField: {
            accessToken: "forbidden-playlist-token",
          },
        };
        const rawArtist = {
          id: "artist-1",
          name: "Artist",
          uri: "spotify:artist:artist-1",
          genres: ["electronic"],
          images: [
            {
              url:
                "https://images.example/artist-1.jpg",
            },
          ],
          external_urls: {
            spotify:
              "https://open.spotify.com/artist/artist-1",
          },
          unknownProviderField: "forbidden-artist",
        };
        const progress: unknown[] = [];
        const checkpointProgress: unknown[] = [];
        let writeCheckpoint = false;

        jest.spyOn(global, "fetch").mockImplementation(
          async (input) => {
            const url = String(input);

            if (url.includes("/me/top/artists")) {
              return response(200, {
                items: [rawArtist],
              });
            }

            if (url.includes("/me/top/tracks")) {
              return response(200, {
                items: [adversarialTrack(1)],
              });
            }

            if (url.includes("/recently-played")) {
              return response(200, {
                items: [
                  {
                    track: adversarialTrack(2),
                  },
                ],
              });
            }

            if (url.includes("/me/tracks")) {
              const offset =
                urlOffset(url);

              if (
                writeCheckpoint &&
                offset === 1
              ) {
                return response(
                  429,
                  {
                    error: {
                      status: 429,
                    },
                  },
                  { "retry-after": "60" },
                );
              }

              return response(200, {
                items: [
                  {
                    track:
                      adversarialTrack(
                        writeCheckpoint
                          ? 4
                          : 3,
                      ),
                  },
                ],
                offset,
                total:
                  writeCheckpoint
                    ? 2
                    : 1,
                next:
                  writeCheckpoint &&
                  offset === 0
                    ? "https://api.spotify.com/v1/me/tracks?limit=50&offset=1"
                    : null,
              });
            }

            if (url.includes("/me/playlists")) {
              return response(200, {
                items: [rawPlaylist],
                offset: 0,
                total: 1,
                next: null,
              });
            }

            if (
              url.includes(
                "/playlists/playlist-1/items",
              )
            ) {
              return response(200, {
                items: [
                  {
                    track: adversarialTrack(5),
                  },
                ],
                offset: 0,
                total: 1,
                next: null,
              });
            }

            throw new Error(
              `Unexpected URL: ${url}`,
            );
          },
        );

        const imported =
          await syncSpotifyLibrary({
            onProgress: (value) => {
              progress.push(value);
            },
          });
        const persisted =
          await readSpotifyLibrarySnapshot();

        expectPersistedLibraryDataToBeSafe({
          imported,
          persisted,
          progress,
        });

        now += 61_000;
        writeCheckpoint = true;

        await expect(
          syncSpotifyLibrary({
            onProgress: (value) => {
              checkpointProgress.push(value);
            },
          }),
        ).rejects.toBeInstanceOf(
          SpotifyLibraryImportIncompleteError,
        );

        const persistedLibraryRecords =
          Array.from(
            mockStorage.entries(),
          )
            .filter(([key]) =>
              key.includes("spotify-library"),
            )
            .map(([, value]) =>
              JSON.parse(value) as unknown,
            );

        expect(
          persistedLibraryRecords.length,
        ).toBeGreaterThan(1);
        expectPersistedLibraryDataToBeSafe(
          {
            checkpointProgress,
            persistedLibraryRecords,
          },
        );
      },
    );

    it(
      "keeps a legacy partial snapshot available offline without calling it complete",
      async () => {
        await saveSpotifySession(
          session("spotify-a"),
          { syncLibrary: false },
        );
        await saveSpotifyLibrarySnapshot(
          snapshot("spotify-a"),
        );

        jest
          .spyOn(global, "fetch")
          .mockRejectedValue(
            new Error("offline"),
          );

        const result =
          await getLatestSpotifyLibrarySnapshot(
            24 * 60 * 60 * 1000,
          );

        expect(result).toMatchObject({
          refreshed: false,
          snapshot: {
            profile: {
              id: "spotify-a",
            },
            importStatus: {
              state: "incomplete",
              savedTracks: {
                state: "pending",
              },
            },
          },
        });
        expect(result.warning).toContain(
          "last Spotify sync",
        );
      },
    );

    it(
      "limits accessible playlist-item imports to two concurrent requests",
      async () => {
        await saveSpotifySession(
          session("spotify-a"),
          { syncLibrary: false },
        );

        let activePlaylistReads = 0;
        let peakPlaylistReads = 0;
        let resolveTwoStarted:
          () => void = () => {};
        let resolveThirdStarted:
          () => void = () => {};
        const twoStarted =
          new Promise<void>((resolve) => {
            resolveTwoStarted = resolve;
          });
        const thirdStarted =
          new Promise<void>((resolve) => {
            resolveThirdStarted = resolve;
          });
        const playlistResolvers =
          new Map<
            string,
            (value: Response) => void
          >();

        jest.spyOn(global, "fetch").mockImplementation(
          async (input) => {
            const url = String(input);

            if (
              url.includes("/me/top/") ||
              url.includes("/recently-played") ||
              url.includes("/me/tracks")
            ) {
              return response(200, {
                items: [],
                offset: 0,
                total: 0,
                next: null,
              });
            }

            if (url.includes("/me/playlists")) {
              return response(200, {
                items: [0, 1, 2].map((index) => ({
                  id: `playlist-${index}`,
                  name: `Playlist ${index}`,
                  uri: `spotify:playlist:${index}`,
                  owner: { id: "spotify-a" },
                  items: { total: 1 },
                })),
                offset: 0,
                total: 3,
                next: null,
              });
            }

            const match =
              url.match(
                /\/playlists\/([^/]+)\/items/,
              );

            if (!match) {
              throw new Error(`Unexpected URL: ${url}`);
            }

            const playlistId =
              decodeURIComponent(match[1]);
            activePlaylistReads += 1;
            peakPlaylistReads = Math.max(
              peakPlaylistReads,
              activePlaylistReads,
            );

            if (playlistResolvers.size === 1) {
              resolveTwoStarted();
            }

            if (playlistResolvers.size === 2) {
              resolveThirdStarted();
            }

            return new Promise<Response>((resolve) => {
              playlistResolvers.set(
                playlistId,
                (nextResponse) => {
                  activePlaylistReads -= 1;
                  resolve(nextResponse);
                },
              );
            });
          },
        );

        const importing =
          syncSpotifyLibrary();

        await twoStarted;
        expect(peakPlaylistReads).toBe(2);
        expect(playlistResolvers.size).toBe(2);

        playlistResolvers.get("playlist-0")?.(
          response(200, {
            items: [{ track: track(0) }],
            offset: 0,
            total: 1,
            next: null,
          }),
        );

        await thirdStarted;
        expect(peakPlaylistReads).toBe(2);

        for (const playlistId of [
          "playlist-1",
          "playlist-2",
        ]) {
          playlistResolvers.get(playlistId)?.(
            response(200, {
              items: [{ track: track(Number(playlistId.slice(-1))) }],
              offset: 0,
              total: 1,
              next: null,
            }),
          );
        }

        await expect(importing).resolves.toMatchObject({
          importStatus: {
            state: "complete",
          },
        });
      },
    );

    it(
      "quarantines a held account A page after provider account B becomes current",
      async () => {
        await saveSpotifySession(
          session("spotify-a"),
          { syncLibrary: false },
        );

        let resolveSavedPage:
          ((value: Response) => void) | null =
          null;
        let savedPageStarted:
          () => void = () => {};
        const started =
          new Promise<void>((resolve) => {
            savedPageStarted = resolve;
          });

        jest.spyOn(global, "fetch").mockImplementation(
          async (input) => {
            const url = String(input);

            if (
              url.includes("/me/top/") ||
              url.includes("/recently-played")
            ) {
              return response(200, { items: [] });
            }

            if (url.includes("/me/tracks")) {
              savedPageStarted();

              return new Promise<Response>(
                (resolve) => {
                  resolveSavedPage = resolve;
                },
              );
            }

            throw new Error(`Unexpected URL: ${url}`);
          },
        );

        const staleImport =
          syncSpotifyLibrary();

        await started;

        await saveSpotifySession(
          session("spotify-b"),
          { syncLibrary: false },
        );

        const savedPageResolver =
          resolveSavedPage as
            | ((value: Response) => void)
            | null;

        savedPageResolver?.(
          response(200, {
            items: [
              {
                added_at: "2030-01-01T00:00:00.000Z",
                track: track(1),
              },
            ],
            offset: 0,
            total: 1,
            next: null,
          }),
        );

        await expect(staleImport).rejects.toThrow(
          "current account",
        );
        await expect(
          readSpotifyLibrarySnapshot(),
        ).resolves.toBeNull();
        await expect(
          readSpotifyLibraryImportStatus(),
        ).resolves.toBeNull();
      },
    );

    it(
      "keeps a cancellation checkpoint and resumes from the next saved-track page",
      async () => {
        await saveSpotifySession(
          session("spotify-a"),
          { syncLibrary: false },
        );

        let operationCurrent =
          true;
        const savedOffsets: number[] = [];
        const progressStatuses: unknown[] = [];

        jest.spyOn(global, "fetch").mockImplementation(
          async (input) => {
            const url = String(input);

            if (
              url.includes("/me/top/") ||
              url.includes("/recently-played")
            ) {
              return response(200, { items: [] });
            }

            if (url.includes("/me/tracks")) {
              const offset = urlOffset(url);
              savedOffsets.push(offset);
              const items = Array.from(
                { length: 50 },
                (_, index) => ({
                  added_at: "2030-01-01T00:00:00.000Z",
                  track: track(offset + index),
                }),
              );

              return response(200, {
                items,
                offset,
                total: 100,
                next:
                  offset === 0
                    ? "https://api.spotify.com/v1/me/tracks?limit=50&offset=50"
                    : null,
              });
            }

            if (url.includes("/me/playlists")) {
              return response(200, {
                items: [],
                offset: 0,
                total: 0,
                next: null,
              });
            }

            throw new Error(`Unexpected URL: ${url}`);
          },
        );

        await expect(
          syncSpotifyLibrary({
            operationCommitGuard: () =>
              operationCurrent,
            onProgress: (progress) => {
              progressStatuses.push(
                progress.status,
              );

              if (
                progress.phase === "saved-tracks" &&
                progress.status.savedTracks.importedCount === 50
              ) {
                operationCurrent = false;
              }
            },
          }),
        ).rejects.toThrow("current account");

        await expect(
          readSpotifyLibraryImportStatus(),
        ).resolves.toMatchObject({
          savedTracks: {
            state: "importing",
            importedCount: 50,
          },
        });
        expect(
          new Set(progressStatuses).size,
        ).toBe(progressStatuses.length);

        operationCurrent = true;
        const resumed =
          await syncSpotifyLibrary();

        expect(resumed.savedTracks).toHaveLength(100);
        expect(savedOffsets).toEqual([
          0,
          50,
        ]);
      },
    );

    it(
      "honors a persisted Retry-After checkpoint after a cold module reload",
      async () => {
        let now = Date.now();
        let rateLimited = true;
        const savedOffsets: number[] = [];
        let fetchCount = 0;

        jest
          .spyOn(Date, "now")
          .mockImplementation(() => now);

        await saveSpotifySession(
          session("spotify-a"),
          { syncLibrary: false },
        );

        jest
          .spyOn(global, "fetch")
          .mockImplementation(
              async (input) => {
                fetchCount += 1;
                const url = String(input);

                if (
                  url.includes("/me/top/") ||
                  url.includes("/recently-played")
                ) {
                  return response(200, {
                    items: [],
                  });
                }

                if (url.includes("/me/tracks")) {
                  const offset =
                    urlOffset(url);
                  savedOffsets.push(offset);

                  if (rateLimited) {
                    return response(
                      429,
                      {
                        error: {
                          status: 429,
                        },
                      },
                      { "retry-after": "60" },
                    );
                  }

                  return response(200, {
                    items: [
                      {
                        track: track(1),
                      },
                    ],
                    offset,
                    total: 1,
                    next: null,
                  });
                }

                if (url.includes("/me/playlists")) {
                  return response(200, {
                    items: [],
                    offset: 0,
                    total: 0,
                    next: null,
                  });
                }

                throw new Error(
                  `Unexpected URL: ${url}`,
                );
              },
            );

        await expect(
          syncSpotifyLibrary(),
        ).rejects.toMatchObject({
          status: 429,
          retryAfterSeconds: 60,
        });

        const requestCountBeforeReload =
          fetchCount;

        jest.resetModules();
        jest.doMock(
          "@react-native-async-storage/async-storage",
          () => ({
            __esModule: true,
            default: mockAsyncStorage,
          }),
        );
        jest.doMock(
          "expo-secure-store",
          () => ({
            __esModule: true,
            ...mockSecureStore,
          }),
        );
        jest.doMock(
          "../lib/supabase",
          () => ({
            get isSupabaseConfigured() {
              return true;
            },
            supabase: {
              auth: {
                getSession: jest.fn(
                  async () =>
                    mockCanalSession(),
                ),
              },
            },
          }),
        );

        const {
          syncSpotifyLibrary: coldSyncSpotifyLibrary,
        } = require(
          "../lib/spotify-library",
        ) as typeof import("../lib/spotify-library");

        await expect(
          coldSyncSpotifyLibrary(),
        ).rejects.toMatchObject({
          status: 429,
          retryAfterSeconds: 60,
        });
        expect(
          fetchCount,
        ).toBe(requestCountBeforeReload);

        now += 60_001;
        rateLimited = false;

        await expect(
          coldSyncSpotifyLibrary(),
        ).resolves.toMatchObject({
          savedTracks: [
            {
              id: "track-1",
            },
          ],
          importStatus: {
            state: "complete",
          },
        });
        expect(savedOffsets).toEqual([
          0,
          0,
        ]);
      },
    );
  },
);
