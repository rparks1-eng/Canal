import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
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
  mockAsyncStorage,
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

    it(
      "preserves the local activity cache when the owner-scoped cloud delete fails",
      async () => {
        const userId =
          "00000000-0000-4000-8000-000000000001";

        const storageKey =
          `@canal/activity:${userId}`;

        mockStorage.set(
          storageKey,
          '[{"id":"activity-1"}]',
        );

        const cloudError =
          new Error(
            "activity delete failed",
          );

        const query = {
          delete:
            jest.fn(),
          eq:
            jest.fn(
              async () => ({
                data: null,
                error:
                  cloudError,
              }),
            ),
        };

        query.delete.mockReturnValue(
          query,
        );

        const getSession =
          jest.fn(
            async () => ({
              data: {
                session: {
                  user: {
                    id:
                      userId,
                  },
                },
              },
            }),
          );

        const from =
          jest.fn(
            () => query,
          );

        jest.doMock(
          "../lib/supabase",
          () => ({
            isSupabaseConfigured:
              true,
            supabase: {
              auth: {
                getSession,
              },
              from,
            },
          }),
        );

        jest.doMock(
          "@react-native-async-storage/async-storage",
          () => ({
            __esModule:
              true,
            default:
              mockAsyncStorage,
          }),
        );

        let configuredClearActivity:
          typeof import("../lib/relationships")["clearActivity"];

        jest.isolateModules(
          () => {
            configuredClearActivity =
              jest.requireActual<
                typeof import("../lib/relationships")
              >(
                "../lib/relationships",
              ).clearActivity;
          },
        );

        await expect(
          configuredClearActivity!(),
        ).rejects.toBe(
          cloudError,
        );

        expect(
          from,
        ).toHaveBeenCalledWith(
          "activity_events",
        );

        expect(
          query.eq,
        ).toHaveBeenCalledWith(
          "user_id",
          userId,
        );

        expect(
          mockStorage.get(
            storageKey,
          ),
        ).toBe(
          '[{"id":"activity-1"}]',
        );

        expect(
          mockAsyncStorage
            .multiRemove,
        ).not.toHaveBeenCalled();

        jest.dontMock(
          "../lib/supabase",
        );
        jest.dontMock(
          "@react-native-async-storage/async-storage",
        );
      },
    );

    it(
      "preserves the original account cache when the account changes after cloud deletion",
      async () => {
        const originalUserId =
          "00000000-0000-4000-8000-000000000001";

        const nextUserId =
          "00000000-0000-4000-8000-000000000002";

        const storageKey =
          `@canal/activity:${originalUserId}`;

        mockStorage.set(
          storageKey,
          '[{"id":"activity-1"}]',
        );

        const query = {
          delete:
            jest.fn(),
          eq:
            jest.fn(
              async () => ({
                data: null,
                error: null,
              }),
            ),
        };

        query.delete.mockReturnValue(
          query,
        );

        const sessionIds = [
          originalUserId,
          originalUserId,
          nextUserId,
        ];

        const getSession =
          jest.fn(
            async () => ({
              data: {
                session: {
                  user: {
                    id:
                      sessionIds.shift() ??
                      nextUserId,
                  },
                },
              },
            }),
          );

        jest.doMock(
          "../lib/supabase",
          () => ({
            isSupabaseConfigured:
              true,
            supabase: {
              auth: {
                getSession,
              },
              from:
                jest.fn(
                  () =>
                    query,
                ),
            },
          }),
        );

        jest.doMock(
          "@react-native-async-storage/async-storage",
          () => ({
            __esModule:
              true,
            default:
              mockAsyncStorage,
          }),
        );

        let configuredClearActivity:
          typeof import("../lib/relationships")["clearActivity"];

        jest.isolateModules(
          () => {
            configuredClearActivity =
              jest.requireActual<
                typeof import("../lib/relationships")
              >(
                "../lib/relationships",
              ).clearActivity;
          },
        );

        await expect(
          configuredClearActivity!(),
        ).rejects.toMatchObject({
          code:
            "CANAL_RELATIONSHIP_ACCOUNT_CHANGED",
        });

        expect(
          query.eq,
        ).toHaveBeenCalledWith(
          "user_id",
          originalUserId,
        );

        expect(
          getSession,
        ).toHaveBeenCalledTimes(
          3,
        );

        expect(
          mockStorage.get(
            storageKey,
          ),
        ).toBe(
          '[{"id":"activity-1"}]',
        );

        expect(
          mockAsyncStorage
            .multiRemove,
        ).not.toHaveBeenCalled();

        jest.dontMock(
          "../lib/supabase",
        );
        jest.dontMock(
          "@react-native-async-storage/async-storage",
        );
      },
    );
  },
);
