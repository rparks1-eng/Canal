import fs from "node:fs";
import path from "node:path";

import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  saveSceneToCloudForScope,
} from "../lib/scene-cloud";

import {
  readScenes,
  upsertSceneForScope,
  writeScenes,
} from "../lib/scenes";
import type {
  StoredScene,
} from "../lib/scenes";
import type {
  SceneStudioScope,
} from "../lib/scene-studio-scope";

jest.mock("../lib/scene-cloud", () => ({
  saveSceneToCloudForScope: jest.fn(),
}));

const mockSaveSceneToCloudForScope =
  saveSceneToCloudForScope as jest.MockedFunction<
    typeof saveSceneToCloudForScope
  >;

const scopeA = {
  userId: "account-a",
  accountEpoch: 1,
  sessionGeneration: "session-a",
} as const;
const scopeB = {
  userId: "account-b",
  accountEpoch: 2,
  sessionGeneration: "session-b",
} as const;
const scopeA2 = {
  userId: "account-a",
  accountEpoch: 3,
  sessionGeneration: "session-a2",
} as const;

function scene(id: string, name: string): StoredScene {
  return {
    id,
    name,
    activity: "focus",
    duration: "30 minutes",
    emotions: "calm",
    genres: "ambient",
    energy: "low",
    familiarity: "balanced",
    artists: "",
    songRequest: "",
    avoid: "",
    collaborators: [],
    tracks: [],
    visibility: "private",
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z",
    libraryType: "created",
  };
}

function deferred<Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
} {
  let resolve = (_value: Value): void => undefined;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function waitForCloudSave(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (mockSaveSceneToCloudForScope.mock.calls.length > 0) return;
    await Promise.resolve();
  }
  throw new Error("Scoped cloud save did not start.");
}

describe("account-safe Scene saves", () => {
  beforeEach(() => {
    mockStorage.clear();
    mockSaveSceneToCloudForScope.mockReset();
  });

  it.each([
    ["A to B", scopeB],
    ["A to A with a new session", scopeA2],
  ])("keeps a committed cloud save owned by A but leaves local cache untouched after %s", async (_label, nextScope) => {
    const original = scene("existing", "Existing Scene");
    await writeScenes([original]);
    let activeScope: SceneStudioScope = scopeA;
    const cloud = deferred<StoredScene>();
    mockSaveSceneToCloudForScope.mockImplementationOnce(async () => cloud.promise);

    const saving = upsertSceneForScope(
      scene("new-scene", "New Scene"),
      scopeA,
      () => activeScope,
    );
    await waitForCloudSave();
    activeScope = nextScope;
    cloud.resolve(scene("new-scene", "New Scene"));

    await expect(saving).resolves.toMatchObject({ id: "new-scene" });
    expect((await readScenes()).map(({ id }) => id)).toEqual([original.id]);
    expect(mockSaveSceneToCloudForScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-scene" }),
      scopeA,
      expect.any(Function),
    );
  });

  it("preserves an unrelated concurrent local mutation when scope changes during cloud save", async () => {
    const original = scene("existing", "Existing Scene");
    const unrelated = scene("unrelated", "Unrelated Scene");
    await writeScenes([original]);
    let activeScope: SceneStudioScope = scopeA;
    const cloud = deferred<StoredScene>();
    mockSaveSceneToCloudForScope.mockImplementationOnce(async () => cloud.promise);

    const saving = upsertSceneForScope(
      scene("new-scene", "New Scene"),
      scopeA,
      () => activeScope,
    );
    await waitForCloudSave();
    await writeScenes([original, unrelated]);
    activeScope = scopeB;
    cloud.resolve(scene("new-scene", "New Scene"));

    await expect(saving).resolves.toMatchObject({ id: "new-scene" });
    expect(new Set((await readScenes()).map(({ id }) => id))).toEqual(
      new Set(["existing", "unrelated"]),
    );
  });

  it("does not mutate locally or call cloud when the scope is already stale", async () => {
    const original = scene("existing", "Existing Scene");
    await writeScenes([original]);

    await expect(
      upsertSceneForScope(
        scene("new-scene", "New Scene"),
        scopeA,
        () => scopeB,
      ),
    ).rejects.toThrow("active account changed");

    expect((await readScenes()).map(({ id }) => id)).toEqual([original.id]);
    expect(mockSaveSceneToCloudForScope).not.toHaveBeenCalled();
  });

  it("commits local and cloud state only while the exact scope remains current", async () => {
    mockSaveSceneToCloudForScope.mockResolvedValueOnce(
      scene("new-scene", "New Scene"),
    );
    const saved = await upsertSceneForScope(
      scene("new-scene", "New Scene"),
      scopeA,
      () => scopeA,
    );

    expect(saved.id).toBe("new-scene");
    expect((await readScenes()).map(({ id }) => id)).toEqual(["new-scene"]);
    expect(mockSaveSceneToCloudForScope).toHaveBeenCalledTimes(1);
  });

  it("restores the previous Scene when the scoped cloud mutation fails", async () => {
    const original = scene("same-scene", "Original");
    await writeScenes([original]);
    mockSaveSceneToCloudForScope.mockRejectedValueOnce(
      new Error("cloud unavailable"),
    );

    await expect(
      upsertSceneForScope(
        scene("same-scene", "Replacement"),
        scopeA,
        () => scopeA,
      ),
    ).rejects.toThrow("cloud unavailable");

    expect((await readScenes())[0]).toMatchObject({
      id: "same-scene",
      name: "Original",
    });
  });

  it("uses a live auth scope for favorite feedback instead of a render closure", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../app/scenes/[sceneId].tsx"),
      "utf8",
    );
    expect(source).toContain("currentAuthScopeRef.current = authScope");
    expect(source).toContain("const feedbackScope = currentAuthScope();");
    expect(source).toContain("currentScope: currentAuthScope");
    expect(source).not.toContain(
      "currentScope: () => captureSceneStudioScope",
    );
  });

  it("pins cloud writes to the captured owner and exact live scope", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../lib/scene-cloud.ts"),
      "utf8",
    );
    expect(source).toContain("session?.user.id !== scope.userId");
    expect(source).toContain("user_id: scope.userId");
    expect(source).toContain('"update_collaborative_scene"');
    expect(source).toContain("expected_revision_value: expectedRevision");
    expect(source).toContain("A successful owner-pinned upsert is the commit point");
    expect(source.match(/sameSceneStudioScope\(scope, currentScope\(\)\)/gu)).toHaveLength(2);
  });
});
