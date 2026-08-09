import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  captureSceneStudioScope,
  sameSceneStudioScope,
  sceneStudioScopeCanCommit,
  sceneStudioScopeIsVisible,
  sceneStudioScopeKey,
} from "../lib/scene-studio-scope";

describe("Scene Studio scope", () => {
  it("captures a durable user, account-epoch, and session-generation tuple", () => {
    const scope = captureSceneStudioScope({
      userId: "user-a",
      accountEpoch: 4,
      sessionGeneration: "session-a2",
    });

    expect(scope).toEqual({
      userId: "user-a",
      accountEpoch: 4,
      sessionGeneration: "session-a2",
    });
    expect(sceneStudioScopeKey(scope!)).toContain("user-a");
    expect(sceneStudioScopeKey(scope!)).toContain("session-a2");
  });

  it("rejects missing or volatile scope fields", () => {
    expect(
      captureSceneStudioScope({
        userId: "user-a",
        accountEpoch: -1,
        sessionGeneration: "session-a1",
      }),
    ).toBeNull();
    expect(
      captureSceneStudioScope({
        userId: "user-a",
        accountEpoch: 1,
        sessionGeneration: null,
      }),
    ).toBeNull();
  });

  it("treats a same-user A1 to A2 session as a different authority", () => {
    const a1 = captureSceneStudioScope({
      userId: "user-a",
      accountEpoch: 1,
      sessionGeneration: "session-a1",
    });
    const a2 = captureSceneStudioScope({
      userId: "user-a",
      accountEpoch: 2,
      sessionGeneration: "session-a2",
    });

    expect(sameSceneStudioScope(a1, a2)).toBe(false);
    expect(
      sceneStudioScopeCanCommit(
        a1!,
        () => a2,
      ),
    ).toBe(false);
  });

  it("keeps A1 visible state hidden while deferred B and A2 scope reads settle", () => {
    const a1 = captureSceneStudioScope({
      userId: "user-a",
      accountEpoch: 1,
      sessionGeneration: "session-a1",
    });
    const b = captureSceneStudioScope({
      userId: "user-b",
      accountEpoch: 2,
      sessionGeneration: "session-b1",
    });
    const a2 = captureSceneStudioScope({
      userId: "user-a",
      accountEpoch: 3,
      sessionGeneration: "session-a2",
    });

    expect(
      sceneStudioScopeIsVisible(a1, b),
    ).toBe(false);
    expect(
      sceneStudioScopeIsVisible(a1, a2),
    ).toBe(false);
    expect(
      sceneStudioScopeIsVisible(a2, a2),
    ).toBe(true);
  });
});
