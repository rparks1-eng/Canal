import type {
  GeniusContextErrorResponse,
} from "../../../lib/genius-context-contract.ts";

import {
  GeniusContextHttpError,
  normalizeGeniusContext,
  parseGeniusContextRequest,
  selectBestSearchSong,
// @ts-expect-error Deno Edge Functions require explicit TypeScript extensions.
} from "./helpers.ts";

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const GENIUS_API_ORIGIN = "https://api.genius.com";
const MAX_REQUEST_BYTES = 4_096;
const UPSTREAM_TIMEOUT_MS = 6_000;
const CORS_HEADERS = {
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "cache-control": "private, no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

function errorResponse(error: GeniusContextHttpError): Response {
  const body: GeniusContextErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.retryAfterSeconds
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    },
  };

  return jsonResponse(
    body,
    error.status,
    error.retryAfterSeconds
      ? { "retry-after": String(error.retryAfterSeconds) }
      : undefined,
  );
}

function getRequiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new GeniusContextHttpError(
      503,
      "server_misconfigured",
      "Song context is not configured.",
    );
  }

  return value;
}

function getSupabasePublishableKey(): string {
  const direct =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() ||
    Deno.env.get("SUPABASE_ANON_KEY")?.trim();

  if (direct) {
    return direct;
  }

  const namedKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")?.trim();

  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys) as Record<string, unknown>;
      const preferred = typeof parsed.default === "string" ? parsed.default.trim() : "";
      const fallback = Object.values(parsed).find((value) => typeof value === "string");
      const key = preferred || (typeof fallback === "string" ? fallback.trim() : "");

      if (key) {
        return key;
      }
    } catch {
      // Fall through to the same non-sensitive configuration error.
    }
  }

  throw new GeniusContextHttpError(
    503,
    "server_misconfigured",
    "Song context authentication is not configured.",
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch {
    throw new GeniusContextHttpError(
      502,
      "provider_unavailable",
      "The song-context provider is unavailable.",
    );
  } finally {
    clearTimeout(timer);
  }
}

function requireBearerHeader(request: Request): string {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  if (
    !authorization.startsWith("Bearer ") ||
    authorization.length <= 7 ||
    authorization.length > 4_096
  ) {
    throw new GeniusContextHttpError(
      401,
      "not_authenticated",
      "Sign in to view song context.",
    );
  }

  return authorization;
}

async function requireAuthenticatedUser(request: Request): Promise<void> {
  const authorization = requireBearerHeader(request);
  const supabaseUrl = getRequiredEnvironment("SUPABASE_URL");
  const publishableKey = getSupabasePublishableKey();
  let userUrl: URL;

  try {
    userUrl = new URL("/auth/v1/user", supabaseUrl);
  } catch {
    throw new GeniusContextHttpError(
      503,
      "server_misconfigured",
      "Song context authentication is not configured.",
    );
  }

  if (userUrl.protocol !== "https:") {
    throw new GeniusContextHttpError(
      503,
      "server_misconfigured",
      "Song context authentication is not configured.",
    );
  }

  const response = await fetchWithTimeout(userUrl.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      apikey: publishableKey,
      authorization,
    },
  });

  if (!response.ok) {
    throw new GeniusContextHttpError(
      401,
      "not_authenticated",
      "Sign in to view song context.",
    );
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const parsed = Number(response.headers.get("retry-after"));

  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.ceil(parsed), 3_600)
    : undefined;
}

async function geniusJson(
  path: string,
  accessToken: string,
): Promise<unknown> {
  const url = new URL(path, GENIUS_API_ORIGIN);

  if (url.origin !== GENIUS_API_ORIGIN || !url.pathname.startsWith("/")) {
    throw new GeniusContextHttpError(500, "provider_unavailable", "Invalid provider request.");
  }

  const response = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) {
    throw new GeniusContextHttpError(404, "not_found", "No Genius context was found for this song.");
  }

  if (response.status === 429) {
    const retryAfter = retryAfterSeconds(response);
    throw new GeniusContextHttpError(
      503,
      "provider_rate_limited",
      "Song context is temporarily rate limited.",
      retryAfter,
    );
  }

  if (!response.ok) {
    throw new GeniusContextHttpError(
      502,
      "provider_unavailable",
      "The song-context provider returned an error.",
    );
  }

  try {
    return await response.json();
  } catch {
    throw new GeniusContextHttpError(
      502,
      "provider_unavailable",
      "The song-context provider returned invalid data.",
    );
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new GeniusContextHttpError(400, "bad_request", "The request is too large.");
  }

  const text = await request.text();

  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new GeniusContextHttpError(400, "bad_request", "The request is too large.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new GeniusContextHttpError(400, "bad_request", "Valid JSON is required.");
  }
}

export async function handleGeniusContextRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  try {
    if (request.method !== "POST") {
      throw new GeniusContextHttpError(
        405,
        "method_not_allowed",
        "Use POST to request song context.",
      );
    }

    await requireAuthenticatedUser(request);

    const input = parseGeniusContextRequest(await readJsonBody(request));
    const providerToken = getRequiredEnvironment("GENIUS_ACCESS_TOKEN");
    let songId = input.geniusSongId;

    if (!songId) {
      const query = encodeURIComponent(`${input.title} ${input.artist}`);
      const searchPayload = await geniusJson(`/search?q=${query}`, providerToken);
      const match = selectBestSearchSong(searchPayload, input);
      const matchId = match ? Number(match.id) : Number.NaN;

      if (!Number.isSafeInteger(matchId) || matchId <= 0) {
        throw new GeniusContextHttpError(
          404,
          "not_found",
          "No confident Genius match was found for this song.",
        );
      }

      songId = matchId;
    }

    const [songPayload, referentsPayload] = await Promise.all([
      geniusJson(`/songs/${songId}?text_format=plain`, providerToken),
      geniusJson(
        `/referents?song_id=${songId}&text_format=plain&per_page=8&page=1`,
        providerToken,
      ),
    ]);

    return jsonResponse(
      normalizeGeniusContext(
        songPayload,
        referentsPayload,
        input,
        new Date().toISOString(),
      ),
    );
  } catch (error) {
    if (error instanceof GeniusContextHttpError) {
      return errorResponse(error);
    }

    return errorResponse(
      new GeniusContextHttpError(
        500,
        "provider_unavailable",
        "Song context could not be loaded.",
      ),
    );
  }
}

Deno.serve(handleGeniusContextRequest);
