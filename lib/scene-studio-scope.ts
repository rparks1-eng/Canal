export type SceneStudioScope = Readonly<{
  userId: string;
  accountEpoch: number;
  sessionGeneration: string;
}>;

export type SceneStudioScopeInput = {
  userId: string | null | undefined;
  accountEpoch: number;
  sessionGeneration: string | null | undefined;
};

export type SceneStudioScopeGuard = () => boolean;

export function captureSceneStudioScope(
  input: SceneStudioScopeInput,
): SceneStudioScope | null {
  const userId = input.userId?.trim();
  const sessionGeneration =
    input.sessionGeneration?.trim();

  if (
    !userId ||
    !sessionGeneration ||
    !Number.isSafeInteger(input.accountEpoch) ||
    input.accountEpoch < 0
  ) {
    return null;
  }

  return Object.freeze({
    userId,
    accountEpoch: input.accountEpoch,
    sessionGeneration,
  });
}

export function sameSceneStudioScope(
  left: SceneStudioScope | null | undefined,
  right: SceneStudioScope | null | undefined,
): boolean {
  return Boolean(
    left &&
      right &&
      left.userId === right.userId &&
      left.accountEpoch === right.accountEpoch &&
      left.sessionGeneration === right.sessionGeneration,
  );
}

export function sceneStudioScopeKey(
  scope: SceneStudioScope,
): string {
  return [
    encodeURIComponent(scope.userId),
    String(scope.accountEpoch),
    encodeURIComponent(scope.sessionGeneration),
  ].join(":");
}

export function sceneStudioScopeCanCommit(
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
  operationGuard?: SceneStudioScopeGuard,
): boolean {
  return (
    sameSceneStudioScope(scope, currentScope()) &&
    (operationGuard?.() ?? true)
  );
}

/**
 * A previously loaded scope is never renderable after an account/session
 * transition, even while the next scoped read is still pending.
 */
export function sceneStudioScopeIsVisible(
  loadedScope: SceneStudioScope | null | undefined,
  currentScope: SceneStudioScope | null | undefined,
): boolean {
  return sameSceneStudioScope(
    loadedScope,
    currentScope,
  );
}
