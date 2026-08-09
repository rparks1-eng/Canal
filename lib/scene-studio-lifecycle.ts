import type {
  SceneStudioScope,
} from "./scene-studio-scope";

import {
  sceneStudioScopeKey,
} from "./scene-studio-scope";

export type SceneStudioInvalidationReason =
  | "account-switch"
  | "disconnect"
  | "logout"
  | "device-clear";

export type SceneStudioInvalidation = Readonly<{
  reason: SceneStudioInvalidationReason;
  scope?: SceneStudioScope;
  ownerId?: string;
}>;

export type SceneStudioInvalidationHandler = (
  invalidation: SceneStudioInvalidation,
) => void | Promise<void>;

const handlers = new Set<
  SceneStudioInvalidationHandler
>();

/**
 * These counters are deliberately process-local callback fences. Device
 * clearing advances the global counter; account lifecycle actions advance
 * only the captured owner or exact scope counter. Durable account identity
 * remains in SceneStudioScope and the persisted envelope.
 */
let deviceInvalidationGeneration = 0;
const ownerInvalidationGenerations = new Map<string, number>();
const scopeInvalidationGenerations = new Map<string, number>();

export type SceneStudioInvalidationGeneration = Readonly<{
  device: number;
  owner: number;
  scope: number;
}>;

export function captureSceneStudioInvalidationGeneration(
  scope?: SceneStudioScope | null,
): SceneStudioInvalidationGeneration {
  return Object.freeze({
    device: deviceInvalidationGeneration,
    owner: scope
      ? ownerInvalidationGenerations.get(scope.userId) ?? 0
      : 0,
    scope: scope
      ? scopeInvalidationGenerations.get(sceneStudioScopeKey(scope)) ?? 0
      : 0,
  });
}

export function sceneStudioInvalidationGenerationIsCurrent(
  generation: SceneStudioInvalidationGeneration,
  scope?: SceneStudioScope | null,
): boolean {
  const current = captureSceneStudioInvalidationGeneration(scope);

  return (
    generation.device === current.device &&
    generation.owner === current.owner &&
    generation.scope === current.scope
  );
}

export function registerSceneStudioInvalidationHandler(
  handler: SceneStudioInvalidationHandler,
): () => void {
  handlers.add(handler);

  return () => {
    handlers.delete(handler);
  };
}

export async function invalidateSceneStudio(
  invalidation: SceneStudioInvalidation,
): Promise<void> {
  if (invalidation.reason === "device-clear") {
    deviceInvalidationGeneration += 1;
  } else if (invalidation.scope) {
    const key = sceneStudioScopeKey(invalidation.scope);
    scopeInvalidationGenerations.set(
      key,
      (scopeInvalidationGenerations.get(key) ?? 0) + 1,
    );
  } else if (invalidation.ownerId) {
    ownerInvalidationGenerations.set(
      invalidation.ownerId,
      (ownerInvalidationGenerations.get(invalidation.ownerId) ?? 0) + 1,
    );
  }

  await Promise.allSettled(
    Array.from(handlers).map(
      async (handler) => handler(invalidation),
    ),
  );
}

export function sceneStudioInvalidationAppliesToScope(
  invalidation: SceneStudioInvalidation,
  scope: SceneStudioScope,
): boolean {
  if (invalidation.reason === "device-clear") {
    return true;
  }

  if (invalidation.scope) {
    return (
      invalidation.scope.userId === scope.userId &&
      invalidation.scope.accountEpoch === scope.accountEpoch &&
      invalidation.scope.sessionGeneration === scope.sessionGeneration
    );
  }

  return invalidation.ownerId === scope.userId;
}
