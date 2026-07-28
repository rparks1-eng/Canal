import {
  mockAsyncStorage,
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  mockSecureValues,
} from "./helpers/secure-store-mock";

import {
  supabase,
} from "../lib/supabase";

import * as spotifyAuth from "../lib/spotify-auth";

import {
  clearSpotifySession,
  getSpotifyConnectionGeneration,
  readSpotifySession,
  saveSpotifySession,
} from "../lib/spotify-auth";

import type {
  SpotifySession,
} from "../lib/spotify-auth";

import {
  CANAL_REQUIRED_SPOTIFY_SCOPES,
} from "../lib/spotify-config";

import {
  exportSpotifyTastePlaylist,
  getLatestSpotifyLibrarySnapshot,
  readSpotifyLibrarySnapshot,
  saveSpotifyLibrarySnapshot,
  SPOTIFY_LIBRARY_STORAGE_KEY,
} from "../lib/spotify-library";

import {
  exportSceneToSpotify,
} from "../lib/spotify-scene-tools";

import type {
  StoredScene,
} from "../lib/scenes";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

let mockSupabaseConfigured =
  true;

let mockCanalOwnerId:
  string | null =
    "canal-user-a";

jest.mock(
  "../lib/supabase",
  () => ({
    get isSupabaseConfigured() {
      return mockSupabaseConfigured;
    },
    supabase: {
      auth: {
        getSession:
          jest.fn(),
      },
    },
  }),
);

const mockGetSession =
  jest.mocked(
    supabase.auth.getSession,
  );

function canalAuthResult() {
  return {
    data: {
      session:
        mockCanalOwnerId
          ? {
              user: {
                id:
                  mockCanalOwnerId,
              },
            }
          : null,
    },
    error: null,
  } as never;
}

function createSession(
  profileId: string,
): SpotifySession {
  return {
    accessToken:
      `access-${profileId}`,
    refreshToken:
      `refresh-${profileId}`,
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
      display_name:
        profileId,
    },
  };
}

function createSnapshot(
  profileId: string,
): SpotifyLibrarySnapshot {
  return {
    syncedAt:
      new Date().toISOString(),
    profile: {
      id: profileId,
      display_name:
        profileId,
    },
    topArtists: [],
    topTracks: [],
    recentTracks: [],
    savedTracks: [],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [],
    trackGenres: {},
    warnings: [],
  };
}

function mockResponse(
  status: number,
  payload: unknown,
): Response {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    json: async () =>
      payload,
    text: async () =>
      JSON.stringify(
        payload,
      ),
    headers: {
      get: () =>
        null,
    },
  } as unknown as Response;
}

function createScene(): StoredScene {
  const timestamp =
    new Date().toISOString();

  return {
    id:
      "scene-account-pin",
    name:
      "Pinned Scene",
    activity:
      "focus",
    duration:
      "30 minutes",
    emotions:
      "calm",
    genres:
      "ambient",
    energy:
      "low",
    familiarity:
      "balanced",
    artists:
      "",
    songRequest:
      "",
    avoid:
      "",
    collaborators: [],
    tracks: [
      {
        id:
          "scene-track",
        title:
          "Pinned Track",
        artist:
          "Canal Artist",
      },
    ],
    visibility:
      "private",
    createdAt:
      timestamp,
    updatedAt:
      timestamp,
    libraryType:
      "created",
  };
}

describe(
  "Spotify library ownership",
  () => {
    beforeEach(async () => {
      mockSupabaseConfigured =
        true;

      mockCanalOwnerId =
        "canal-user-a";

      mockGetSession.mockImplementation(
        async () =>
          canalAuthResult(),
      );

      await clearSpotifySession();

      mockStorage.clear();
      mockSecureValues.clear();
    });

    it(
      "removes a cached library when the connected account changes",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        await saveSpotifyLibrarySnapshot(
          createSnapshot(
            "account-a",
          ),
        );

        await saveSpotifySession(
          createSession(
            "account-b",
          ),
          {
            syncLibrary: false,
          },
        );

        await expect(
          readSpotifyLibrarySnapshot(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            SPOTIFY_LIBRARY_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "does not expose a cached library after the Canal account changes",
      async () => {
        await saveSpotifySession(
          createSession(
            "spotify-account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        await saveSpotifyLibrarySnapshot(
          createSnapshot(
            "spotify-account-a",
          ),
        );

        mockCanalOwnerId =
          "canal-user-b";

        await expect(
          readSpotifyLibrarySnapshot(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            SPOTIFY_LIBRARY_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects an ownerless library snapshot in a configured build",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        mockStorage.set(
          SPOTIFY_LIBRARY_STORAGE_KEY,
          JSON.stringify(
            createSnapshot(
              "account-a",
            ),
          ),
        );

        await expect(
          readSpotifyLibrarySnapshot(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            SPOTIFY_LIBRARY_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "retains ownerless prototype storage when Supabase is unconfigured",
      async () => {
        mockSupabaseConfigured =
          false;

        await saveSpotifySession(
          createSession(
            "prototype-account",
          ),
          {
            syncLibrary: false,
          },
        );

        await saveSpotifyLibrarySnapshot(
          createSnapshot(
            "prototype-account",
          ),
        );

        await expect(
          readSpotifyLibrarySnapshot(),
        ).resolves.toMatchObject({
          profile: {
            id:
              "prototype-account",
          },
        });

        expect(
          JSON.parse(
            mockStorage.get(
              SPOTIFY_LIBRARY_STORAGE_KEY,
            ) ??
              "{}",
          ),
        ).toMatchObject({
          profile: {
            id:
              "prototype-account",
          },
        });
      },
    );

    it(
      "does not export a snapshot owned by another account",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-b",
          ),
          {
            syncLibrary: false,
          },
        );

        await expect(
          exportSpotifyTastePlaylist(
            createSnapshot(
              "account-a",
            ),
          ),
        ).rejects.toThrow(
          "different account",
        );
      },
    );

    it(
      "removes a snapshot that finishes saving after disconnect",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        const expectedGeneration =
          getSpotifyConnectionGeneration();

        let signalSaveStarted:
          () => void =
            () => {};

        const saveStarted =
          new Promise<void>(
            (resolve) => {
              signalSaveStarted =
                resolve;
            },
          );

        let releaseSave:
          () => void =
            () => {};

        const saveGate =
          new Promise<void>(
            (resolve) => {
              releaseSave =
                resolve;
            },
          );

        mockAsyncStorage.setItem
          .mockImplementationOnce(
            async (
              key: string,
              value: string,
            ) => {
              signalSaveStarted();

              await saveGate;

              mockStorage.set(
                key,
                value,
              );
            },
          );

        const saving =
          saveSpotifyLibrarySnapshot(
            createSnapshot(
              "account-a",
            ),
            {
              expectedConnectionGeneration:
                expectedGeneration,
            },
          );

        await saveStarted;
        await clearSpotifySession();

        releaseSave();

        await expect(
          saving,
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          mockStorage.has(
            SPOTIFY_LIBRARY_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "removes a stale library write that finishes after the Canal account switches",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        const expectedGeneration =
          getSpotifyConnectionGeneration();

        let signalSaveStarted:
          () => void =
            () => {};

        const saveStarted =
          new Promise<void>(
            (resolve) => {
              signalSaveStarted =
                resolve;
            },
          );

        let releaseSave:
          () => void =
            () => {};

        const saveGate =
          new Promise<void>(
            (resolve) => {
              releaseSave =
                resolve;
            },
          );

        mockAsyncStorage.setItem
          .mockImplementationOnce(
            async (
              key: string,
              value: string,
            ) => {
              mockStorage.set(
                key,
                value,
              );

              signalSaveStarted();

              await saveGate;
            },
          );

        const saving =
          saveSpotifyLibrarySnapshot(
            createSnapshot(
              "account-a",
            ),
            {
              expectedConnectionGeneration:
                expectedGeneration,
            },
          );

        await saveStarted;

        mockCanalOwnerId =
          "canal-user-b";

        releaseSave();

        await expect(
          saving,
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          mockStorage.has(
            SPOTIFY_LIBRARY_STORAGE_KEY,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "preserves account B cache when account A finishes an obsolete save",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        const accountAGeneration =
          getSpotifyConnectionGeneration();

        let signalAccountAStored:
          () => void =
            () => {};

        const accountAStored =
          new Promise<void>(
            (resolve) => {
              signalAccountAStored =
                resolve;
            },
          );

        let releaseAccountAWrite:
          () => void =
            () => {};

        const accountAWriteGate =
          new Promise<void>(
            (resolve) => {
              releaseAccountAWrite =
                resolve;
            },
          );

        let accountBWriteStarted =
          false;

        mockAsyncStorage.setItem
          .mockImplementationOnce(
            async (
              key: string,
              value: string,
            ) => {
              mockStorage.set(
                key,
                value,
              );

              signalAccountAStored();

              await accountAWriteGate;
            },
          )
          .mockImplementationOnce(
            async (
              key: string,
              value: string,
            ) => {
              accountBWriteStarted =
                true;

              mockStorage.set(
                key,
                value,
              );
            },
          );

        const accountASave =
          saveSpotifyLibrarySnapshot(
            createSnapshot(
              "account-a",
            ),
            {
              expectedConnectionGeneration:
                accountAGeneration,
            },
          );

        await accountAStored;

        await saveSpotifySession(
          createSession(
            "account-b",
          ),
          {
            syncLibrary: false,
          },
        );

        const accountBSave =
          saveSpotifyLibrarySnapshot(
            createSnapshot(
              "account-b",
            ),
            {
              expectedConnectionGeneration:
                getSpotifyConnectionGeneration(),
            },
          );

        await readSpotifySession();
        await Promise.resolve();

        expect(
          accountBWriteStarted,
        ).toBe(
          false,
        );

        releaseAccountAWrite();

        await expect(
          accountASave,
        ).rejects.toThrow(
          "connection changed",
        );

        await expect(
          accountBSave,
        ).resolves.toBeUndefined();

        expect(
          accountBWriteStarted,
        ).toBe(
          true,
        );

        expect(
          JSON.parse(
            mockStorage.get(
              SPOTIFY_LIBRARY_STORAGE_KEY,
            ) ??
              "{}",
          ),
        ).toMatchObject({
          snapshot: {
            profile: {
              id:
                "account-b",
            },
          },
        });
      },
    );

    it(
      "does not return account A cache when account B connects before validation",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        await saveSpotifyLibrarySnapshot(
          createSnapshot(
            "account-a",
          ),
        );

        const requireGuardedSession =
          spotifyAuth
            .requireGuardedSpotifyLibrarySession;

        const validationSpy =
          jest
            .spyOn(
              spotifyAuth,
              "requireGuardedSpotifyLibrarySession",
            )
            .mockImplementationOnce(
              async () => {
                await saveSpotifySession(
                  createSession(
                    "account-b",
                  ),
                  {
                    syncLibrary:
                      false,
                  },
                );

                return requireGuardedSession();
              },
            );

        jest
          .spyOn(
            global,
            "fetch",
          )
          .mockRejectedValue(
            new Error(
              "offline",
            ),
          );

        const result =
          await getLatestSpotifyLibrarySnapshot(
            24 *
              60 *
              60 *
              1000,
          );

        expect(
          validationSpy,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          result.snapshot,
        ).toBeNull();

        expect(
          mockStorage.get(
            SPOTIFY_LIBRARY_STORAGE_KEY,
          ),
        ).toContain(
          "account-a",
        );
      },
    );

    it(
      "pins a taste export through playlist creation and track insertion",
      async () => {
        const accountA =
          createSession(
            "account-a",
          );

        await saveSpotifySession(
          accountA,
          {
            syncLibrary: false,
          },
        );

        const snapshot = {
          ...createSnapshot(
            "account-a",
          ),
          topTracks: [
            {
              id:
                "taste-track",
              name:
                "Taste Track",
              uri:
                "spotify:track:taste-track",
              artists: [],
            },
          ],
        };

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockImplementationOnce(
              async (
                _input,
                init,
              ) => {
                expect(
                  (
                    init
                      ?.headers as
                      Record<
                        string,
                        string
                      >
                  ).Authorization,
                ).toBe(
                  "Bearer access-account-a",
                );

                await saveSpotifySession(
                  createSession(
                    "account-b",
                  ),
                  {
                    syncLibrary:
                      false,
                  },
                );

                return mockResponse(
                  201,
                  {
                    id:
                      "playlist-account-a",
                    name:
                      "Account A playlist",
                    uri:
                      "spotify:playlist:account-a",
                  },
                );
              },
            );

        await expect(
          exportSpotifyTastePlaylist(
            snapshot,
          ),
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "pins a Scene export across search, playlist creation, and track insertion",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockImplementationOnce(
              async (
                _input,
                init,
              ) => {
                expect(
                  (
                    init
                      ?.headers as
                      Record<
                        string,
                        string
                      >
                  ).Authorization,
                ).toBe(
                  "Bearer access-account-a",
                );

                return mockResponse(
                  200,
                  {
                    tracks: {
                      items: [
                        {
                          id:
                            "matched-track",
                          name:
                            "Pinned Track",
                          uri:
                            "spotify:track:matched-track",
                          duration_ms:
                            180_000,
                          explicit:
                            false,
                          artists: [
                            {
                              name:
                                "Canal Artist",
                            },
                          ],
                        },
                      ],
                    },
                  },
                );
              },
            )
            .mockImplementationOnce(
              async (
                _input,
                init,
              ) => {
                expect(
                  (
                    init
                      ?.headers as
                      Record<
                        string,
                        string
                      >
                  ).Authorization,
                ).toBe(
                  "Bearer access-account-a",
                );

                await saveSpotifySession(
                  createSession(
                    "account-b",
                  ),
                  {
                    syncLibrary:
                      false,
                  },
                );

                return mockResponse(
                  201,
                  {
                    id:
                      "scene-playlist-account-a",
                    uri:
                      "spotify:playlist:scene-account-a",
                  },
                );
              },
            );

        await expect(
          exportSceneToSpotify(
            createScene(),
          ),
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );
  },
);
