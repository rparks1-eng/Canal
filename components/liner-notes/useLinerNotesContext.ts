import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  GeniusContextScope,
} from "../../lib/genius-context-client";

import type {
  GeniusContextResponse,
} from "../../lib/genius-context-contract";

import {
  GeniusContextClientError,
  loadGeniusContext,
} from "../../lib/genius-context-client";

import type {
  ConnectivityStatus,
} from "../../lib/connectivity";

import type {
  LinerNotesTrack,
} from "./LinerNotesOverlay";

export type LinerNotesContextState =
  | "ready"
  | "loading"
  | "empty"
  | "error"
  | "offline";

export function useLinerNotesContext(input: {
  track: LinerNotesTrack | null;
  visible: boolean;
  userId: string | null;
  sessionGeneration: string | null;
  connectivityStatus: ConnectivityStatus;
}): {
  context: GeniusContextResponse | null;
  state: LinerNotesContextState;
  retry: () => void;
} {
  const [context, setContext] =
    useState<GeniusContextResponse | null>(null);
  const [state, setState] =
    useState<LinerNotesContextState>("empty");
  const [retryGeneration, setRetryGeneration] =
    useState(0);
  const requestGenerationRef = useRef(0);
  const scopeRef = useRef<GeniusContextScope | null>(null);

  scopeRef.current =
    input.userId && input.sessionGeneration
      ? {
          userId: input.userId,
          sessionGeneration: input.sessionGeneration,
        }
      : null;

  const retry = useCallback(() => {
    setRetryGeneration((current) => current + 1);
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    const requestGeneration = requestGenerationRef.current;
    const scope = scopeRef.current;
    const track = input.track;

    if (!input.visible || !track) {
      setContext(null);
      setState("empty");
      return;
    }

    if (input.connectivityStatus === "offline") {
      setContext(null);
      setState("offline");
      return;
    }

    if (!scope) {
      setContext(null);
      setState("error");
      return;
    }

    setContext(null);
    setState("loading");

    void loadGeniusContext({
      request: {
        title: track.title,
        artist: track.artist,
        ...(track.album ? { album: track.album } : {}),
      },
      scope,
      isCurrent: (candidate) => {
        const current = scopeRef.current;
        return (
          requestGenerationRef.current === requestGeneration &&
          current?.userId === candidate.userId &&
          current.sessionGeneration === candidate.sessionGeneration
        );
      },
    }).then(
      (nextContext) => {
        if (requestGenerationRef.current !== requestGeneration) return;
        setContext(nextContext);
        setState("ready");
      },
      (error: unknown) => {
        if (requestGenerationRef.current !== requestGeneration) return;
        if (error instanceof GeniusContextClientError && error.code === "stale_scope") return;
        setContext(null);
        setState(
          error instanceof GeniusContextClientError && error.code === "not_found"
            ? "empty"
            : "error",
        );
      },
    );

    return () => {
      if (requestGenerationRef.current === requestGeneration) {
        requestGenerationRef.current += 1;
      }
    };
  }, [
    input.connectivityStatus,
    input.sessionGeneration,
    input.track,
    input.userId,
    input.visible,
    retryGeneration,
  ]);

  return {
    context,
    state,
    retry,
  };
}
