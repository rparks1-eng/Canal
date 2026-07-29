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
  isRetryableRelationshipSyncError,
  readBlockedUserReferences,
  readRelationshipState,
  unblockUser,
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
          blockedTargets: [
            {
              username:
                "canalfriend",
            },
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
      "keeps the stable profile ID without inventing an opposite username mutation",
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
              "blocked",
            action:
              "upsert",
          },
        ]);
      },
    );

    it(
      "keeps ambiguous username intent separate from a later stable profile ID",
      () => {
        const targetUserId =
          "00000000-0000-4000-8000-000000000010";
        const usernameMutation = {
          username:
            "canalfriend",
          relationshipType:
            "blocked" as const,
          action:
            "upsert" as const,
        };
        const stableMutation = {
          ...usernameMutation,
          targetUserId,
        };

        for (const mutations of [
          [
            usernameMutation,
            stableMutation,
          ],
          [
            stableMutation,
            usernameMutation,
          ],
        ]) {
          const compacted =
            compactRelationshipMutations(
              mutations,
            );

          expect(
            compacted,
          ).toHaveLength(
            2,
          );
          expect(
            compacted,
          ).toEqual(
            expect.arrayContaining([
              usernameMutation,
              stableMutation,
            ]),
          );
        }
      },
    );

    it(
      "retries only transient relationship failures",
      () => {
        expect(
          isRetryableRelationshipSyncError(
            new TypeError(
              "Network request failed",
            ),
          ),
        ).toBe(true);
        expect(
          isRetryableRelationshipSyncError({
            status: 503,
            message:
              "Service unavailable",
          }),
        ).toBe(true);

        for (const error of [
          {
            code: "22023",
            message:
              "Invalid relationship target",
          },
          {
            code: "42501",
            message:
              "Permission denied",
          },
          {
            code: "PGRST202",
            message:
              "Function was not found",
          },
        ]) {
          expect(
            isRetryableRelationshipSyncError(
              error,
            ),
          ).toBe(false);
        }
      },
    );

    it(
      "keeps a stable blocked profile ID through local block and unblock transitions",
      async () => {
        const targetUserId =
          "00000000-0000-4000-8000-000000000010";

        await blockUser(
          "CanalFriend",
          "Canal Friend",
          targetUserId,
        );

        await expect(
          readBlockedUserReferences(),
        ).resolves.toEqual([
          {
            username:
              "canalfriend",
            targetUserId,
          },
        ]);

        await unblockUser(
          "renamed_friend",
          "Canal Friend",
          targetUserId,
        );

        await expect(
          readBlockedUserReferences(),
        ).resolves.toEqual(
          [],
        );
      },
    );

    it(
      "routes block mutations through the account-pinned RPC and UUID conflict key",
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

        expect(source).toContain(
          '"set_canal_user_block"',
        );
        expect(source).toContain(
          "expected_actor_id_value:",
        );
        expect(source).toContain(
          '"user_id,target_user_id"',
        );
        expect(source).not.toContain(
          "target_user_id:\n                mutation.targetUserId ??\n                null",
        );
      },
    );

    it(
      "flushes a stable block through the exact account-pinned RPC payload",
      async () => {
        const actorUserId =
          "00000000-0000-4000-8000-000000000001";
        const targetUserId =
          "00000000-0000-4000-8000-000000000010";
        const rpc =
          jest.fn(
            async () => ({
              data: null,
              error: null,
            }),
          );
        const getSession =
          jest.fn(
            async () => ({
              data: {
                session: {
                  user: {
                    id:
                      actorUserId,
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
              rpc,
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

        let flush:
          typeof import("../lib/relationships")["flushRelationshipMutations"];

        jest.isolateModules(
          () => {
            flush =
              jest.requireActual<
                typeof import("../lib/relationships")
              >(
                "../lib/relationships",
              ).flushRelationshipMutations;
          },
        );

        await flush!(
          actorUserId,
          [
            {
              username:
                "canalfriend",
              targetUserId,
              relationshipType:
                "blocked",
              action:
                "upsert",
            },
          ],
        );

        expect(rpc).toHaveBeenCalledWith(
          "set_canal_user_block",
          {
            target_user_id_value:
              targetUserId,
            target_username_value:
              "canalfriend",
            blocked_value:
              true,
            expected_actor_id_value:
              actorUserId,
          },
        );
        expect(
          getSession,
        ).toHaveBeenCalledTimes(
          2,
        );

        jest.dontMock(
          "../lib/supabase",
        );
        jest.dontMock(
          "@react-native-async-storage/async-storage",
        );
      },
    );

    it(
      "pins a block to the original account when the session changes during the RPC",
      async () => {
        const actorUserId =
          "00000000-0000-4000-8000-000000000001";
        const replacementUserId =
          "00000000-0000-4000-8000-000000000002";
        const sessionIds = [
          actorUserId,
          replacementUserId,
        ];
        const rpc =
          jest.fn(
            async () => ({
              data: null,
              error: null,
            }),
          );

        jest.doMock(
          "../lib/supabase",
          () => ({
            isSupabaseConfigured:
              true,
            supabase: {
              auth: {
                getSession:
                  jest.fn(
                    async () => ({
                      data: {
                        session: {
                          user: {
                            id:
                              sessionIds.shift() ??
                              replacementUserId,
                          },
                        },
                      },
                    }),
                  ),
              },
              rpc,
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

        let flush:
          typeof import("../lib/relationships")["flushRelationshipMutations"];

        jest.isolateModules(
          () => {
            flush =
              jest.requireActual<
                typeof import("../lib/relationships")
              >(
                "../lib/relationships",
              ).flushRelationshipMutations;
          },
        );

        await expect(
          flush!(
            actorUserId,
            [
              {
                username:
                  "canalfriend",
                targetUserId:
                  "00000000-0000-4000-8000-000000000010",
                relationshipType:
                  "blocked",
                action:
                  "upsert",
              },
            ],
          ),
        ).rejects.toMatchObject({
          code:
            "CANAL_RELATIONSHIP_ACCOUNT_CHANGED",
        });

        expect(rpc).toHaveBeenCalledWith(
          "set_canal_user_block",
          expect.objectContaining({
            expected_actor_id_value:
              actorUserId,
          }),
        );

        jest.dontMock(
          "../lib/supabase",
        );
        jest.dontMock(
          "@react-native-async-storage/async-storage",
        );
      },
    );

    it(
      "does not commit a local block when the RPC rejects a permanent contract error",
      async () => {
        const actorUserId =
          "00000000-0000-4000-8000-000000000001";
        const targetUserId =
          "00000000-0000-4000-8000-000000000010";
        const rpc =
          jest.fn(
            async () => ({
              data: null,
              error: {
                code: "22023",
                message:
                  "Invalid relationship target",
              },
            }),
          );
        const from =
          jest.fn(
            () => ({
              select:
                jest.fn(
                  () => ({
                    eq:
                      jest.fn(
                        async () => ({
                          data: [],
                          error:
                            null,
                        }),
                      ),
                  }),
                ),
            }),
          );

        jest.doMock(
          "../lib/supabase",
          () => ({
            isSupabaseConfigured:
              true,
            supabase: {
              auth: {
                getSession:
                  jest.fn(
                    async () => ({
                      data: {
                        session: {
                          user: {
                            id:
                              actorUserId,
                          },
                        },
                      },
                    }),
                  ),
              },
              from,
              rpc,
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

        let configuredBlock:
          typeof import("../lib/relationships")["blockUser"];

        jest.isolateModules(
          () => {
            configuredBlock =
              jest.requireActual<
                typeof import("../lib/relationships")
              >(
                "../lib/relationships",
              ).blockUser;
          },
        );

        await expect(
          configuredBlock!(
            "canalfriend",
            "Canal Friend",
            targetUserId,
          ),
        ).rejects.toMatchObject({
          code: "22023",
        });

        expect(
          JSON.parse(
            mockStorage.get(
              `@canal/blocked-users:${actorUserId}`,
            ) ?? "[]",
          ),
        ).toEqual([]);
        expect(
          JSON.parse(
            mockStorage.get(
              `@canal/blocked-user-references:${actorUserId}`,
            ) ?? "[]",
          ),
        ).toEqual([]);
        expect(
          mockStorage.has(
            `@canal/relationship-mutations:${actorUserId}`,
          ),
        ).toBe(false);

        jest.dontMock(
          "../lib/supabase",
        );
        jest.dontMock(
          "@react-native-async-storage/async-storage",
        );
      },
    );

    it(
      "quarantines a legacy username-only mutation instead of replaying it against a reused handle",
      async () => {
        const actorUserId =
          "00000000-0000-4000-8000-000000000001";
        const rpc =
          jest.fn();

        mockStorage.set(
          `@canal/relationship-mutations:${actorUserId}`,
          JSON.stringify([
            {
              username:
                "reused_handle",
              relationshipType:
                "blocked",
              action: "upsert",
            },
          ]),
        );

        jest.doMock(
          "../lib/supabase",
          () => ({
            isSupabaseConfigured:
              true,
            supabase: {
              auth: {
                getSession:
                  jest.fn(
                    async () => ({
                      data: {
                        session: {
                          user: {
                            id:
                              actorUserId,
                          },
                        },
                      },
                    }),
                  ),
              },
              from:
                jest.fn(
                  () => ({
                    select:
                      jest.fn(
                        () => ({
                          eq:
                            jest.fn(
                              async () => ({
                                data:
                                  [],
                                error:
                                  null,
                              }),
                            ),
                        }),
                      ),
                  }),
                ),
              rpc,
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

        let configuredRead:
          typeof import("../lib/relationships")["readRelationshipState"];

        jest.isolateModules(
          () => {
            configuredRead =
              jest.requireActual<
                typeof import("../lib/relationships")
              >(
                "../lib/relationships",
              ).readRelationshipState;
          },
        );

        await expect(
          configuredRead!(),
        ).resolves.toMatchObject({
          blocked: [],
          syncStatus:
            "synced",
        });

        expect(rpc).not.toHaveBeenCalled();
        expect(
          mockStorage.has(
            `@canal/relationship-mutations:${actorUserId}`,
          ),
        ).toBe(false);
        expect(
          JSON.parse(
            mockStorage.get(
              `@canal/relationship-mutation-quarantine:${actorUserId}`,
            ) ?? "[]",
          ),
        ).toEqual([
          expect.objectContaining({
            username:
              "reused_handle",
            relationshipType:
              "blocked",
            action: "upsert",
            reason:
              "missing_stable_target",
          }),
        ]);

        jest.dontMock(
          "../lib/supabase",
        );
        jest.dontMock(
          "@react-native-async-storage/async-storage",
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
