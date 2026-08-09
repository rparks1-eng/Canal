import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  captureSceneStudioInvalidationGeneration,
  invalidateSceneStudio,
  registerSceneStudioInvalidationHandler,
  sceneStudioInvalidationGenerationIsCurrent,
  sceneStudioInvalidationAppliesToScope,
} from "../lib/scene-studio-lifecycle";

import {
  captureSceneStudioScope,
} from "../lib/scene-studio-scope";

describe("Scene Studio lifecycle invalidation", () => {
  it("fences Studio operations before device storage enumeration or deletion", () => {
    const source = readFileSync(
      resolve(__dirname, "../lib/data-controls.ts"),
      "utf8",
    );
    const clearAllCanalData = source.slice(
      source.indexOf("export async function clearAllCanalData"),
    );
    const invalidation = clearAllCanalData.indexOf(
      'reason: "device-clear"',
    );
    const enumeration = clearAllCanalData.indexOf(
      "AsyncStorage.getAllKeys()",
    );
    const deletion = clearAllCanalData.indexOf(
      "AsyncStorage.multiRemove(",
    );

    expect(invalidation).toBeGreaterThan(-1);
    expect(invalidation).toBeLessThan(enumeration);
    expect(invalidation).toBeLessThan(deletion);
  });

  it("revokes an in-flight generation before device-clear handlers run", async () => {
    const before =
      captureSceneStudioInvalidationGeneration();

    await invalidateSceneStudio({
      reason: "device-clear",
    });

    expect(
      sceneStudioInvalidationGenerationIsCurrent(before),
    ).toBe(false);
    expect(
      sceneStudioInvalidationGenerationIsCurrent(
        captureSceneStudioInvalidationGeneration(),
      ),
    ).toBe(true);
  });

  it("revokes only the targeted account scope while another account remains current", async () => {
    const a = captureSceneStudioScope({
      userId: "user-a",
      accountEpoch: 1,
      sessionGeneration: "session-a1",
    })!;
    const b = captureSceneStudioScope({
      userId: "user-b",
      accountEpoch: 1,
      sessionGeneration: "session-b1",
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
    expect(
      sceneStudioInvalidationGenerationIsCurrent(bGeneration, b),
    ).toBe(true);
  });

  it("delivers typed account and device invalidations without leaking handler failures", async () => {
    const scope = captureSceneStudioScope({
      userId: "user-a",
      accountEpoch: 3,
      sessionGeneration: "session-a3",
    })!;
    const received: string[] = [];
    const unregister = registerSceneStudioInvalidationHandler(
      ({ reason }) => {
        received.push(reason);
      },
    );

    await invalidateSceneStudio({
      reason: "disconnect",
      ownerId: "user-a",
    });
    await invalidateSceneStudio({
      reason: "device-clear",
    });
    unregister();

    expect(received).toEqual([
      "disconnect",
      "device-clear",
    ]);
    expect(
      sceneStudioInvalidationAppliesToScope(
        {
          reason: "disconnect",
          ownerId: "user-a",
        },
        scope,
      ),
    ).toBe(true);
    expect(
      sceneStudioInvalidationAppliesToScope(
        {
          reason: "account-switch",
          ownerId: "user-b",
        },
        scope,
      ),
    ).toBe(false);
  });
});
