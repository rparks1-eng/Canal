import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  StoredScene,
} from "./scenes";

import {
  isSupabaseConfigured,
  supabase,
} from "./supabase";

export type CanalPlayerSession = {
  id: string;
  ownerId?: string;
  sceneId: string;
  sceneName: string;
  currentIndex: number;
  isPlaying: boolean;
  elapsedSeconds: number;
  trackElapsedSeconds: number;
  startedAt: string;
  updatedAt: string;
};

export class CanalPlayerStorageError extends Error {
  operation:
    | "read"
    | "write"
    | "clear";

  constructor(
    operation:
      | "read"
      | "write"
      | "clear",
    message: string,
    options?: {
      cause?: unknown;
    },
  ) {
    super(
      message,
      options,
    );

    this.name =
      "CanalPlayerStorageError";

    this.operation =
      operation;
  }
}

const PLAYER_KEY =
  "@canal/player-session";

const DEFAULT_TRACK_DURATION_SECONDS =
  210;

let playerStorageQueue:
  Promise<void> =
    Promise.resolve();

let activePlayerSessionId:
  string | null =
    null;

let playerStorageGeneration =
  0;

const playerSessionGenerations =
  new Map<string, number>();

const clearingPlayerSessionIds =
  new Set<string>();

const clearedPlayerSessionIds =
  new Set<string>();

const MAX_CLEARED_PLAYER_SESSION_IDS =
  32;

const LOCAL_PLAYER_OWNER_ID =
  "local-prototype";

function rememberClearedPlayerSession(
  sessionId: string,
): void {
  clearedPlayerSessionIds.delete(
    sessionId,
  );

  clearedPlayerSessionIds.add(
    sessionId,
  );

  while (
    clearedPlayerSessionIds.size >
    MAX_CLEARED_PLAYER_SESSION_IDS
  ) {
    const oldestSessionId =
      clearedPlayerSessionIds
        .values()
        .next()
        .value;

    if (
      typeof oldestSessionId !==
      "string"
    ) {
      break;
    }

    clearedPlayerSessionIds.delete(
      oldestSessionId,
    );
  }
}

function prunePlayerSessionGenerations(
  activeSessionId:
    string | null,
): void {
  for (
    const sessionId of
    playerSessionGenerations.keys()
  ) {
    if (
      sessionId !==
        activeSessionId &&
      !clearingPlayerSessionIds.has(
        sessionId,
      )
    ) {
      playerSessionGenerations.delete(
        sessionId,
      );
    }
  }
}

function queuePlayerStorageOperation<
  Result,
>(
  operation:
    () => Promise<Result>,
): Promise<Result> {
  const result =
    playerStorageQueue.then(
      operation,
    );

  playerStorageQueue =
    result.then(
      () => undefined,
      () => undefined,
    );

  return result;
}

function readNonEmptyString(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim();
}

function readNonNegativeInteger(
  value: unknown,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? Math.max(
        0,
        Math.floor(value),
      )
    : 0;
}

function readTimestamp(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    !Number.isFinite(
      Date.parse(value),
    )
  ) {
    return null;
  }

  return value;
}

function normalizePlayerSession(
  value: unknown,
): CanalPlayerSession | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const candidate =
    value as Record<
      string,
      unknown
    >;

  const id =
    readNonEmptyString(
      candidate.id,
    );

  const sceneId =
    readNonEmptyString(
      candidate.sceneId,
    );

  const sceneName =
    readNonEmptyString(
      candidate.sceneName,
    );

  const ownerId =
    readNonEmptyString(
      candidate.ownerId,
    );

  const startedAt =
    readTimestamp(
      candidate.startedAt,
    );

  if (
    !id ||
    !sceneId ||
    !sceneName ||
    !startedAt
  ) {
    return null;
  }

  return {
    id,

    ...(ownerId
      ? {
          ownerId,
        }
      : {}),

    sceneId,
    sceneName,

    currentIndex:
      readNonNegativeInteger(
        candidate.currentIndex,
      ),

    isPlaying:
      candidate.isPlaying ===
      true,

    elapsedSeconds:
      readNonNegativeInteger(
        candidate.elapsedSeconds,
      ),

    trackElapsedSeconds:
      readNonNegativeInteger(
        candidate.trackElapsedSeconds ??
          candidate.elapsedSeconds,
      ),

    startedAt,

    updatedAt:
      readTimestamp(
        candidate.updatedAt,
      ) ??
      startedAt,
  };
}

function createId(): string {
  return (
    "player-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}

async function getCurrentPlayerOwnerId(): Promise<string> {
  if (!isSupabaseConfigured) {
    return LOCAL_PLAYER_OWNER_ID;
  }

  const {
    data: {
      session,
    },
    error,
  } =
    await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const ownerId =
    session?.user.id?.trim();

  if (!ownerId) {
    throw new Error(
      "You must be signed into Canal before starting playback.",
    );
  }

  return ownerId;
}

export async function createPlayerSession(
  scene: StoredScene,
): Promise<CanalPlayerSession> {
  const createGeneration =
    playerStorageGeneration;

  const ownerId =
    await getCurrentPlayerOwnerId();

  const sceneOwnerId =
    readNonEmptyString(
      scene.ownerId,
    );

  if (
    sceneOwnerId &&
    sceneOwnerId !== ownerId
  ) {
    throw new Error(
      "This Scene belongs to a different Canal account.",
    );
  }

  if (
    createGeneration !==
    playerStorageGeneration
  ) {
    throw new Error(
      "Playback changed while Canal was preparing this Scene. Start it again.",
    );
  }

  const now =
    new Date().toISOString();

  const session: CanalPlayerSession = {
    id:
      createId(),

    ownerId,

    sceneId:
      scene.id,

    sceneName:
      scene.name,

    currentIndex: 0,

    isPlaying: false,

    elapsedSeconds: 0,

    trackElapsedSeconds: 0,

    startedAt: now,

    updatedAt: now,
  };

  const created =
    await persistPlayerSession(
      session,
      true,
      createGeneration,
    );

  if (!created) {
    throw new Error(
      "Playback changed while Canal was preparing this Scene. Start it again.",
    );
  }

  return session;
}

export async function readPlayerSession(): Promise<
  CanalPlayerSession | null
> {
  const readGeneration =
    playerStorageGeneration;

  return queuePlayerStorageOperation(
    async () => {
      if (
        readGeneration !==
        playerStorageGeneration
      ) {
        return null;
      }

      const currentOwnerId =
        await getCurrentPlayerOwnerId();

      if (
        readGeneration !==
        playerStorageGeneration
      ) {
        return null;
      }

      let serialized:
        string | null;

      try {
        serialized =
          await AsyncStorage.getItem(
            PLAYER_KEY,
          );
      } catch (error) {
        throw new CanalPlayerStorageError(
          "read",
          "Canal could not read saved playback progress.",
          {
            cause: error,
          },
        );
      }

      const confirmedOwnerId =
        await getCurrentPlayerOwnerId();

      if (
        readGeneration !==
          playerStorageGeneration ||
        confirmedOwnerId !==
          currentOwnerId
      ) {
        return null;
      }

      if (!serialized) {
        return null;
      }

      try {
        const session =
          normalizePlayerSession(
            JSON.parse(
              serialized,
            ),
          );

        if (
          !session
        ) {
          return null;
        }

        if (
          !session.ownerId ||
          session.ownerId !==
            currentOwnerId
        ) {
          await AsyncStorage.removeItem(
            PLAYER_KEY,
          );

          rememberClearedPlayerSession(
            session.id,
          );

          if (
            activePlayerSessionId ===
            session.id
          ) {
            activePlayerSessionId =
              null;
          }

          return null;
        }

        if (
          clearedPlayerSessionIds.has(
            session.id,
          ) ||
          (
            activePlayerSessionId !==
              null &&
            activePlayerSessionId !==
              session.id
          )
        ) {
          return null;
        }

        const knownGeneration =
          playerSessionGenerations.get(
            session.id,
          );

        if (
          knownGeneration !==
            undefined &&
          knownGeneration !==
            readGeneration
        ) {
          return null;
        }

        if (
          readGeneration !==
          playerStorageGeneration
        ) {
          return null;
        }

        if (
          knownGeneration ===
          undefined
        ) {
          playerSessionGenerations.set(
            session.id,
            readGeneration,
          );
        }

        activePlayerSessionId =
          session.id;

        prunePlayerSessionGenerations(
          session.id,
        );

        return session;
      } catch {
        return null;
      }
    },
  );
}

async function persistPlayerSession(
  session: CanalPlayerSession,
  replaceExisting: boolean,
  expectedGeneration?:
    number,
): Promise<boolean> {
  const normalized =
    normalizePlayerSession(
      session,
    );

  if (!normalized) {
    throw new Error(
      "Canal could not save an invalid player session.",
    );
  }

  if (!normalized.ownerId) {
    throw new Error(
      "Canal could not save a player session without account ownership.",
    );
  }

  let sessionGeneration =
    playerSessionGenerations.get(
      normalized.id,
    );

  if (
    sessionGeneration ===
    undefined
  ) {
    sessionGeneration =
      expectedGeneration ??
      playerStorageGeneration;

    playerSessionGenerations.set(
      normalized.id,
      sessionGeneration,
    );
  }

  const supersededSessionId =
    replaceExisting
      ? activePlayerSessionId
      : null;

  if (
    sessionGeneration ===
      playerStorageGeneration &&
    replaceExisting
  ) {
    activePlayerSessionId =
      normalized.id;
  }

  const releaseRejectedSession =
    (
      restoreSuperseded:
        boolean,
    ): void => {
      if (
        replaceExisting &&
        activePlayerSessionId ===
          normalized.id
      ) {
        activePlayerSessionId =
          restoreSuperseded &&
          supersededSessionId &&
          !clearingPlayerSessionIds.has(
            supersededSessionId,
          ) &&
          !clearedPlayerSessionIds.has(
            supersededSessionId,
          )
            ? supersededSessionId
            : null;
      }

      if (
        activePlayerSessionId !==
        normalized.id
      ) {
        playerSessionGenerations.delete(
          normalized.id,
        );
      }

      prunePlayerSessionGenerations(
        activePlayerSessionId,
      );
    };

  return queuePlayerStorageOperation(
    async () => {
      if (
        sessionGeneration !==
          playerStorageGeneration ||
        clearingPlayerSessionIds.has(
          normalized.id,
        ) ||
        clearedPlayerSessionIds.has(
          normalized.id,
        ) ||
        (
          !replaceExisting &&
          activePlayerSessionId !==
            null &&
          activePlayerSessionId !==
            normalized.id
        )
      ) {
        releaseRejectedSession(
          false,
        );

        return false;
      }

      try {
        const currentOwnerId =
          await getCurrentPlayerOwnerId();

        if (
          sessionGeneration !==
            playerStorageGeneration ||
          normalized.ownerId !==
            currentOwnerId
        ) {
          releaseRejectedSession(
            false,
          );

          return false;
        }

        if (!replaceExisting) {
          const serialized =
            await AsyncStorage.getItem(
              PLAYER_KEY,
            );

          const storedSession =
            serialized
              ? normalizePlayerSession(
                  JSON.parse(
                    serialized,
                  ),
                )
              : null;

          if (
            storedSession &&
            storedSession.id !==
              normalized.id
          ) {
            releaseRejectedSession(
              false,
            );

            return false;
          }
        }

        await AsyncStorage.setItem(
          PLAYER_KEY,
          JSON.stringify({
            ...normalized,

            updatedAt:
              new Date().toISOString(),
          }),
        );

        if (
          sessionGeneration !==
            playerStorageGeneration ||
          clearingPlayerSessionIds.has(
            normalized.id,
          ) ||
          clearedPlayerSessionIds.has(
            normalized.id,
          )
        ) {
          releaseRejectedSession(
            false,
          );

          return false;
        }

        activePlayerSessionId =
          normalized.id;

        if (
          supersededSessionId &&
          supersededSessionId !==
            normalized.id
        ) {
          rememberClearedPlayerSession(
            supersededSessionId,
          );

          playerSessionGenerations.delete(
            supersededSessionId,
          );
        }

        prunePlayerSessionGenerations(
          normalized.id,
        );

        return true;
      } catch (error) {
        releaseRejectedSession(
          sessionGeneration ===
            playerStorageGeneration,
        );

        throw new CanalPlayerStorageError(
          "write",
          "Canal could not save playback progress.",
          {
            cause: error,
          },
        );
      }
    },
  );
}

export async function writePlayerSession(
  session: CanalPlayerSession,
): Promise<void> {
  await persistPlayerSession(
    session,
    false,
  );
}

export async function clearPlayerSession(
  expectedSessionId?: string,
): Promise<void> {
  if (!expectedSessionId) {
    const knownSessionIds =
      Array.from(
        playerSessionGenerations.keys(),
      );

    playerStorageGeneration +=
      1;

    playerSessionGenerations.clear();

    for (
      const sessionId of
      knownSessionIds
    ) {
      rememberClearedPlayerSession(
        sessionId,
      );
    }
  }

  const sessionIdToInvalidate =
    expectedSessionId ??
    activePlayerSessionId;

  if (sessionIdToInvalidate) {
    clearingPlayerSessionIds.add(
      sessionIdToInvalidate,
    );
  }

  if (!expectedSessionId) {
    activePlayerSessionId =
      null;
  }

  return queuePlayerStorageOperation(
    async () => {
      try {
        if (expectedSessionId) {
          const serialized =
            await AsyncStorage.getItem(
              PLAYER_KEY,
            );

          const storedSession =
            serialized
              ? normalizePlayerSession(
                  JSON.parse(
                    serialized,
                  ),
                )
              : null;

          if (
            !storedSession ||
            storedSession.id ===
              expectedSessionId
          ) {
            await AsyncStorage.removeItem(
              PLAYER_KEY,
            );
          }
        } else {
          await AsyncStorage.removeItem(
            PLAYER_KEY,
          );
        }

        if (
          sessionIdToInvalidate
        ) {
          clearingPlayerSessionIds.delete(
            sessionIdToInvalidate,
          );

          rememberClearedPlayerSession(
            sessionIdToInvalidate,
          );

          playerSessionGenerations.delete(
            sessionIdToInvalidate,
          );
        }

        if (
          !expectedSessionId ||
          activePlayerSessionId ===
            expectedSessionId
        ) {
          activePlayerSessionId =
            null;
        }

        prunePlayerSessionGenerations(
          activePlayerSessionId,
        );
      } catch (error) {
        if (
          sessionIdToInvalidate
        ) {
          clearingPlayerSessionIds.delete(
            sessionIdToInvalidate,
          );
        }

        throw new CanalPlayerStorageError(
          "clear",
          "Canal could not finish clearing playback progress.",
          {
            cause: error,
          },
        );
      }
    },
  );
}

function trackDurationSeconds(
  scene: StoredScene,
  index: number,
): number {
  const durationMs =
    scene.tracks[
      index
    ]?.durationMs;

  return Math.max(
    1,
    Math.round(
      typeof durationMs ===
        "number" &&
        Number.isFinite(
          durationMs,
        )
        ? durationMs /
            1000
        : DEFAULT_TRACK_DURATION_SECONDS,
    ),
  );
}

export function constrainPlayerSessionToScene(
  session: CanalPlayerSession,
  scene: StoredScene,
): CanalPlayerSession | null {
  if (
    session.sceneId !==
    scene.id
  ) {
    return null;
  }

  if (
    scene.tracks.length ===
    0
  ) {
    return {
      ...session,
      sceneName:
        scene.name,
      currentIndex: 0,
      isPlaying: false,
      trackElapsedSeconds: 0,
    };
  }

  const currentIndex =
    Math.min(
      scene.tracks.length -
        1,
      Math.max(
        0,
        Math.floor(
          session.currentIndex,
        ),
      ),
    );

  return {
    ...session,
    sceneName:
      scene.name,
    currentIndex,
    trackElapsedSeconds:
      Math.min(
        trackDurationSeconds(
          scene,
          currentIndex,
        ),
        Math.max(
          0,
          Math.floor(
            session.trackElapsedSeconds,
          ),
        ),
      ),
  };
}

export function movePlayerSession(
  session: CanalPlayerSession,
  scene: StoredScene,
  direction: -1 | 1,
): CanalPlayerSession | null {
  const constrained =
    constrainPlayerSessionToScene(
      session,
      scene,
    );

  if (
    !constrained ||
    scene.tracks.length ===
      0
  ) {
    return constrained;
  }

  const nextIndex =
    Math.min(
      scene.tracks.length -
        1,
      Math.max(
        0,
        constrained.currentIndex +
          direction,
      ),
    );

  if (
    nextIndex ===
    constrained.currentIndex
  ) {
    return constrained;
  }

  return {
    ...constrained,
    currentIndex:
      nextIndex,
    trackElapsedSeconds: 0,
  };
}

export function advancePlayerSession(
  session: CanalPlayerSession,
  scene: StoredScene,
  seconds = 1,
): CanalPlayerSession | null {
  const constrained =
    constrainPlayerSessionToScene(
      session,
      scene,
    );

  if (
    !constrained ||
    !constrained.isPlaying ||
    scene.tracks.length ===
      0
  ) {
    return constrained;
  }

  const safeSeconds =
    readNonNegativeInteger(
      seconds,
    );

  if (safeSeconds === 0) {
    return constrained;
  }

  let currentIndex =
    constrained.currentIndex;

  let trackElapsedSeconds =
    constrained.trackElapsedSeconds;

  let isPlaying: boolean =
    constrained.isPlaying;

  let remainingSeconds =
    safeSeconds;

  let consumedSeconds =
    0;

  while (
    remainingSeconds >
    0
  ) {
    const currentDuration =
      trackDurationSeconds(
        scene,
        currentIndex,
      );

    const availableSeconds =
      Math.max(
        0,
        currentDuration -
          trackElapsedSeconds,
      );

    if (
      remainingSeconds <
      availableSeconds
    ) {
      trackElapsedSeconds +=
        remainingSeconds;

      consumedSeconds +=
        remainingSeconds;

      remainingSeconds =
        0;

      break;
    }

    trackElapsedSeconds =
      currentDuration;

    consumedSeconds +=
      availableSeconds;

    remainingSeconds -=
      availableSeconds;

    if (
      currentIndex >=
      scene.tracks.length -
        1
    ) {
      trackElapsedSeconds =
        currentDuration;

      isPlaying =
        false;

      break;
    }

    currentIndex += 1;

    trackElapsedSeconds =
      0;
  }

  return {
    ...constrained,
    currentIndex,
    isPlaying,
    elapsedSeconds:
      constrained.elapsedSeconds +
      consumedSeconds,
    trackElapsedSeconds,
  };
}
