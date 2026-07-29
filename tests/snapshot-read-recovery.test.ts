import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  deleteCloudSnapshot,
  getSnapshotSessionUserId,
  listOwnCloudSnapshots,
  readCloudSnapshot,
} from "../lib/snapshot-cloud";
import {
  deleteSnapshotWithStatus,
  readSnapshotsWithStatus,
  readSnapshotWithStatus,
} from "../lib/snapshots";
import type {
  Snapshot,
} from "../lib/snapshots";
import {
  mockStorage,
} from "./helpers/async-storage-mock";

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      true,
  }),
);

jest.mock(
  "../lib/snapshot-cloud",
  () => ({
    deleteCloudSnapshot:
      jest.fn(),

    getSnapshotSessionUserId:
      jest.fn(
        async () =>
          mockActiveUserId,
      ),

    listOwnCloudSnapshots:
      jest.fn(
        async () => ({
          userId:
            "user-a",
          snapshots: [],
        }),
      ),

    readCloudSnapshot:
      jest.fn(),

    upsertCloudSnapshot:
      jest.fn(),
  }),
);

let mockActiveUserId =
  "user-a";

const mockDeleteCloudSnapshot =
  jest.mocked(
    deleteCloudSnapshot,
  );

const mockGetSnapshotSessionUserId =
  jest.mocked(
    getSnapshotSessionUserId,
  );

const mockListOwnCloudSnapshots =
  jest.mocked(
    listOwnCloudSnapshots,
  );

const mockReadCloudSnapshot =
  jest.mocked(
    readCloudSnapshot,
  );

function deferred<Result>() {
  let resolve:
    (value: Result) => void =
    () => undefined;

  const promise =
    new Promise<Result>(
      (nextResolve) => {
        resolve =
          nextResolve;
      },
    );

  return {
    promise,
    resolve,
  };
}

function snapshotFixture(
  ownerId: string,
  id = "shared-snapshot",
): Snapshot {
  const timestamp =
    "2026-07-28T12:00:00.000Z";

  return {
    id,
    sceneId:
      `scene-${ownerId}`,
    sceneName:
      `${ownerId} Scene`,
    positionMs: 0,
    note:
      `${ownerId} private note`,
    createdAt:
      timestamp,
    updatedAt:
      timestamp,
    visibility:
      "private",
    ownerId,
    isMine:
      true,
    pendingCloudSync:
      false,
  };
}

describe(
  "Snapshot detail recovery status",
  () => {
    beforeEach(() => {
      mockStorage.clear();

      mockActiveUserId =
        "user-a";

      mockDeleteCloudSnapshot.mockReset();

      mockGetSnapshotSessionUserId.mockReset();
      mockGetSnapshotSessionUserId.mockImplementation(
        async () =>
          mockActiveUserId,
      );

      mockListOwnCloudSnapshots.mockReset();
      mockListOwnCloudSnapshots.mockImplementation(
        async (
          expectedUserId,
        ) => ({
          userId:
            expectedUserId,
          snapshots: [],
        }),
      );

      mockReadCloudSnapshot.mockReset();
    });

    it(
      "returns a clean missing result when the cloud confirms no Snapshot exists",
      async () => {
        mockReadCloudSnapshot.mockResolvedValueOnce(
          null,
        );

        const result =
          await readSnapshotWithStatus(
            "missing-snapshot",
          );

        expect(
          result,
        ).toEqual({
          value: null,
          cloudStatus:
            "synced",
        });
      },
    );

    it(
      "returns a warning when a remote failure prevents confirming that the Snapshot is missing",
      async () => {
        mockReadCloudSnapshot.mockRejectedValueOnce(
          new Error(
            "Failed to fetch",
          ),
        );

        const result =
          await readSnapshotWithStatus(
            "shared-snapshot",
          );

        expect(
          result.value,
        ).toBeNull();

        expect(
          result.cloudStatus,
        ).toBe(
          "local-only",
        );

        expect(
          result.warning,
        ).toContain(
          "Failed to fetch",
        );
      },
    );

    it(
      "does not reveal an account A cloud Snapshot after switching to account B during the read",
      async () => {
        const cloudRead =
          deferred<Snapshot | null>();

        let markReadStarted:
          () => void =
          () => undefined;

        const readStarted =
          new Promise<void>(
            (resolve) => {
              markReadStarted =
                resolve;
            },
          );

        mockReadCloudSnapshot.mockImplementationOnce(
          async () => {
            markReadStarted();

            return cloudRead.promise;
          },
        );

        const pendingRead =
          readSnapshotWithStatus(
            "shared-snapshot",
          );

        await readStarted;

        mockActiveUserId =
          "user-b";

        cloudRead.resolve(
          snapshotFixture(
            "user-a",
          ),
        );

        const result =
          await pendingRead;

        expect(
          result.value,
        ).toBeNull();

        expect(
          result.cloudStatus,
        ).toBe(
          "local-only",
        );

        expect(
          result.warning,
        ).toContain(
          "active account changed",
        );

        expect(
          mockReadCloudSnapshot,
        ).toHaveBeenCalledWith(
          "shared-snapshot",
          "user-a",
        );
      },
    );

    it(
      "does not return account A's local Snapshots after a deferred list resolves for account B",
      async () => {
        mockStorage.set(
          "@canal/snapshots:user:user-a",
          JSON.stringify([
            snapshotFixture(
              "user-a",
              "snapshot-a",
            ),
          ]),
        );

        const cloudList =
          deferred<{
            userId: string;
            snapshots: Snapshot[];
          }>();

        let markListStarted:
          () => void =
          () => undefined;

        const listStarted =
          new Promise<void>(
            (resolve) => {
              markListStarted =
                resolve;
            },
          );

        mockListOwnCloudSnapshots.mockImplementationOnce(
          async () => {
            markListStarted();

            return cloudList.promise;
          },
        );

        const pendingRead =
          readSnapshotsWithStatus();

        await listStarted;

        mockActiveUserId =
          "user-b";

        cloudList.resolve({
          userId:
            "user-a",
          snapshots: [
            snapshotFixture(
              "user-a",
              "snapshot-a",
            ),
          ],
        });

        const result =
          await pendingRead;

        expect(
          result.value,
        ).toEqual(
          [],
        );

        expect(
          result.cloudStatus,
        ).toBe(
          "local-only",
        );

        expect(
          result.warning,
        ).toContain(
          "active account changed",
        );

        expect(
          mockListOwnCloudSnapshots,
        ).toHaveBeenCalledWith(
          "user-a",
        );
      },
    );

    it(
      "keeps account A's pending deletion and never targets account B's same-ID Snapshot",
      async () => {
        const snapshotId =
          "same-snapshot-id";

        const accountASnapshot =
          snapshotFixture(
            "user-a",
            snapshotId,
          );

        const accountBSnapshot =
          snapshotFixture(
            "user-b",
            snapshotId,
          );

        mockStorage.set(
          "@canal/snapshots:user:user-a",
          JSON.stringify([
            accountASnapshot,
          ]),
        );

        mockStorage.set(
          "@canal/snapshots:user:user-b",
          JSON.stringify([
            accountBSnapshot,
          ]),
        );

        const cloudDelete =
          deferred<void>();

        let markDeleteStarted:
          () => void =
          () => undefined;

        const deleteStarted =
          new Promise<void>(
            (resolve) => {
              markDeleteStarted =
                resolve;
            },
          );

        mockDeleteCloudSnapshot.mockImplementationOnce(
          async () => {
            markDeleteStarted();

            return cloudDelete.promise;
          },
        );

        const pendingDelete =
          deleteSnapshotWithStatus(
            snapshotId,
          );

        await deleteStarted;

        mockActiveUserId =
          "user-b";

        cloudDelete.resolve(
          undefined,
        );

        const result =
          await pendingDelete;

        expect(
          result.cloudStatus,
        ).toBe(
          "local-only",
        );

        expect(
          result.warning,
        ).toContain(
          "Snapshot account changed",
        );

        expect(
          mockDeleteCloudSnapshot,
        ).toHaveBeenCalledWith(
          snapshotId,
          "user-a",
        );

        expect(
          JSON.parse(
            mockStorage.get(
              "@canal/snapshots:user:user-b",
            ) ?? "[]",
          ),
        ).toEqual([
          accountBSnapshot,
        ]);

        expect(
          JSON.parse(
            mockStorage.get(
              "@canal/snapshot-deletions:user:user-a",
            ) ?? "[]",
          ),
        ).toEqual([
          snapshotId,
        ]);
      },
    );
  },
);
