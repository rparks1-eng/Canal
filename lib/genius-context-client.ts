import {
  GENIUS_CONTEXT_FUNCTION_NAME,
  isGeniusContextResponse,
} from "./genius-context-contract";

import type {
  GeniusContextRequest,
  GeniusContextResponse,
} from "./genius-context-contract";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";
import {
  assertCanalAccountSessionGuardCurrent,
  captureCanalAccountSessionGuard,
} from "./canal-auth";

export type GeniusContextScope = {
  userId: string;
  sessionGeneration: string;
};

export class GeniusContextClientError extends Error {
  constructor(
    public readonly code:
      | "not_authenticated"
      | "not_found"
      | "stale_scope"
      | "unavailable"
      | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "GeniusContextClientError";
  }
}

const geniusArtworkCache = new Map<string, string>();
const MAX_GENIUS_ARTWORK_CACHE_ENTRIES = 256;
const geniusArtworkRequests = new Map<string, Promise<string | null>>();
const GENIUS_ARTWORK_WINDOW_MS = 5 * 60_000;
const GENIUS_ARTWORK_REQUEST_LIMIT = 12;
let geniusArtworkWindowStartedAt = 0;
let geniusArtworkWindowRequests = 0;

function contextIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLowerCase();
}

export function readCachedGeniusArtwork(
  title: string,
  artist: string,
): string | null {
  return geniusArtworkCache.get(
    `${contextIdentity(title)}::${contextIdentity(artist)}`,
  ) ?? null;
}

/**
 * Loads a bounded, coalesced Genius artwork fallback. This is deliberately
 * rate-limited so rendering a large Scene cannot fan out one Edge request per
 * row. Auth and account-generation checks fence every request.
 */
export async function loadGeniusArtworkFallback(
  title: string,
  artist: string,
): Promise<string | null> {
  const key = `${contextIdentity(title)}::${contextIdentity(artist)}`;
  const cached = geniusArtworkCache.get(key);
  if (cached) return cached;
  if (!key || key === "::") return null;

  const current = Date.now();
  if (current - geniusArtworkWindowStartedAt >= GENIUS_ARTWORK_WINDOW_MS) {
    geniusArtworkWindowStartedAt = current;
    geniusArtworkWindowRequests = 0;
  }
  const existing = geniusArtworkRequests.get(key);
  if (existing) return existing;
  if (geniusArtworkWindowRequests >= GENIUS_ARTWORK_REQUEST_LIMIT) return null;
  geniusArtworkWindowRequests += 1;

  const request = (async (): Promise<string | null> => {
    try {
      const guard = await captureCanalAccountSessionGuard();
      const response = await loadGeniusContext({
        request: { title: title.trim(), artist: artist.trim() },
        scope: {
          userId: guard.userId,
          sessionGeneration: guard.sessionGeneration,
        },
        isCurrent: () => true,
      });
      await assertCanalAccountSessionGuardCurrent(guard);
      return response.song.artworkUrl ?? null;
    } catch {
      return null;
    } finally {
      geniusArtworkRequests.delete(key);
    }
  })();
  geniusArtworkRequests.set(key, request);
  return request;
}

/**
 * Loads ephemeral song context for one immutable signed-in account scope.
 * The response is deliberately not written to AsyncStorage or SecureStore.
 */
export async function loadGeniusContext(input: {
  request: GeniusContextRequest;
  scope: GeniusContextScope;
  isCurrent: (scope: GeniusContextScope) => boolean;
}): Promise<GeniusContextResponse> {
  requireSupabaseConfiguration();

  if (!input.isCurrent(input.scope)) {
    throw new GeniusContextClientError("stale_scope", "The active Canal account changed.");
  }

  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session?.user.id !== input.scope.userId) {
    throw new GeniusContextClientError("not_authenticated", "Sign in to view song context.");
  }

  const { data, error } = await supabase.functions.invoke(
    GENIUS_CONTEXT_FUNCTION_NAME,
    {
      body: input.request,
    },
  );

  if (!input.isCurrent(input.scope)) {
    throw new GeniusContextClientError("stale_scope", "The active Canal account changed.");
  }

  const { data: currentSessionData } = await supabase.auth.getSession();

  if (currentSessionData.session?.user.id !== input.scope.userId) {
    throw new GeniusContextClientError("stale_scope", "The active Canal account changed.");
  }

  if (error) {
    const response =
      (error as { context?: unknown })
        .context;

    if (
      response instanceof Response &&
      response.status === 404
    ) {
      throw new GeniusContextClientError("not_found", "No Genius context was found for this song.");
    }

    throw new GeniusContextClientError("unavailable", "Song context is temporarily unavailable.");
  }

  if (!isGeniusContextResponse(data)) {
    throw new GeniusContextClientError("invalid_response", "Song context returned an invalid response.");
  }

  if (data.song.artworkUrl) {
    const key = `${contextIdentity(data.song.title)}::${contextIdentity(data.song.artist)}`;
    geniusArtworkCache.delete(key);
    geniusArtworkCache.set(key, data.song.artworkUrl);
    if (geniusArtworkCache.size > MAX_GENIUS_ARTWORK_CACHE_ENTRIES) {
      const oldest = geniusArtworkCache.keys().next().value;
      if (typeof oldest === "string") geniusArtworkCache.delete(oldest);
    }
  }

  return data;
}
