import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  DEFAULT_SCENE_STUDIO_DRAFT,
} from "../lib/scene-studio";

import {
  createSceneStudioRepository,
  getSceneStudioDraftStorageKey,
} from "../lib/scene-studio-repository";

import type {
  SceneStudioStorage,
} from "../lib/scene-studio-repository";

import {
  captureSceneStudioScope,
} from "../lib/scene-studio-scope";

import {
  captureSceneStudioInvalidationGeneration,
  invalidateSceneStudio,
  sceneStudioInvalidationGenerationIsCurrent,
} from "../lib/scene-studio-lifecycle";

function memoryStorage(): SceneStudioStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();

  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    async getAllKeys() {
      return Array.from(values.keys());
    },
    async multiRemove(keys) {
      for (const key of keys) {
        values.delete(key);
      }
    },
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve,
  };
}

function scope(
  accountEpoch: number,
) {
  return captureSceneStudioScope({
    userId: "user-a",
    accountEpoch,
    sessionGeneration: `session-${accountEpoch}`,
  })!;
}

describe("Scene Studio scoped repository", () => {
  it("keeps B current and writable when a targeted account switch invalidates A", async () => {
    const storage = memoryStorage();
    const repository = createSceneStudioRepository(storage);
    const a = scope(1);
    const b = captureSceneStudioScope({
      userId: "user-b",
      accountEpoch: 2,
      sessionGeneration: "session-b2",
    })!;
    const aGeneration =
      captureSceneStudioInvalidationGeneration(a);
    const bGeneration =
      captureSceneStudioInvalidationGeneration(b);

    await invalidateSceneStudio({
      reason: "account-switch",
      scope: a,
    });

    expect(
      sceneStudioInvalidationGenerationIsCurrent(aGeneration, a),
    ).toBe(false);
    await expect(
      repository.saveDraft({
        scope: b,
        currentScope: () => b,
        operationGuard: () =>
          sceneStudioInvalidationGenerationIsCurrent(
            bGeneration,
            b,
          ),
        draft: {
          ...DEFAULT_SCENE_STUDIO_DRAFT,
          name: "B remains current",
        },
      }),
    ).resolves.toEqual({
      kind: "committed",
      revision: 1,
    });
    expect(
      storage.values.has(getSceneStudioDraftStorageKey(b)),
    ).toBe(true);
  });

  it("never reads the old global draft key or another account generation's envelope", async () => {
    const storage = memoryStorage();
    const repository = createSceneStudioRepository(storage);
    const a1 = scope(1);
    const a2 = scope(2);

    storage.values.set(
      "@canal/scene-studio-draft",
      JSON.stringify({ name: "legacy private draft" }),
    );

    await repository.saveDraft({
      scope: a1,
      currentScope: () => a1,
      draft: {
        ...DEFAULT_SCENE_STUDIO_DRAFT,
        name: "A1 scoped draft",
      },
    });

    await expect(
      repository.readDraft({
        scope: a2,
        currentScope: () => a2,
      }),
    ).resolves.toEqual({ kind: "missing" });
    expect(
      storage.values.get(
        getSceneStudioDraftStorageKey(a1),
      ),
    ).toContain("A1 scoped draft");
  });

  it("uses revision CAS and never replaces a newer scoped draft", async () => {
    const storage = memoryStorage();
    const repository = createSceneStudioRepository(storage);
    const a1 = scope(1);

    const first = await repository.saveDraft({
      scope: a1,
      currentScope: () => a1,
      draft: {
        ...DEFAULT_SCENE_STUDIO_DRAFT,
        name: "first",
      },
    });

    expect(first).toEqual({
      kind: "committed",
      revision: 1,
    });

    await expect(
      repository.saveDraft({
        scope: a1,
        currentScope: () => a1,
        expectedRevision: 0,
        draft: {
          ...DEFAULT_SCENE_STUDIO_DRAFT,
          name: "stale write",
        },
      }),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("quarantines a deferred A1 read after A to B to A2 changes scope", async () => {
    const delayedRead = deferred<string | null>();
    const storage: SceneStudioStorage = {
      getItem: async () => delayedRead.promise,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    const repository = createSceneStudioRepository(storage);
    const a1 = scope(1);
    const b = captureSceneStudioScope({
      userId: "user-b",
      accountEpoch: 2,
      sessionGeneration: "session-b1",
    })!;
    const a2 = scope(3);
    let current = a1;
    const pending = repository.readDraft({
      scope: a1,
      currentScope: () => current,
    });

    current = b;
    current = a2;
    delayedRead.resolve(
      JSON.stringify({
        version: 1,
        kind: "draft",
        scope: a1,
        revision: 1,
        value: {
          ...DEFAULT_SCENE_STUDIO_DRAFT,
          name: "A1 private draft",
        },
      }),
    );

    await expect(pending).resolves.toEqual({ kind: "stale" });
  });

  it("does not recreate a draft when device clear revokes a deferred autosave", async () => {
    const delayedRead = deferred<string | null>();
    const writes: string[] = [];
    const storage: SceneStudioStorage = {
      getItem: async () => delayedRead.promise,
      setItem: async (_key, value) => {
        writes.push(value);
      },
      removeItem: async () => undefined,
    };
    const repository = createSceneStudioRepository(storage);
    const a1 = scope(1);
    const operationGeneration =
      captureSceneStudioInvalidationGeneration(a1);

    const pending = repository.saveDraft({
      scope: a1,
      currentScope: () => a1,
      operationGuard: () =>
        sceneStudioInvalidationGenerationIsCurrent(
          operationGeneration,
          a1,
        ),
      draft: {
        ...DEFAULT_SCENE_STUDIO_DRAFT,
        name: "must not be recreated",
      },
    });

    await invalidateSceneStudio({
      reason: "device-clear",
    });
    delayedRead.resolve(null);

    await expect(pending).resolves.toEqual({ kind: "stale" });
    expect(writes).toEqual([]);
  });

  it("conditionally removes a stale write that resumes after device storage deletion", async () => {
    const writeStarted = deferred<void>();
    const releaseWrite = deferred<void>();
    const values = new Map<string, string>();
    const storage: SceneStudioStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        writeStarted.resolve();
        await releaseWrite.promise;
        values.set(key, value);
      },
      removeItem: async (key) => {
        values.delete(key);
      },
    };
    const repository = createSceneStudioRepository(storage);
    const a1 = scope(1);
    const key = getSceneStudioDraftStorageKey(a1);
    const operationGeneration =
      captureSceneStudioInvalidationGeneration(a1);
    const pending = repository.saveDraft({
      scope: a1,
      currentScope: () => a1,
      operationGuard: () =>
        sceneStudioInvalidationGenerationIsCurrent(
          operationGeneration,
          a1,
        ),
      draft: {
        ...DEFAULT_SCENE_STUDIO_DRAFT,
        name: "stale write after clear",
      },
    });

    await writeStarted.promise;
    await invalidateSceneStudio({
      reason: "device-clear",
    });
    values.delete(key);
    releaseWrite.resolve();

    await expect(pending).resolves.toEqual({ kind: "stale" });
    expect(values.has(key)).toBe(false);
  });
});
