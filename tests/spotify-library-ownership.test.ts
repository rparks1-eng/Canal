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
  createSpotifyPlaylist,
  getSpotifyTopArtists,
  searchSpotifyCatalogTracks,
} from "../lib/spotify-api";

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
  syncSpotifyLibrary,
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
  headers:
    Record<
      string,
      string
    > = {},
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
      get: (
        name: string,
      ) =>
        headers[
          name.toLowerCase()
        ] ??
        headers[name] ??
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
        spotifyUri:
          "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
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
      "preserves an exact successor library value when a revoked OAuth operation finishes its deferred write",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary:
              false,
          },
        );

        const connectionGeneration =
          getSpotifyConnectionGeneration();

        await saveSpotifyLibrarySnapshot(
          createSnapshot(
            "account-a",
          ),
          {
            expectedConnectionGeneration:
              connectionGeneration,
          },
        );

        let commitCurrent =
          true;

        let signalWrite:
          () => void =
            () => {};

        const writeStarted =
          new Promise<void>(
            (resolve) => {
              signalWrite =
                resolve;
            },
          );

        let releaseWrite:
          () => void =
            () => {};

        const writeMayFinish =
          new Promise<void>(
            (resolve) => {
              releaseWrite =
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
              signalWrite();
              await writeMayFinish;
            },
          );

        const staleWrite =
          saveSpotifyLibrarySnapshot(
            {
              ...createSnapshot(
                "account-a",
              ),
              syncedAt:
                "2026-07-30T12:00:00.000Z",
            },
            {
              expectedConnectionGeneration:
                connectionGeneration,
              operationCommitGuard:
                () =>
                  commitCurrent,
            },
          );

        await writeStarted;

        const successorValue =
          "exact-a2-library-value";

        mockStorage.set(
          SPOTIFY_LIBRARY_STORAGE_KEY,
          successorValue,
        );
        commitCurrent =
          false;
        releaseWrite();

        await expect(
          staleWrite,
        ).rejects.toThrow(
          "connection changed",
        );

        expect(
          mockStorage.get(
            SPOTIFY_LIBRARY_STORAGE_KEY,
          ),
        ).toBe(
          successorValue,
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

        let libraryWriteCount =
          0;

        mockAsyncStorage.setItem
          .mockImplementation(
            async (
              key: string,
              value: string,
            ) => {
              mockStorage.set(
                key,
                value,
              );

              if (
                key !==
                  SPOTIFY_LIBRARY_STORAGE_KEY
              ) {
                return;
              }

              libraryWriteCount +=
                1;

              if (
                libraryWriteCount ===
                  1
              ) {
                signalAccountAStored();

                await accountAWriteGate;

                return;
              }

              accountBWriteStarted =
                true;
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
      "coalesces and caches same-generation Spotify GETs",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        let releaseFetch:
          (
            response: Response,
          ) => void =
            () => {};

        const fetchGate =
          new Promise<Response>(
            (resolve) => {
              releaseFetch =
                resolve;
            },
          );

        let signalFetchStarted:
          () => void =
            () => {};

        const fetchStarted =
          new Promise<void>(
            (resolve) => {
              signalFetchStarted =
                resolve;
            },
          );

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockImplementation(
              () => {
                signalFetchStarted();

                return fetchGate;
              },
            );

        const first =
          searchSpotifyCatalogTracks(
            "same-generation-cache",
          );

        const second =
          searchSpotifyCatalogTracks(
            "same-generation-cache",
          );

        await fetchStarted;

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        releaseFetch(
          mockResponse(
            200,
            {
              tracks: {
                items: [
                  {
                    id:
                      "cached-track",
                    name:
                      "Cached Track",
                    uri:
                      "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
                    artists: [],
                  },
                ],
              },
            },
          ),
        );

        await expect(
          Promise.all([
            first,
            second,
          ]),
        ).resolves.toEqual([
          [
            expect.objectContaining({
              id:
                "cached-track",
            }),
          ],
          [
            expect.objectContaining({
              id:
                "cached-track",
            }),
          ],
        ]);

        await expect(
          searchSpotifyCatalogTracks(
            "same-generation-cache",
          ),
        ).resolves.toHaveLength(
          1,
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "does not let a revoked sync share or replace a later operation cache under the same Canal session",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary:
              false,
          },
        );

        const responseResolvers:
          (
            (
              response:
                Response,
            ) => void
          )[] = [];

        let signalInitialReads:
          () => void =
            () => {};

        const initialReadsStarted =
          new Promise<void>(
            (resolve) => {
              signalInitialReads =
                resolve;
            },
          );

        let signalSuccessorRead:
          () => void =
            () => {};

        const successorReadStarted =
          new Promise<void>(
            (resolve) => {
              signalSuccessorRead =
                resolve;
            },
          );

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockImplementation(
              () =>
                new Promise<Response>(
                  (resolve) => {
                    responseResolvers.push(
                      resolve,
                    );

                    if (
                      responseResolvers.length ===
                        1
                    ) {
                      signalInitialReads();
                    }

                    if (
                      responseResolvers.length ===
                        2
                    ) {
                      signalSuccessorRead();
                    }
                  },
                ),
            );

        let initialOperationCurrent =
          true;

        await saveSpotifySession(
          {
            ...createSession(
              "account-a",
            ),
            accessToken:
              "revoked-b-token",
          },
          {
            syncLibrary:
              false,
          },
        );

        const provisionalSync =
          syncSpotifyLibrary({
            operationCommitGuard:
              () =>
                initialOperationCurrent,
          });

        await initialReadsStarted;

        initialOperationCurrent =
          false;

        await saveSpotifySession(
          {
            ...createSession(
              "account-a",
            ),
            accessToken:
              "successor-c-token",
          },
          {
            syncLibrary:
              false,
          },
        );

        const successorRead =
          getSpotifyTopArtists(
            20,
            {
              operationCommitGuard:
                () =>
                  true,
            },
          );

        await successorReadStarted;

        responseResolvers[1](
          mockResponse(
            200,
            {
              items: [
                {
                  id:
                    "successor-c-artist",
                  name:
                    "Successor C",
                  uri:
                    "spotify:artist:successor-c",
                },
              ],
            },
          ),
        );

        await expect(
          successorRead,
        ).resolves.toEqual(
          expect.objectContaining({
            items: [
              expect.objectContaining({
                id:
                  "successor-c-artist",
              }),
            ],
          }),
        );

        for (
          const resolve of
          responseResolvers.slice(
            0,
            1,
          )
        ) {
          resolve(
            mockResponse(
              200,
              {
                items: [],
              },
            ),
          );
        }

        await expect(
          provisionalSync,
        ).rejects.toThrow(
          "connection changed",
        );

        await expect(
          getSpotifyTopArtists(
            20,
            {
              operationCommitGuard:
                () =>
                  true,
            },
          ),
        ).resolves.toEqual(
          expect.objectContaining({
            items: [
              expect.objectContaining({
                id:
                  "successor-c-artist",
              }),
            ],
          }),
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          2,
        );
        expect(
          (
            await readSpotifySession()
          )?.accessToken,
        ).toBe(
          "successor-c-token",
        );
      },
    );

    it(
      "does not reuse a Spotify GET cache after an account switch",
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
            .mockResolvedValueOnce(
              mockResponse(
                200,
                {
                  tracks: {
                    items: [
                      {
                        id:
                          "account-a-track",
                        name:
                          "Account A",
                        uri:
                          "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
                        artists: [],
                      },
                    ],
                  },
                },
              ),
            )
            .mockResolvedValueOnce(
              mockResponse(
                200,
                {
                  tracks: {
                    items: [
                      {
                        id:
                          "account-b-track",
                        name:
                          "Account B",
                        uri:
                          "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
                        artists: [],
                      },
                    ],
                  },
                },
              ),
            );

        await expect(
          searchSpotifyCatalogTracks(
            "account-scoped-cache",
          ),
        ).resolves.toEqual([
          expect.objectContaining({
            id:
              "account-a-track",
          }),
        ]);

        await saveSpotifySession(
          createSession(
            "account-b",
          ),
          {
            syncLibrary: false,
          },
        );

        await expect(
          searchSpotifyCatalogTracks(
            "account-scoped-cache",
          ),
        ).resolves.toEqual([
          expect.objectContaining({
            id:
              "account-b-track",
          }),
        ]);

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );

    it(
      "does not reuse an in-flight Spotify GET after an account switch",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        const responseResolvers:
          (
            (
              response:
                Response,
            ) => void
          )[] = [];

        let signalFirstStarted:
          () => void =
            () => {};

        const firstStarted =
          new Promise<void>(
            (resolve) => {
              signalFirstStarted =
                resolve;
            },
          );

        let signalSecondStarted:
          () => void =
            () => {};

        const secondStarted =
          new Promise<void>(
            (resolve) => {
              signalSecondStarted =
                resolve;
            },
          );

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockImplementation(
              () =>
                new Promise<Response>(
                  (resolve) => {
                    responseResolvers.push(
                      resolve,
                    );

                    if (
                      responseResolvers.length ===
                      1
                    ) {
                      signalFirstStarted();
                    } else {
                      signalSecondStarted();
                    }
                  },
                ),
            );

        const accountARequest =
          searchSpotifyCatalogTracks(
            "in-flight-account-isolation",
          );

        await firstStarted;

        await saveSpotifySession(
          createSession(
            "account-b",
          ),
          {
            syncLibrary: false,
          },
        );

        const accountBRequest =
          searchSpotifyCatalogTracks(
            "in-flight-account-isolation",
          );

        await secondStarted;

        responseResolvers[1](
          mockResponse(
            200,
            {
              tracks: {
                items: [
                  {
                    id:
                      "account-b-in-flight",
                    name:
                      "Account B",
                    uri:
                      "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
                    artists: [],
                  },
                ],
              },
            },
          ),
        );

        await expect(
          accountBRequest,
        ).resolves.toEqual([
          expect.objectContaining({
            id:
              "account-b-in-flight",
          }),
        ]);

        responseResolvers[0](
          mockResponse(
            200,
            {
              tracks: {
                items: [
                  {
                    id:
                      "account-a-in-flight",
                    name:
                      "Account A",
                    uri:
                      "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
                    artists: [],
                  },
                ],
              },
            },
          ),
        );

        await expect(
          accountARequest,
        ).rejects.toThrow(
          "connection changed",
        );

        await expect(
          searchSpotifyCatalogTracks(
            "in-flight-account-isolation",
          ),
        ).resolves.toEqual([
          expect.objectContaining({
            id:
              "account-b-in-flight",
          }),
        ]);

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );

    it(
      "never caches or coalesces Spotify writes",
      async () => {
        await saveSpotifySession(
          createSession(
            "account-a",
          ),
          {
            syncLibrary: false,
          },
        );

        let playlistNumber =
          0;

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockImplementation(
              async () => {
                playlistNumber +=
                  1;

                return mockResponse(
                  201,
                  {
                    id:
                      `playlist-${playlistNumber}`,
                    name:
                      "Quota-safe playlist",
                    uri:
                      `spotify:playlist:${playlistNumber}`,
                  },
                );
              },
            );

        const [
          first,
          second,
        ] =
          await Promise.all([
            createSpotifyPlaylist({
              name:
                "Quota-safe playlist",
            }),
            createSpotifyPlaylist({
              name:
                "Quota-safe playlist",
            }),
          ]);

        expect(
          first.id,
        ).toBe(
          "playlist-1",
        );

        expect(
          second.id,
        ).toBe(
          "playlist-2",
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );

    it(
      "starts complete collection sources with guarded first pages",
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
            .mockImplementation(
              async (
                input,
              ) => {
                const url =
                  String(input);

                if (
                  url.includes(
                    "/recently-played",
                  )
                ) {
                  return mockResponse(
                    200,
                    {
                      items: [],
                    },
                  );
                }

                return mockResponse(
                  200,
                  {
                    items: [],
                  },
                );
              },
            );

        await expect(
          syncSpotifyLibrary(),
        ).resolves.toMatchObject({
          profile: {
            id:
              "account-a",
          },
          playlistTracks: [],
          discoveryTracks: [],
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          5,
        );

        const requestedUrls =
          fetchMock.mock.calls.map(
            ([input]) =>
              String(input),
          );

        expect(
          requestedUrls,
        ).toEqual(
          expect.arrayContaining([
            expect.stringContaining(
              "/me/top/artists",
            ),
            expect.stringContaining(
              "/me/top/tracks",
            ),
            expect.stringContaining(
              "/me/player/recently-played",
            ),
            expect.stringContaining(
              "/me/tracks?limit=50&offset=0",
            ),
            expect.stringContaining(
              "/me/playlists?limit=50&offset=0",
            ),
          ]),
        );

        expect(
          requestedUrls.join(
            "\n",
          ),
        ).not.toMatch(
          /\/search|\/v1\/artists\?ids=|\/playlists\/[^?]+\/items/,
        );
      },
    );

    it(
      "honors Retry-After until the connection generation changes",
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

        const fetchMock =
          jest
            .spyOn(
              global,
              "fetch",
            )
            .mockResolvedValue(
              mockResponse(
                429,
                {
                  error: {
                    status:
                      429,
                    message:
                      "Quota exceeded",
                    reason:
                      "QUOTA_EXCEEDED",
                  },
                },
                {
                  "retry-after":
                    "82800",
                },
              ),
            );

        await expect(
          syncSpotifyLibrary(),
        ).rejects.toMatchObject({
          status:
            429,
          reason:
            "QUOTA_EXCEEDED",
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const result =
          await getLatestSpotifyLibrarySnapshot(
            0,
          );

        expect(
          result,
        ).toMatchObject({
          refreshed:
            false,
          snapshot: {
            profile: {
              id:
                "account-a",
            },
          },
          issue: {
            kind:
              "rate-limited",
            title:
              "Spotify quota reached",
          },
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        await saveSpotifySession(
          createSession(
            "account-b",
          ),
          {
            syncLibrary: false,
          },
        );

        fetchMock.mockResolvedValue(
          mockResponse(
            200,
            {
              items: [],
            },
          ),
        );

        await expect(
          syncSpotifyLibrary(),
        ).resolves.toMatchObject({
          profile: {
            id:
              "account-b",
          },
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          6,
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
      "exports a linked Scene with exactly two Spotify writes and no catalog search",
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
            .mockResolvedValueOnce(
              mockResponse(
                201,
                {
                  id:
                    "scene-playlist",
                  uri:
                    "spotify:playlist:scene-playlist",
                  external_urls: {
                    spotify:
                      "https://open.spotify.com/playlist/scene-playlist",
                  },
                },
              ),
            )
            .mockResolvedValueOnce(
              mockResponse(
                201,
                {
                  snapshot_id:
                    "snapshot-1",
                },
              ),
            );

        await expect(
          exportSceneToSpotify(
            createScene(),
          ),
        ).resolves.toMatchObject({
          playlistId:
            "scene-playlist",
          trackCount:
            1,
          skippedCount:
            0,
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          2,
        );

        const requestedUrls =
          fetchMock.mock.calls.map(
            ([input]) =>
              String(input),
          );

        expect(
          requestedUrls.join(
            "\n",
          ),
        ).not.toContain(
          "/search",
        );

        expect(
          requestedUrls,
        ).toEqual([
          expect.stringContaining(
            "/me/playlists",
          ),
          expect.stringContaining(
            "/playlists/scene-playlist/items",
          ),
        ]);

        expect(
          JSON.parse(
            String(
              fetchMock.mock
                .calls[1][1]
                ?.body,
            ),
          ),
        ).toEqual({
          uris: [
            "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
          ],
        });
      },
    );

    it(
      "rejects a legacy Scene without Spotify links before any API request",
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
          jest.spyOn(
            global,
            "fetch",
          );

        const legacyScene = {
          ...createScene(),
          tracks: [
            {
              id:
                "legacy-track",
              title:
                "Legacy Track",
              artist:
                "Canal Artist",
            },
          ],
        };

        await expect(
          exportSceneToSpotify(
            legacyScene,
          ),
        ).rejects.toThrow(
          "legacy Scene has no Spotify track links",
        );

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "pins a URI-only Scene export across playlist creation and track insertion",
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
          1,
        );
      },
    );
  },
);
