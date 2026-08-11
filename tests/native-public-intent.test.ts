import {
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  redirectSystemPath,
} from "../app/+native-intent";

import {
  consumeDeferredDestination,
} from "../lib/deferred-destination";

describe("native public intents", () => {
  afterEach(() => {
    mockStorage.clear();
  });

  it("hands an allowlisted HTTPS destination to the signed-out Login guard", async () => {
    const scene = "/scenes/550e8400-e29b-41d4-a716-446655440000";
    expect(redirectSystemPath({
      initial: true,
      path: `https://canal.app${scene}`,
    })).toBe(scene);
    await expect(consumeDeferredDestination()).resolves.toBeNull();
  });

  it("preserves existing custom-scheme authentication rewrites", async () => {
    expect(redirectSystemPath({
      initial: false,
      path: "canal://auth/callback?code=abc",
    })).toBe("/auth/callback?code=abc");
  });

  it("does not turn a hostile URL into a deferred redirect", async () => {
    const hostile = "https://evil.example/scenes/550e8400-e29b-41d4-a716-446655440000";
    expect(redirectSystemPath({ initial: true, path: hostile }))
      .toBe(hostile);
    await expect(consumeDeferredDestination()).resolves.toBeNull();
  });
});
