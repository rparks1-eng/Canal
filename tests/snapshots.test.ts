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

let mockActiveUserId:
  | string
  | null =
  null;

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      false,
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
      jest.fn(),

    readCloudSnapshot:
      jest.fn(),

    upsertCloudSnapshot:
      jest.fn(),
  }),
);

import {
  createSnapshotWithStatus,
  readSnapshots,
  updateSnapshotWithStatus,
} from "../lib/snapshots";

describe(
  "Snapshot local cache",
  () => {
    beforeEach(() => {
      mockActiveUserId =
        null;

      mockStorage.clear();
    });

    it(
      "normalizes a locally saved Snapshot",
      async () => {
        mockActiveUserId =
          "user-a";

        const result =
          await createSnapshotWithStatus({
            sceneId:
              " scene-1 ",
            sceneName:
              " Focus ",
            positionMs:
              -25,
            note:
              "  keep going  ",
            visibility:
              "public",
          });

        expect(
          result.cloudStatus,
        ).toBe(
          "local-only",
        );

        expect(
          result.value,
        ).toMatchObject({
          sceneId:
            "scene-1",
          sceneName:
            "Focus",
          positionMs: 0,
          note:
            "keep going",
          visibility:
            "public",
          ownerId:
            "user-a",
          isMine:
            true,
          pendingCloudSync:
            true,
        });
      },
    );

    it(
      "keeps cached Snapshots isolated between Canal accounts",
      async () => {
        mockActiveUserId =
          "user-a";

        await createSnapshotWithStatus({
          sceneId:
            "scene-a",
          sceneName:
            "Account A",
        });

        mockActiveUserId =
          "user-b";

        await expect(
          readSnapshots(),
        ).resolves.toEqual(
          [],
        );

        await createSnapshotWithStatus({
          sceneId:
            "scene-b",
          sceneName:
            "Account B",
        });

        mockActiveUserId =
          "user-a";

        const accountASnapshots =
          await readSnapshots();

        expect(
          accountASnapshots,
        ).toHaveLength(
          1,
        );

        expect(
          accountASnapshots[0],
        ).toMatchObject({
          sceneId:
            "scene-a",
          ownerId:
            "user-a",
        });
      },
    );

    it(
      "preserves fields that are not part of a Snapshot edit",
      async () => {
        mockActiveUserId =
          "user-a";

        const created =
          await createSnapshotWithStatus({
            sceneId:
              "scene-1",
            sceneName:
              "Original",
            mood:
              "calm",
          });

        const updated =
          await updateSnapshotWithStatus(
            created.value.id,
            {
              note:
                "Revised",
            },
          );

        expect(
          updated.value,
        ).toMatchObject({
          sceneName:
            "Original",
          mood:
            "calm",
          note:
            "Revised",
        });
      },
    );
  },
);
