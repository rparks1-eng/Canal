import {
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";

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
  },
);
