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
  syncSnapshotWithStatus,
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
            templateId:
              "00000000-0000-4000-8000-000000000001",
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
          templateId:
            "00000000-0000-4000-8000-000000000001",
        });

        await expect(
          readSnapshots(),
        ).resolves.toEqual([
          expect.objectContaining({
            templateId:
              "00000000-0000-4000-8000-000000000001",
            pendingCloudSync:
              true,
          }),
        ]);
      },
    );

    it(
      "keeps complete trusted template provenance and drops malformed legacy fields",
      async () => {
        mockActiveUserId =
          "user-a";

        mockStorage.set(
          "@canal/snapshots:user:user-a",
          JSON.stringify([
            {
              id:
                "snapshot-valid",
              sceneId:
                "scene-1",
              sceneName:
                "Valid brand",
              note:
                "",
              positionMs:
                0,
              visibility:
                "public",
              createdAt:
                "2026-07-29T00:00:00.000Z",
              updatedAt:
                "2026-07-29T00:00:00.000Z",
              ownerId:
                "user-a",
              templateId:
                "00000000-0000-4000-8000-000000000001",
              templateBrandLabel:
                "Ari FM",
              templateTheme:
                "paper",
            },
            {
              id:
                "snapshot-legacy",
              sceneId:
                "scene-2",
              sceneName:
                "Legacy",
              note:
                "",
              positionMs:
                0,
              visibility:
                "private",
              createdAt:
                "2026-07-28T00:00:00.000Z",
              updatedAt:
                "2026-07-28T00:00:00.000Z",
              ownerId:
                "user-a",
              templateId:
                "not-a-uuid",
              templateBrandLabel:
                "Untrusted",
              templateTheme:
                "custom-css",
            },
          ]),
        );

        const snapshots =
          await readSnapshots();

        expect(
          snapshots[0],
        ).toMatchObject({
          templateId:
            "00000000-0000-4000-8000-000000000001",
          templateBrandLabel:
            "Ari FM",
          templateTheme:
            "paper",
        });

        expect(
          snapshots[1],
        ).not.toHaveProperty(
          "templateId",
        );
        expect(
          snapshots[1],
        ).not.toHaveProperty(
          "templateBrandLabel",
        );
        expect(
          snapshots[1],
        ).not.toHaveProperty(
          "templateTheme",
        );
      },
    );

    it(
      "does not persist an untrusted Snapshot Spotify link",
      async () => {
        mockActiveUserId =
          "user-a";

        const result =
          await createSnapshotWithStatus({
            sceneId:
              "scene-1",
            sceneName:
              "Unsafe link",
            spotifyUrl:
              "https://example.com/phishing",
          });

        expect(
          result.value
            .spotifyUrl,
        ).toBeUndefined();
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

    it(
      "lets an unsynced Snapshot replace or clear a deleted template before retry",
      async () => {
        mockActiveUserId =
          "user-a";

        const created =
          await createSnapshotWithStatus({
            sceneId:
              "scene-1",
            sceneName:
              "Retry brand",
            templateId:
              "00000000-0000-4000-8000-000000000001",
          });

        const retried =
          await syncSnapshotWithStatus(
            created.value.id,
            {
              templateId:
                null,
            },
          );

        expect(
          retried.value
            ?.templateId,
        ).toBeUndefined();

        await expect(
          readSnapshots(),
        ).resolves.toEqual([
          expect.not.objectContaining({
            templateId:
              expect.anything(),
          }),
        ]);
      },
    );
  },
);
