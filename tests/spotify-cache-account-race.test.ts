import {
  mockAsyncStorage,
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  clearSpotifyApiCache,
  getSpotifyCachedJson,
} from "../lib/spotify-cache";

import {
  getSpotifyCacheNamespace,
} from "../lib/storage-keys";

import type {
  SpotifyCacheScope,
} from "../lib/spotify-auth";

let currentScope:
  SpotifyCacheScope;

const mockCaptureScope =
  jest.fn();

const mockAssertScope =
  jest.fn();

const mockSpotifyFetch =
  jest.fn();

jest.mock(
  "../lib/spotify-auth",
  () => ({
    captureSpotifyCacheScope:
      () =>
        mockCaptureScope(),
    assertSpotifyCacheScopeCurrent:
      (
        scope:
          SpotifyCacheScope,
      ) =>
        mockAssertScope(
          scope,
        ),
    spotifyAuthenticatedFetch:
      (
        input: string,
        init:
          RequestInit,
      ) =>
        mockSpotifyFetch(
          input,
          init,
        ),
  }),
);

const scopeA:
  SpotifyCacheScope = {
  ownerId: "canal-a",
  sessionGeneration:
    "session-a-1",
  spotifyAccountGeneration: 7,
  spotifyProfileId:
    "spotify-a",
};

const scopeB:
  SpotifyCacheScope = {
  ownerId: "canal-b",
  sessionGeneration:
    "session-b-1",
  spotifyAccountGeneration: 8,
  spotifyProfileId:
    "spotify-b",
};

const scopeA2:
  SpotifyCacheScope = {
  ownerId: "canal-a",
  sessionGeneration:
    "session-a-2",
  spotifyAccountGeneration: 9,
  spotifyProfileId:
    "spotify-a2",
};

const scopeAReplacement:
  SpotifyCacheScope = {
  ...scopeA,
  spotifyProfileId:
    "spotify-replacement",
};

function spotifyResponse(
  payload:
    unknown,
  status = 200,
): Response {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    json:
      async () =>
        payload,
    headers: {
      get:
        () =>
          null,
    },
  } as unknown as Response;
}

describe(
  "Spotify personalized cache account isolation",
  () => {
    beforeEach(() => {
      mockStorage.clear();

      currentScope =
        scopeA;

      mockCaptureScope
        .mockReset()
        .mockImplementation(
          async () =>
            currentScope,
        );

      mockAssertScope
        .mockReset()
        .mockImplementation(
          async (
            expected:
              SpotifyCacheScope,
          ) => {
            if (
              expected.ownerId !==
                currentScope.ownerId ||
              expected.sessionGeneration !==
                currentScope
                  .sessionGeneration ||
              expected.spotifyAccountGeneration !==
                currentScope
                  .spotifyAccountGeneration ||
              expected.spotifyProfileId !==
                currentScope
                  .spotifyProfileId
            ) {
              throw new Error(
                "account changed",
              );
            }
          },
        );

      mockSpotifyFetch.mockReset();

      mockAsyncStorage.getItem
        .mockImplementation(
          async (key) =>
            mockStorage.get(
              key,
            ) ??
            null,
        );

      mockAsyncStorage.setItem
        .mockImplementation(
          async (
            key,
            value,
          ) => {
            mockStorage.set(
              key,
              value,
            );
          },
        );

      mockAsyncStorage.getAllKeys
        .mockImplementation(
          async () =>
            Array.from(
              mockStorage.keys(),
            ),
        );

      mockAsyncStorage.removeItem
        .mockImplementation(
          async (key) => {
            mockStorage.delete(
              key,
            );
          },
        );

      mockAsyncStorage.multiRemove
        .mockImplementation(
          async (keys) => {
            for (
              const key of
              keys
            ) {
              mockStorage.delete(
                key,
              );
            }
          },
        );
    });

    it(
      "rejects a late A response before cache commit after switching to B",
      async () => {
        let resolveFetch:
          (
            response:
              Response,
          ) => void =
          () => {};

        mockSpotifyFetch
          .mockImplementationOnce(
            () =>
              new Promise<Response>(
                (resolve) => {
                  resolveFetch =
                    resolve;
                },
              ),
          );

        const pendingA =
          getSpotifyCachedJson<{
            owner: string;
          }>(
            "/me/top/artists",
          );

        await Promise.resolve();

        currentScope =
          scopeB;

        resolveFetch(
          spotifyResponse({
            owner: "A",
          }),
        );

        await expect(
          pendingA,
        ).rejects.toThrow(
          "account changed",
        );

        expect(
          Array.from(
            mockStorage.keys(),
          ),
        ).toEqual([]);
      },
    );

    it(
      "never reuses A data for B or A2 and stale A cleanup cannot delete either namespace",
      async () => {
        mockSpotifyFetch
          .mockResolvedValueOnce(
            spotifyResponse({
              owner: "A",
            }),
          )
          .mockResolvedValueOnce(
            spotifyResponse({
              owner: "B",
            }),
          )
          .mockResolvedValueOnce(
            spotifyResponse({
              owner: "A2",
            }),
          );

        await expect(
          getSpotifyCachedJson<{
            owner: string;
          }>(
            "/me/top/artists",
          ),
        ).resolves.toEqual({
          owner: "A",
        });

        currentScope =
          scopeB;

        await expect(
          getSpotifyCachedJson<{
            owner: string;
          }>(
            "/me/top/artists",
          ),
        ).resolves.toEqual({
          owner: "B",
        });

        currentScope =
          scopeA2;

        await expect(
          getSpotifyCachedJson<{
            owner: string;
          }>(
            "/me/top/artists",
          ),
        ).resolves.toEqual({
          owner: "A2",
        });

        expect(
          mockSpotifyFetch,
        ).toHaveBeenCalledTimes(
          3,
        );

        await expect(
          clearSpotifyApiCache(
            scopeA,
          ),
        ).rejects.toThrow(
          "account changed",
        );

        const keys =
          Array.from(
            mockStorage.keys(),
          );

        expect(
          keys.some((key) =>
            key.startsWith(
              getSpotifyCacheNamespace(
                scopeB,
              ),
            ),
          ),
        ).toBe(true);

        expect(
          keys.some((key) =>
            key.startsWith(
              getSpotifyCacheNamespace(
                scopeA2,
              ),
            ),
          ),
        ).toBe(true);
      },
    );

    it(
      "does not reuse a prior Spotify profile cache after provider replacement in the same Canal session",
      async () => {
        mockSpotifyFetch
          .mockResolvedValueOnce(
            spotifyResponse({
              provider:
                "spotify-a",
            }),
          )
          .mockResolvedValueOnce(
            spotifyResponse({
              provider:
                "spotify-replacement",
            }),
          );

        await expect(
          getSpotifyCachedJson(
            "/me/top/artists",
          ),
        ).resolves.toEqual({
          provider:
            "spotify-a",
        });

        currentScope =
          scopeAReplacement;

        await expect(
          getSpotifyCachedJson(
            "/me/top/artists",
          ),
        ).resolves.toEqual({
          provider:
            "spotify-replacement",
        });

        expect(
          mockSpotifyFetch,
        ).toHaveBeenCalledTimes(
          2,
        );

        const keys =
          Array.from(
            mockStorage.keys(),
          );

        expect(
          keys.some((key) =>
            key.startsWith(
              getSpotifyCacheNamespace(
                scopeA,
              ),
            ),
          ),
        ).toBe(true);

        expect(
          keys.some((key) =>
            key.startsWith(
              getSpotifyCacheNamespace(
                scopeAReplacement,
              ),
            ),
          ),
        ).toBe(true);
      },
    );

    it.each([
      200,
      304,
    ])(
      "rolls back an exact stale %i cache write when the account changes during setItem",
      async (status) => {
        const requestUrl =
          "https://api.spotify.com/v1/me/top/artists";

        const cacheKey =
          getSpotifyCacheNamespace(
            scopeA,
          ) +
          encodeURIComponent(
            requestUrl,
          );

        const previousValue =
          status ===
            304
            ? JSON.stringify({
              version: 3,
              ownerId:
                scopeA.ownerId,
              sessionGeneration:
                scopeA
                  .sessionGeneration,
              spotifyAccountGeneration:
                scopeA
                  .spotifyAccountGeneration,
              spotifyProfileId:
                scopeA
                  .spotifyProfileId,
              data: {
                owner: "A",
              },
              expiresAt: 0,
              etag: "etag-a",
              storedAt: 1,
            })
            : null;

        if (previousValue) {
          mockStorage.set(
            cacheKey,
            previousValue,
          );
        }

        mockSpotifyFetch
          .mockResolvedValueOnce(
            spotifyResponse(
              {
                owner: "A",
              },
              status,
            ),
          );

        let markWriteStarted:
          () => void =
          () => {};

        const writeStarted =
          new Promise<void>(
            (resolve) => {
              markWriteStarted =
                resolve;
            },
          );

        let finishWrite:
          () => void =
          () => {};

        const writeMayFinish =
          new Promise<void>(
            (resolve) => {
              finishWrite =
                resolve;
            },
          );

        mockAsyncStorage.setItem
          .mockImplementationOnce(
            async (
              key,
              value,
            ) => {
              mockStorage.set(
                key,
                value,
              );
              markWriteStarted();
              await writeMayFinish;
            },
          );

        const pendingWrite =
          getSpotifyCachedJson(
            "/me/top/artists",
          );

        await writeStarted;

        currentScope =
          status === 200
            ? scopeB
            : scopeA2;

        finishWrite();

        await expect(
          pendingWrite,
        ).rejects.toThrow(
          "account changed",
        );

        expect(
          mockStorage.get(
            cacheKey,
          ) ??
            null,
        ).toBe(
          previousValue,
        );
      },
    );

    it(
      "preserves an exact successor cache value when the OAuth operation lease is revoked during commit",
      async () => {
        const requestUrl =
          "https://api.spotify.com/v1/me/top/artists";

        const cacheKey =
          getSpotifyCacheNamespace(
            scopeA,
          ) +
          encodeURIComponent(
            requestUrl,
          );

        mockSpotifyFetch
          .mockResolvedValueOnce(
            spotifyResponse({
              owner:
                "A1",
            }),
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
              key,
              value,
            ) => {
              mockStorage.set(
                key,
                value,
              );
              signalWrite();
              await writeMayFinish;
            },
          );

        const pendingWrite =
          getSpotifyCachedJson(
            "/me/top/artists",
            {
              operationCommitGuard:
                () =>
                  commitCurrent,
            },
          );

        await writeStarted;

        const successorValue =
          "exact-a2-cache-value";

        mockStorage.set(
          cacheKey,
          successorValue,
        );
        commitCurrent =
          false;
        releaseWrite();

        await expect(
          pendingWrite,
        ).rejects.toThrow(
          "before Canal could cache",
        );

        expect(
          mockStorage.get(
            cacheKey,
          ),
        ).toBe(
          successorValue,
        );
      },
    );
  },
);
