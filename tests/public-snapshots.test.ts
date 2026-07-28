import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  normalizePublicSnapshotRows,
} from "../lib/public-snapshots";

import type {
  PublicSnapshotCreator,
  PublicSnapshotRow,
} from "../lib/public-snapshots";

function snapshotRow(
  overrides:
    Partial<PublicSnapshotRow> =
      {},
): PublicSnapshotRow {
  return {
    id: "snapshot-1",
    user_id: "user-a",
    scene_id: "scene-1",
    scene_name: "Focus",
    track_id: null,
    track_title: "Signal",
    track_artist: "Canal Artist",
    spotify_url: null,
    position_ms: 4000,
    note: "Deep work",
    mood: "calm",
    visibility: "public",
    created_at:
      "2026-07-28T08:00:00.000Z",
    updated_at:
      "2026-07-28T09:00:00.000Z",
    ...overrides,
  };
}

describe(
  "public Snapshot discovery",
  () => {
    it(
      "keeps only valid public Snapshots and preserves ownership",
      () => {
        const creators =
          new Map<
            string,
            PublicSnapshotCreator
          >([
            [
              "user-a",
              {
                id:
                  "user-a",
                displayName:
                  "Ari",
                handle:
                  "@ari",
              },
            ],
          ]);

        const result =
          normalizePublicSnapshotRows(
            [
              snapshotRow({
                scene_name:
                  " Focus ",
                note:
                  "  Deep work  ",
                position_ms:
                  -50,
              }),

              snapshotRow({
                id:
                  "private",
                visibility:
                  "private",
              }),

              snapshotRow({
                id:
                  "",
              }),
            ],
            "user-a",
            creators,
          );

        expect(
          result,
        ).toHaveLength(
          1,
        );

        expect(
          result[0],
        ).toMatchObject({
          id:
            "snapshot-1",
          sceneName:
            "Focus",
          note:
            "Deep work",
          positionMs: 0,
          ownerId:
            "user-a",
          isMine:
            true,
          pendingCloudSync:
            false,
          creator: {
            displayName:
              "Ari",
            handle:
              "@ari",
          },
        });
      },
    );

    it(
      "sorts newest first and anonymizes a missing public profile",
      () => {
        const result =
          normalizePublicSnapshotRows(
            [
              snapshotRow({
                id:
                  "older",
                updated_at:
                  "2026-07-28T09:00:00.000Z",
              }),

              snapshotRow({
                id:
                  "newer",
                user_id:
                  "user-b",
                updated_at:
                  "2026-07-28T10:00:00.000Z",
              }),
            ],
            "viewer",
          );

        expect(
          result.map(
            (snapshot) =>
              snapshot.id,
          ),
        ).toEqual([
          "newer",
          "older",
        ]);

        expect(
          result[0],
        ).toMatchObject({
          isMine:
            false,
          creator: {
            id:
              "user-b",
            displayName:
              "Canal Listener",
            handle:
              "@canal_listener",
          },
        });
      },
    );
  },
);
