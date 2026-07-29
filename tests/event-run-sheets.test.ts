import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  advanceEventRunSheet,
  completeEventRunSheet,
  deleteEventRunSheet,
  listOwnEventRunSheets,
  loadEventRunSheet,
  saveEventRunSheet,
  startEventRunSheet,
} from "../lib/event-run-sheets";

import {
  supabase,
} from "../lib/supabase";

jest.mock(
  "../lib/supabase",
  () => ({
    requireSupabaseConfiguration:
      jest.fn(),
    supabase: {
      auth: {
        getUser:
          jest.fn(),
      },
      from:
        jest.fn(),
      rpc:
        jest.fn(),
    },
  }),
);

type QueryResult = {
  data?: unknown;
  error:
    | {
        code?: string;
        message: string;
      }
    | null;
};

const OWNER_ID =
  "00000000-0000-4000-8000-000000000001";

const NEXT_USER_ID =
  "00000000-0000-4000-8000-000000000002";

const RUN_SHEET_ID =
  "00000000-0000-4000-8000-000000000003";

const COLLECTION_ID =
  "00000000-0000-4000-8000-000000000004";

const CREATED_AT =
  "2026-07-29T00:00:00.000Z";

const UPDATED_AT =
  "2026-07-29T00:01:00.000Z";

const STARTS_AT =
  "2026-08-01T23:00:00.000Z";

const mockGetUser =
  jest.mocked(
    supabase.auth.getUser,
  );

const mockFrom =
  jest.mocked(
    supabase.from,
  );

const mockRpc =
  jest.mocked(
    supabase.rpc,
  );

function runSheetRow(
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    id:
      RUN_SHEET_ID,
    owner_id:
      OWNER_ID,
    collection_id:
      COLLECTION_ID,
    title:
      "Friday Main Room",
    venue_label:
      "Canal Hall",
    starts_at:
      STARTS_AT,
    time_zone:
      "America/New_York",
    active_position:
      0,
    status:
      "planned",
    version:
      1,
    started_at:
      null,
    completed_at:
      null,
    source_collection_title:
      null,
    created_at:
      CREATED_AT,
    updated_at:
      UPDATED_AT,
    ...overrides,
  };
}

function runSheetItemRow(
  position: number,
): Record<string, unknown> {
  return {
    run_sheet_id:
      RUN_SHEET_ID,
    owner_id:
      OWNER_ID,
    scene_id:
      `scene-${position}`,
    scene_revision:
      position +
      3,
    position,
    scene_title:
      `Scene ${position + 1}`,
    activity_label:
      "Dinner",
    duration_label:
      "30 minutes",
    track_count:
      8,
    created_at:
      CREATED_AT,
  };
}

function createQuery(
  result: QueryResult,
) {
  const promise =
    Promise.resolve(
      result,
    );

  const query = {
    select:
      jest.fn(),
    eq:
      jest.fn(),
    order:
      jest.fn(),
    limit:
      jest.fn(),
    maybeSingle:
      jest.fn(
        async () =>
          result,
      ),
    then:
      promise.then.bind(
        promise,
      ),
  };

  query.select.mockReturnValue(
    query,
  );
  query.eq.mockReturnValue(
    query,
  );
  query.order.mockReturnValue(
    query,
  );
  query.limit.mockReturnValue(
    query,
  );

  return query;
}

function authenticateAs(
  userId: string,
): void {
  mockGetUser.mockResolvedValue(
    {
      data: {
        user: {
          id:
            userId,
        },
      },
      error:
        null,
    } as never,
  );
}

describe(
  "private frozen Event Run Sheets client",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      authenticateAs(
        OWNER_ID,
      );
    });

    it(
      "lists strictly normalized lifecycle summaries for one owner",
      async () => {
        const query =
          createQuery({
            data: [
              runSheetRow(),
              runSheetRow({
                id:
                  "00000000-0000-4000-8000-000000000005",
                status:
                  "completed",
                version:
                  8,
                active_position:
                  1,
                started_at:
                  "2026-08-01T23:05:00.000Z",
                completed_at:
                  "2026-08-02T00:00:00.000Z",
                source_collection_title:
                  "Dinner flow",
              }),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          listOwnEventRunSheets(),
        ).resolves.toEqual([
          expect.objectContaining({
            id:
              RUN_SHEET_ID,
            ownerId:
              OWNER_ID,
            status:
              "planned",
            version:
              1,
            sourceCollectionTitle:
              null,
          }),
          expect.objectContaining({
            status:
              "completed",
            version:
              8,
            sourceCollectionTitle:
              "Dinner flow",
          }),
        ]);

        expect(
          query.eq,
        ).toHaveBeenCalledWith(
          "owner_id",
          OWNER_ID,
        );
      },
    );

    it(
      "loads one running sheet with a contiguous immutable item snapshot",
      async () => {
        const runSheetQuery =
          createQuery({
            data:
              runSheetRow({
                status:
                  "running",
                version:
                  4,
                active_position:
                  1,
                started_at:
                  "2026-08-01T23:05:00.000Z",
                source_collection_title:
                  "Dinner flow",
              }),
            error:
              null,
          });

        const itemQuery =
          createQuery({
            data: [
              runSheetItemRow(
                0,
              ),
              runSheetItemRow(
                1,
              ),
            ],
            error:
              null,
          });

        mockFrom
          .mockReturnValueOnce(
            runSheetQuery as never,
          )
          .mockReturnValueOnce(
            itemQuery as never,
          );

        await expect(
          loadEventRunSheet(
            RUN_SHEET_ID,
          ),
        ).resolves.toMatchObject({
          id:
            RUN_SHEET_ID,
          status:
            "running",
          activePosition:
            1,
          items: [
            {
              sceneId:
                "scene-0",
              sceneRevision:
                3,
              position:
                0,
            },
            {
              sceneId:
                "scene-1",
              sceneRevision:
                4,
              position:
                1,
            },
          ],
        });
      },
    );

    it(
      "rejects missing, duplicate, or cross-account frozen rows",
      async () => {
        const runSheetQuery =
          createQuery({
            data:
              runSheetRow({
                status:
                  "running",
                started_at:
                  "2026-08-01T23:05:00.000Z",
                source_collection_title:
                  "Dinner flow",
              }),
            error:
              null,
          });

        const itemQuery =
          createQuery({
            data: [
              runSheetItemRow(
                0,
              ),
              {
                ...runSheetItemRow(
                  1,
                ),
                scene_id:
                  "scene-0",
              },
            ],
            error:
              null,
          });

        mockFrom
          .mockReturnValueOnce(
            runSheetQuery as never,
          )
          .mockReturnValueOnce(
            itemQuery as never,
          );

        await expect(
          loadEventRunSheet(
            RUN_SHEET_ID,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });

        const listQuery =
          createQuery({
            data: [
              runSheetRow({
                owner_id:
                  NEXT_USER_ID,
              }),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          listQuery as never,
        );

        await expect(
          listOwnEventRunSheets(),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });
      },
    );

    it(
      "saves planned metadata with an expected actor and exact version",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              runSheetRow({
                version:
                  4,
              }),
            error:
              null,
          } as never,
        );

        await expect(
          saveEventRunSheet({
            id:
              RUN_SHEET_ID,
            collectionId:
              COLLECTION_ID,
            title:
              "  Friday Main Room  ",
            venueLabel:
              "  Canal Hall  ",
            startsAt:
              STARTS_AT,
            timeZone:
              "  America/New_York  ",
            expectedVersion:
              3,
          }),
        ).resolves.toMatchObject({
          version:
            4,
          title:
            "Friday Main Room",
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "save_creator_event_run_sheet",
          {
            run_sheet_id_value:
              RUN_SHEET_ID,
            collection_id_value:
              COLLECTION_ID,
            title_value:
              "Friday Main Room",
            venue_label_value:
              "Canal Hall",
            starts_at_value:
              STARTS_AT,
            time_zone_value:
              "America/New_York",
            expected_version_value:
              3,
            expected_actor_id_value:
              OWNER_ID,
          },
        );
      },
    );

    it(
      "starts, advances, and completes through versioned actor-bound RPCs",
      async () => {
        mockRpc
          .mockResolvedValueOnce(
            {
              data:
                runSheetRow({
                  status:
                    "running",
                  version:
                    5,
                  started_at:
                    "2026-08-01T23:05:00.000Z",
                  source_collection_title:
                    "Dinner flow",
                }),
              error:
                null,
            } as never,
          )
          .mockResolvedValueOnce(
            {
              data:
                runSheetRow({
                  status:
                    "running",
                  version:
                    6,
                  active_position:
                    1,
                  started_at:
                    "2026-08-01T23:05:00.000Z",
                  source_collection_title:
                    "Dinner flow",
                }),
              error:
                null,
            } as never,
          )
          .mockResolvedValueOnce(
            {
              data:
                runSheetRow({
                  status:
                    "completed",
                  version:
                    7,
                  active_position:
                    1,
                  started_at:
                    "2026-08-01T23:05:00.000Z",
                  completed_at:
                    "2026-08-02T00:00:00.000Z",
                  source_collection_title:
                    "Dinner flow",
                }),
              error:
                null,
            } as never,
          );

        await expect(
          startEventRunSheet(
            RUN_SHEET_ID,
            4,
          ),
        ).resolves.toMatchObject({
          status:
            "running",
          version:
            5,
        });

        await expect(
          advanceEventRunSheet(
            RUN_SHEET_ID,
            0,
            5,
          ),
        ).resolves.toMatchObject({
          activePosition:
            1,
          version:
            6,
        });

        await expect(
          completeEventRunSheet(
            RUN_SHEET_ID,
            1,
            6,
          ),
        ).resolves.toMatchObject({
          status:
            "completed",
          version:
            7,
        });

        expect(
          mockRpc.mock.calls,
        ).toEqual([
          [
            "start_creator_event_run_sheet",
            {
              run_sheet_id_value:
                RUN_SHEET_ID,
              expected_version_value:
                4,
              expected_actor_id_value:
                OWNER_ID,
            },
          ],
          [
            "advance_creator_event_run_sheet",
            {
              run_sheet_id_value:
                RUN_SHEET_ID,
              expected_version_value:
                5,
              expected_actor_id_value:
                OWNER_ID,
              expected_position_value:
                0,
            },
          ],
          [
            "complete_creator_event_run_sheet",
            {
              run_sheet_id_value:
                RUN_SHEET_ID,
              expected_version_value:
                6,
              expected_actor_id_value:
                OWNER_ID,
              expected_position_value:
                1,
            },
          ],
        ]);
      },
    );

    it(
      "deletes only a versioned planned sheet through the authenticated RPC",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              true,
            error:
              null,
          } as never,
        );

        await expect(
          deleteEventRunSheet(
            RUN_SHEET_ID,
            3,
          ),
        ).resolves.toBeUndefined();

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "delete_creator_event_run_sheet",
          {
            run_sheet_id_value:
              RUN_SHEET_ID,
            expected_version_value:
              3,
            expected_actor_id_value:
              OWNER_ID,
          },
        );
      },
    );

    it(
      "rejects invalid metadata and incomplete compare-and-swap values before cloud writes",
      async () => {
        await expect(
          saveEventRunSheet({
            id:
              RUN_SHEET_ID,
            collectionId:
              COLLECTION_ID,
            title:
              " ",
            venueLabel:
              "Canal Hall",
            startsAt:
              STARTS_AT,
            timeZone:
              "America/New_York",
          }),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        await expect(
          advanceEventRunSheet(
            RUN_SHEET_ID,
            50,
            2,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        expect(
          mockRpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "maps compare-and-swap, deadlock, and connectivity failures to actionable typed errors",
      async () => {
        mockRpc
          .mockResolvedValueOnce(
            {
              data:
                null,
              error: {
                code:
                  "40001",
                message:
                  "Reload before trying again.",
              },
            } as never,
          )
          .mockResolvedValueOnce(
            {
              data:
                null,
              error: {
                code:
                  "40P01",
                message:
                  "Concurrent lifecycle update.",
              },
            } as never,
          )
          .mockRejectedValueOnce(
            new TypeError(
              "Network request failed",
            ),
          );

        await expect(
          startEventRunSheet(
            RUN_SHEET_ID,
            2,
          ),
        ).rejects.toMatchObject({
          kind:
            "conflict",
          retryable:
            true,
        });

        await expect(
          startEventRunSheet(
            RUN_SHEET_ID,
            2,
          ),
        ).rejects.toMatchObject({
          kind:
            "conflict",
          retryable:
            true,
        });

        await expect(
          startEventRunSheet(
            RUN_SHEET_ID,
            2,
          ),
        ).rejects.toMatchObject({
          kind:
            "offline",
          retryable:
            true,
        });
      },
    );

    it(
      "rejects a mutation response after an A-to-B account switch",
      async () => {
        mockGetUser
          .mockResolvedValueOnce(
            {
              data: {
                user: {
                  id:
                    OWNER_ID,
                },
              },
              error:
                null,
            } as never,
          )
          .mockResolvedValueOnce(
            {
              data: {
                user: {
                  id:
                    OWNER_ID,
                },
              },
              error:
                null,
            } as never,
          )
          .mockResolvedValueOnce(
            {
              data: {
                user: {
                  id:
                    NEXT_USER_ID,
                },
              },
              error:
                null,
            } as never,
          );

        mockRpc.mockResolvedValueOnce(
          {
            data:
              runSheetRow({
                status:
                  "running",
                version:
                  3,
                started_at:
                  "2026-08-01T23:05:00.000Z",
                source_collection_title:
                  "Dinner flow",
              }),
            error:
              null,
          } as never,
        );

        await expect(
          startEventRunSheet(
            RUN_SHEET_ID,
            2,
          ),
        ).rejects.toMatchObject({
          kind:
            "account-changed",
        });
      },
    );
  },
);
