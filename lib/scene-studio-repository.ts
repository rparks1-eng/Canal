import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  GeneratedSceneResult,
  SceneStudioDraft,
} from "./scene-studio";

import {
  sceneStudioScopeCanCommit,
  sceneStudioScopeKey,
} from "./scene-studio-scope";

import type {
  SceneStudioScope,
  SceneStudioScopeGuard,
} from "./scene-studio-scope";

export const SCENE_STUDIO_SCOPED_STORAGE_PREFIX =
  "@canal/scene-studio/v1";

const SCENE_STUDIO_ENVELOPE_VERSION =
  1;

type SceneStudioEnvelopeKind =
  | "draft"
  | "preview";

type SceneStudioEnvelope<Value> = {
  version: 1;
  kind: SceneStudioEnvelopeKind;
  scope: SceneStudioScope;
  revision: number;
  value: Value;
};

export type SceneStudioStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
  multiRemove?(keys: readonly string[]): Promise<void>;
};

export type SceneStudioReadResult<Value> =
  | {
      kind: "ready";
      value: Value;
      revision: number;
    }
  | {
      kind: "missing" | "corrupt" | "stale";
    };

export type SceneStudioWriteResult =
  | {
      kind: "committed";
      revision: number;
    }
  | {
      kind: "conflict" | "stale";
    };

export type SceneStudioRepositoryOperation = {
  scope: SceneStudioScope;
  currentScope: () => SceneStudioScope | null;
  operationGuard?: SceneStudioScopeGuard;
};

function storageKey(
  kind: SceneStudioEnvelopeKind,
  scope: SceneStudioScope,
): string {
  return `${SCENE_STUDIO_SCOPED_STORAGE_PREFIX}/${kind}/${sceneStudioScopeKey(
    scope,
  )}`;
}

export function getSceneStudioDraftStorageKey(
  scope: SceneStudioScope,
): string {
  return storageKey("draft", scope);
}

export function getSceneStudioPreviewStorageKey(
  scope: SceneStudioScope,
): string {
  return storageKey("preview", scope);
}

function canCommit(
  operation: SceneStudioRepositoryOperation,
): boolean {
  return sceneStudioScopeCanCommit(
    operation.scope,
    operation.currentScope,
    operation.operationGuard,
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function decodeEnvelope<Value>(
  serialized: string,
  kind: SceneStudioEnvelopeKind,
  scope: SceneStudioScope,
): SceneStudioEnvelope<Value> | null {
  try {
    const parsed = JSON.parse(serialized) as unknown;

    if (
      !isRecord(parsed) ||
      parsed.version !== SCENE_STUDIO_ENVELOPE_VERSION ||
      parsed.kind !== kind ||
      !isRecord(parsed.scope) ||
      parsed.scope.userId !== scope.userId ||
      parsed.scope.accountEpoch !== scope.accountEpoch ||
      parsed.scope.sessionGeneration !== scope.sessionGeneration ||
      !Number.isSafeInteger(parsed.revision) ||
      (parsed.revision as number) < 1 ||
      !("value" in parsed)
    ) {
      return null;
    }

    return parsed as SceneStudioEnvelope<Value>;
  } catch {
    return null;
  }
}

export class SceneStudioRepository {
  private readonly operationTails = new Map<
    string,
    Promise<void>
  >();

  constructor(
    private readonly storage: SceneStudioStorage = AsyncStorage,
  ) {}

  async readDraft(
    operation: SceneStudioRepositoryOperation,
  ): Promise<SceneStudioReadResult<SceneStudioDraft>> {
    return this.read<SceneStudioDraft>(
      "draft",
      operation,
    );
  }

  async readPreview(
    operation: SceneStudioRepositoryOperation,
  ): Promise<SceneStudioReadResult<GeneratedSceneResult>> {
    return this.read<GeneratedSceneResult>(
      "preview",
      operation,
    );
  }

  async saveDraft(
    operation: SceneStudioRepositoryOperation & {
      draft: SceneStudioDraft;
      expectedRevision?: number;
    },
  ): Promise<SceneStudioWriteResult> {
    return this.write(
      "draft",
      operation,
      operation.draft,
      operation.expectedRevision,
    );
  }

  async savePreview(
    operation: SceneStudioRepositoryOperation & {
      preview: GeneratedSceneResult;
      expectedRevision?: number;
    },
  ): Promise<SceneStudioWriteResult> {
    return this.write(
      "preview",
      operation,
      operation.preview,
      operation.expectedRevision,
    );
  }

  async clearScope(
    operation: SceneStudioRepositoryOperation,
  ): Promise<"cleared" | "stale"> {
    if (!canCommit(operation)) {
      return "stale";
    }

    const keys = [
      getSceneStudioDraftStorageKey(operation.scope),
      getSceneStudioPreviewStorageKey(operation.scope),
    ];

    for (const key of keys) {
      if (!canCommit(operation)) {
        return "stale";
      }

      await this.storage.removeItem(key);

      if (!canCommit(operation)) {
        return "stale";
      }
    }

    return "cleared";
  }

  async clearOwner(
    ownerId: string,
  ): Promise<void> {
    if (!this.storage.getAllKeys) {
      return;
    }

    const ownerPrefix = `${SCENE_STUDIO_SCOPED_STORAGE_PREFIX}/`;
    const encodedOwner = encodeURIComponent(ownerId);
    const keys = (await this.storage.getAllKeys()).filter(
      (key) =>
        key.startsWith(ownerPrefix) &&
        key.includes(`/${encodedOwner}:`),
    );

    if (keys.length === 0) {
      return;
    }

    if (this.storage.multiRemove) {
      await this.storage.multiRemove(keys);

      return;
    }

    await Promise.all(
      keys.map(
        async (key) => this.storage.removeItem(key),
      ),
    );
  }

  private async read<Value>(
    kind: SceneStudioEnvelopeKind,
    operation: SceneStudioRepositoryOperation,
  ): Promise<SceneStudioReadResult<Value>> {
    if (!canCommit(operation)) {
      return { kind: "stale" };
    }

    const serialized = await this.storage.getItem(
      storageKey(kind, operation.scope),
    );

    if (!canCommit(operation)) {
      return { kind: "stale" };
    }

    if (!serialized) {
      return { kind: "missing" };
    }

    const envelope = decodeEnvelope<Value>(
      serialized,
      kind,
      operation.scope,
    );

    if (!envelope) {
      return { kind: "corrupt" };
    }

    return {
      kind: "ready",
      value: envelope.value,
      revision: envelope.revision,
    };
  }

  private async write<Value>(
    kind: SceneStudioEnvelopeKind,
    operation: SceneStudioRepositoryOperation,
    value: Value,
    expectedRevision?: number,
  ): Promise<SceneStudioWriteResult> {
    const key = storageKey(kind, operation.scope);

    return this.runExclusive(
      key,
      async () => {
        if (!canCommit(operation)) {
          return { kind: "stale" };
        }

        const current = await this.storage.getItem(key);

        if (!canCommit(operation)) {
          return { kind: "stale" };
        }

        const existing = current
          ? decodeEnvelope<Value>(
              current,
              kind,
              operation.scope,
            )
          : null;
        const currentRevision = existing?.revision ?? 0;

        if (
          expectedRevision !== undefined &&
          currentRevision !== expectedRevision
        ) {
          return { kind: "conflict" };
        }

        const envelope: SceneStudioEnvelope<Value> = {
          version: SCENE_STUDIO_ENVELOPE_VERSION,
          kind,
          scope: operation.scope,
          revision: currentRevision + 1,
          value,
        };
        const serialized = JSON.stringify(envelope);

        await this.storage.setItem(key, serialized);

        if (canCommit(operation)) {
          return {
            kind: "committed",
            revision: envelope.revision,
          };
        }

        const persisted = await this.storage.getItem(key);

        if (persisted === serialized) {
          await this.storage.removeItem(key);
        }

        return { kind: "stale" };
      },
    );
  }

  private async runExclusive<Result>(
    key: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const previous =
      this.operationTails.get(key) ??
      Promise.resolve();
    let release: () => void = () => undefined;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    const next = previous.then(
      () => tail,
      () => tail,
    );

    this.operationTails.set(key, next);

    await previous;

    try {
      return await operation();
    } finally {
      release();

      if (this.operationTails.get(key) === next) {
        this.operationTails.delete(key);
      }
    }
  }
}

export function createSceneStudioRepository(
  storage?: SceneStudioStorage,
): SceneStudioRepository {
  return new SceneStudioRepository(storage);
}
