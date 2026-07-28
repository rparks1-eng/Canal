import {
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";

import fs from "node:fs";
import path from "node:path";

import {
  blockUser,
  compactRelationshipMutations,
  followUser,
  readRelationshipState,
} from "../lib/relationships";
import {
  mockStorage,
} from "./helpers/async-storage-mock";

describe(
  "relationship synchronization",
  () => {
    beforeEach(() => {
      mockStorage.clear();
    });

    it(
      "keeps following and blocked state mutually exclusive",
      async () => {
        await followUser(
          "@CanalFriend",
          "Canal Friend",
        );

        expect(
          await readRelationshipState(),
        ).toEqual({
          following: [
            "canalfriend",
          ],
          blocked: [],
        });

        await blockUser(
          "CanalFriend",
          "Canal Friend",
        );

        expect(
          await readRelationshipState(),
        ).toEqual({
          following: [],
          blocked: [
            "canalfriend",
          ],
        });
      },
    );

    it(
      "collapses queued offline mutations to the latest intent",
      () => {
        expect(
          compactRelationshipMutations([
            {
              username:
                "@CanalFriend",
              relationshipType:
                "following",
              action: "upsert",
            },
            {
              username:
                "canalfriend",
              relationshipType:
                "following",
              action: "delete",
            },
            {
              username:
                "CANALFRIEND",
              relationshipType:
                "blocked",
              action: "upsert",
            },
          ]),
        ).toEqual([
          {
            username:
              "canalfriend",
            relationshipType:
              "following",
            action: "delete",
          },
          {
            username:
              "canalfriend",
            relationshipType:
              "blocked",
            action: "upsert",
          },
        ]);
      },
    );

    it(
      "keeps the stable profile ID while compacting a follow or block",
      () => {
        expect(
          compactRelationshipMutations([
            {
              username:
                "canalfriend",
              targetUserId:
                "00000000-0000-4000-8000-000000000010",
              relationshipType:
                "following",
              action:
                "upsert",
            },
          ]),
        ).toEqual([
          {
            username:
              "canalfriend",
            targetUserId:
              "00000000-0000-4000-8000-000000000010",
            relationshipType:
              "following",
            action:
              "upsert",
          },
          {
            username:
              "canalfriend",
            targetUserId:
              "00000000-0000-4000-8000-000000000010",
            relationshipType:
              "blocked",
            action:
              "delete",
          },
        ]);
      },
    );

    it(
      "keeps only the latest intent when a target profile is renamed",
      () => {
        const targetUserId =
          "00000000-0000-4000-8000-000000000010";

        expect(
          compactRelationshipMutations([
            {
              username:
                "old_handle",
              targetUserId,
              relationshipType:
                "blocked",
              action:
                "upsert",
            },
            {
              username:
                "new_handle",
              targetUserId,
              relationshipType:
                "following",
              action:
                "upsert",
            },
          ]),
        ).toEqual([
          {
            username:
              "new_handle",
            targetUserId,
            relationshipType:
              "following",
            action:
              "upsert",
          },
          {
            username:
              "new_handle",
            targetUserId,
            relationshipType:
              "blocked",
            action:
              "delete",
          },
        ]);
      },
    );

    it(
      "removes an existing stable-ID row before inserting a renamed target",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              process.cwd(),
              "lib",
              "relationships.ts",
            ),
            "utf8",
          );

        const stableDeleteIndex =
          source.indexOf(
            '"target_user_id",\n          stableUpsertTargetUserIds',
          );

        const upsertIndex =
          source.indexOf(
            ".upsert(\n          upserts.map",
          );

        expect(
          stableDeleteIndex,
        ).toBeGreaterThan(
          -1,
        );
        expect(
          upsertIndex,
        ).toBeGreaterThan(
          stableDeleteIndex,
        );
      },
    );
  },
);
