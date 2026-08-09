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

  return data;
}
