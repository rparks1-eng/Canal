import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  assertSpotifyCacheScopeCurrent,
  captureSpotifyCacheScope,
  spotifyAuthenticatedFetch,
} from "./spotify-auth";

import type {
  SpotifyCacheScope,
} from "./spotify-auth";

import {
  getSpotifyCacheNamespace,
} from "./storage-keys";

const SPOTIFY_API_BASE_URL =
  "https://api.spotify.com/v1";

const DEFAULT_CACHE_DURATION_MS =
  15 * 60 * 1000;

type SpotifyCacheEntry<T> = {
  version: 3;
  ownerId: string;
  sessionGeneration: string;
  spotifyAccountGeneration: number;
  spotifyProfileId: string;
  data: T;
  expiresAt: number;
  etag?: string;
  storedAt: number;
};

type CachedSpotifyRequestOptions = {
  fallbackTtlMs?: number;
  forceRefresh?: boolean;
  operationCommitGuard?:
    () => boolean;
};

let cacheCommitTail:
  Promise<void> =
  Promise.resolve();

export async function getSpotifyCachedJson<T>(
  path: string,
  options: CachedSpotifyRequestOptions = {},
): Promise<T> {
  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed before Canal could cache this response.",
    );
  }

  const accountScope =
    await captureSpotifyCacheScope();

  const requestUrl = path.startsWith("http")
    ? path
    : `${SPOTIFY_API_BASE_URL}${path}`;

  const cacheKey =
    createCacheKey(
      requestUrl,
      accountScope,
    );

  const fallbackTtlMs =
    options.fallbackTtlMs ??
    DEFAULT_CACHE_DURATION_MS;

  const existingEntry =
    await readCacheEntry<T>(
      cacheKey,
      accountScope,
    );

  await assertSpotifyCacheScopeCurrent(
    accountScope,
  );

  if (
    options.operationCommitGuard &&
    !options.operationCommitGuard()
  ) {
    throw new Error(
      "Spotify connection changed before Canal could cache this response.",
    );
  }

  if (
    existingEntry &&
    !options.forceRefresh &&
    Date.now() <
      existingEntry.expiresAt
  ) {
    await assertSpotifyCacheScopeCurrent(
      accountScope,
    );

    return existingEntry.data;
  }

  const headers: Record<
    string,
    string
  > = {
    Accept: "application/json",
  };

  if (
    existingEntry?.etag &&
    !options.forceRefresh
  ) {
    headers["If-None-Match"] =
      existingEntry.etag;
  }

  const response =
    await spotifyAuthenticatedFetch(
      requestUrl,
      {
        headers,
      },
    );

  await assertSpotifyCacheScopeCurrent(
    accountScope,
  );

  if (
    response.status === 304 &&
    existingEntry
  ) {
    const refreshedEntry:
      SpotifyCacheEntry<T> = {
        ...existingEntry,
        expiresAt:
          Date.now() +
          fallbackTtlMs,
      };

    await assertSpotifyCacheScopeCurrent(
      accountScope,
    );

    await writeCacheEntry(
      cacheKey,
      refreshedEntry,
      accountScope,
      options.operationCommitGuard,
    );

    return refreshedEntry.data;
  }

  if (!response.ok) {
    if (
      response.status === 401
    ) {
      throw new Error(
        "Spotify authorization expired.",
      );
    }

    if (
      response.status === 429
    ) {
      throw new Error(
        "Spotify is receiving too many requests. Try again shortly.",
      );
    }

    throw new Error(
      `Spotify request failed with status ${response.status}.`,
    );
  }

  const responseData =
    (await response.json()) as T;

  await assertSpotifyCacheScopeCurrent(
    accountScope,
  );

  const cacheDuration =
    getCacheDuration(
      response.headers.get(
        "cache-control",
      ),
      fallbackTtlMs,
    );

  const newEntry:
    SpotifyCacheEntry<T> = {
      version: 3,
      ownerId:
        accountScope.ownerId,
      sessionGeneration:
        accountScope
          .sessionGeneration,
      spotifyAccountGeneration:
        accountScope
          .spotifyAccountGeneration,
      spotifyProfileId:
        accountScope
          .spotifyProfileId,
      data: responseData,
      expiresAt:
        Date.now() +
        cacheDuration,
      etag:
        response.headers.get(
          "etag",
        ) ?? undefined,
      storedAt: Date.now(),
    };

  await assertSpotifyCacheScopeCurrent(
    accountScope,
  );

  await writeCacheEntry(
    cacheKey,
    newEntry,
    accountScope,
    options.operationCommitGuard,
  );

  return responseData;
}

export async function clearSpotifyApiCache(
  expectedScope?:
    SpotifyCacheScope,
): Promise<void> {
  const accountScope =
    expectedScope ??
    (await captureSpotifyCacheScope());

  await assertSpotifyCacheScopeCurrent(
    accountScope,
  );

  const keys =
    await AsyncStorage.getAllKeys();

  await assertSpotifyCacheScopeCurrent(
    accountScope,
  );

  const namespace =
    getSpotifyCacheNamespace(
      accountScope,
    );

  const cacheKeys =
    keys.filter((key) =>
      key.startsWith(
        namespace,
      ),
    );

  if (cacheKeys.length === 0) {
    return;
  }

  await assertSpotifyCacheScopeCurrent(
    accountScope,
  );

  await AsyncStorage.multiRemove(
    cacheKeys,
  );
}

function createCacheKey(
  requestUrl: string,
  accountScope:
    SpotifyCacheScope,
): string {
  return (
    getSpotifyCacheNamespace(
      accountScope,
    ) +
    encodeURIComponent(requestUrl)
  );
}

async function readCacheEntry<T>(
  cacheKey: string,
  accountScope:
    SpotifyCacheScope,
): Promise<SpotifyCacheEntry<T> | null> {
  const storedValue =
    await AsyncStorage.getItem(
      cacheKey,
    );

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (
      typeof parsedValue !==
        "object" ||
      parsedValue === null
    ) {
      return null;
    }

    const possibleEntry =
      parsedValue as Partial<
        SpotifyCacheEntry<T>
      >;

    if (
      possibleEntry.version !==
        3 ||
      possibleEntry.ownerId !==
        accountScope.ownerId ||
      possibleEntry.sessionGeneration !==
        accountScope
          .sessionGeneration ||
      possibleEntry.spotifyAccountGeneration !==
        accountScope
          .spotifyAccountGeneration ||
      possibleEntry.spotifyProfileId !==
        accountScope
          .spotifyProfileId ||
      typeof possibleEntry.expiresAt !==
        "number" ||
      typeof possibleEntry.storedAt !==
        "number" ||
      !(
        "data" in
        possibleEntry
      )
    ) {
      return null;
    }

    return possibleEntry as
      SpotifyCacheEntry<T>;
  } catch {
    return null;
  }
}

async function writeCacheEntry<T>(
  cacheKey: string,
  entry: SpotifyCacheEntry<T>,
  accountScope:
    SpotifyCacheScope,
  operationCommitGuard?:
    () => boolean,
): Promise<void> {
  const previousCommit =
    cacheCommitTail;

  let releaseCommit:
    () => void =
      () => {};

  cacheCommitTail =
    new Promise<void>(
      (resolve) => {
        releaseCommit =
          resolve;
      },
    );

  await previousCommit;

  if (
    operationCommitGuard &&
    !operationCommitGuard()
  ) {
    releaseCommit();

    throw new Error(
      "Spotify connection changed before Canal could cache this response.",
    );
  }

  const serialized =
    JSON.stringify(
      entry,
    );

  try {
    const previousValue =
      await AsyncStorage.getItem(
        cacheKey,
      );

    if (
      operationCommitGuard &&
      !operationCommitGuard()
    ) {
      throw new Error(
        "Spotify connection changed before Canal could cache this response.",
      );
    }

    await AsyncStorage.setItem(
      cacheKey,
      serialized,
    );

    try {
      if (
        operationCommitGuard &&
        !operationCommitGuard()
      ) {
        throw new Error(
          "Spotify connection changed before Canal could cache this response.",
        );
      }

      await assertSpotifyCacheScopeCurrent(
        accountScope,
      );

      if (
        operationCommitGuard &&
        !operationCommitGuard()
      ) {
        throw new Error(
          "Spotify connection changed before Canal could cache this response.",
        );
      }
    } catch (error) {
      const currentValue =
        await AsyncStorage.getItem(
          cacheKey,
        );

      if (
        currentValue ===
          serialized
      ) {
        if (
          previousValue ===
            null
        ) {
          await AsyncStorage.removeItem(
            cacheKey,
          );
        } else {
          await AsyncStorage.setItem(
            cacheKey,
            previousValue,
          );
        }
      }

      throw error;
    }
  } finally {
    releaseCommit();
  }
}

function getCacheDuration(
  cacheControl:
    | string
    | null,
  fallbackTtlMs: number,
): number {
  if (!cacheControl) {
    return fallbackTtlMs;
  }

  const maximumAgeMatch =
    cacheControl.match(
      /max-age=(\d+)/i,
    );

  if (!maximumAgeMatch) {
    return fallbackTtlMs;
  }

  const maximumAgeSeconds =
    Number(
      maximumAgeMatch[1],
    );

  if (
    !Number.isFinite(
      maximumAgeSeconds,
    ) ||
    maximumAgeSeconds < 0
  ) {
    return fallbackTtlMs;
  }

  return (
    maximumAgeSeconds * 1000
  );
}
