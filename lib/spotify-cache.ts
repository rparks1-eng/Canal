import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    spotifyAuthenticatedFetch,
} from "./spotify-auth";

const SPOTIFY_API_BASE_URL =
  "https://api.spotify.com/v1";

const SPOTIFY_CACHE_PREFIX =
  "@canal/spotify-cache";

const DEFAULT_CACHE_DURATION_MS =
  15 * 60 * 1000;

type SpotifyCacheEntry<T> = {
  data: T;
  expiresAt: number;
  etag?: string;
  storedAt: number;
};

type CachedSpotifyRequestOptions = {
  fallbackTtlMs?: number;
  forceRefresh?: boolean;
};

export async function getSpotifyCachedJson<T>(
  path: string,
  options: CachedSpotifyRequestOptions = {},
): Promise<T> {
  const requestUrl = path.startsWith("http")
    ? path
    : `${SPOTIFY_API_BASE_URL}${path}`;

  const cacheKey =
    createCacheKey(requestUrl);

  const fallbackTtlMs =
    options.fallbackTtlMs ??
    DEFAULT_CACHE_DURATION_MS;

  const existingEntry =
    await readCacheEntry<T>(
      cacheKey,
    );

  if (
    existingEntry &&
    !options.forceRefresh &&
    Date.now() <
      existingEntry.expiresAt
  ) {
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

    await writeCacheEntry(
      cacheKey,
      refreshedEntry,
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

  const cacheDuration =
    getCacheDuration(
      response.headers.get(
        "cache-control",
      ),
      fallbackTtlMs,
    );

  const newEntry:
    SpotifyCacheEntry<T> = {
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

  await writeCacheEntry(
    cacheKey,
    newEntry,
  );

  return responseData;
}

export async function clearSpotifyApiCache(): Promise<void> {
  const keys =
    await AsyncStorage.getAllKeys();

  const cacheKeys =
    keys.filter((key) =>
      key.startsWith(
        SPOTIFY_CACHE_PREFIX,
      ),
    );

  if (cacheKeys.length === 0) {
    return;
  }

  await AsyncStorage.multiRemove(
    cacheKeys,
  );
}

function createCacheKey(
  requestUrl: string,
): string {
  return (
    `${SPOTIFY_CACHE_PREFIX}:` +
    encodeURIComponent(requestUrl)
  );
}

async function readCacheEntry<T>(
  cacheKey: string,
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
): Promise<void> {
  await AsyncStorage.setItem(
    cacheKey,
    JSON.stringify(entry),
  );
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
