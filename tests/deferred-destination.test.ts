import {
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  consumeDeferredDestination,
  rememberDeferredDestination,
  restoreDeferredDestination,
} from "../lib/deferred-destination";

const SCENE = "/scenes/550e8400-e29b-41d4-a716-446655440000" as const;
const SNAPSHOT = "/snapshots/a987fbc9-4bed-4078-8f07-9141ba07c9f3" as const;

describe("deferred public destination", () => {
  afterEach(() => {
    mockStorage.clear();
  });

  it("persists across reload boundaries and consumes exactly once", async () => {
    await expect(rememberDeferredDestination(SCENE)).resolves.toBe(true);
    expect(mockStorage.size).toBe(1);
    await expect(consumeDeferredDestination()).resolves.toBe(SCENE);
    await expect(consumeDeferredDestination()).resolves.toBeNull();
  });

  it("does not erase a valid intent when an unsafe value is presented", async () => {
    await rememberDeferredDestination(SCENE);
    await expect(rememberDeferredDestination("https://evil.example/settings"))
      .resolves.toBe(false);
    await expect(consumeDeferredDestination()).resolves.toBe(SCENE);
  });

  it("can restore a claimed destination after an account-switch race", async () => {
    await rememberDeferredDestination(SNAPSHOT);
    const claimed = await consumeDeferredDestination();
    expect(claimed).toBe(SNAPSHOT);
    await restoreDeferredDestination(claimed!);
    await expect(consumeDeferredDestination()).resolves.toBe(SNAPSHOT);
  });
});
