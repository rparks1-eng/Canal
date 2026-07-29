import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  advanceEventRunSheet,
  deleteEventRunSheet,
  listOwnEventRunSheets,
  loadEventRunSheet,
  saveEventRunSheet,
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
    created_at:
      CREATED_AT,
    updated_at:
      UPDATED_AT,
    ...overrides,
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
  "private Event Run Sheets client",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      authenticateAs(
        OWNER_ID,
      );
    });

    it(
      "lists strictly normalized sheets for the signed-in owner",
      async () => {
        const query =
          createQuery({
            data: [
              runSheetRow(),
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
          {
            id:
              RUN_SHEET_ID,
            ownerId:
              OWNER_ID,
            collectionId:
              COLLECTION_ID,
            title:
              "Friday Main Room",
            venueLabel:
              "Canal Hall",
            startsAt:
              STARTS_AT,
            timeZone:
              "America/New_York",
            activePosition:
              0,
            status:
              "planned",
            createdAt:
              CREATED_AT,
            updatedAt:
              UPDATED_AT,
          },
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
      "loads only by exact owner and run sheet IDs",
      async () => {
        const query =
          createQuery({
            data:
              runSheetRow(),
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          loadEventRunSheet(
            RUN_SHEET_ID,
          ),
        ).resolves.toMatchObject({
          id:
            RUN_SHEET_ID,
          ownerId:
            OWNER_ID,
        });

        expect(
          query.eq.mock.calls,
        ).toEqual([
          [
            "id",
            RUN_SHEET_ID,
          ],
          [
            "owner_id",
            OWNER_ID,
          ],
        ]);
      },
    );

    it(
      "rejects cross-account rows returned by the server",
      async () => {
        const query =
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
          query as never,
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
      "saves normalized metadata through the exact RPC",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              runSheetRow(),
            error:
              null,
          } as never,
        );

        await expect(
          saveEventRunSheet({
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
          }),
        ).resolves.toMatchObject({
          id:
            RUN_SHEET_ID,
          title:
            "Friday Main Room",
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "save_creator_event_run_sheet",
          {
            run_sheet_id_value:
              null,
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
          },
        );
      },
    );

    it(
      "advances with an exact expected-position compare-and-swap",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              runSheetRow({
                active_position:
                  1,
              }),
            error:
              null,
          } as never,
        );

        await expect(
          advanceEventRunSheet(
            RUN_SHEET_ID,
            0,
          ),
        ).resolves.toMatchObject({
          activePosition:
            1,
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "advance_creator_event_run_sheet",
          {
            run_sheet_id_value:
              RUN_SHEET_ID,
            expected_position_value:
              0,
          },
        );
      },
    );

    it(
      "maps stale compare-and-swap results to a typed conflict",
      async () => {
        mockRpc.mockResolvedValueOnce(
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
        );

        await expect(
          advanceEventRunSheet(
            RUN_SHEET_ID,
            0,
          ),
        ).rejects.toMatchObject({
          kind:
            "conflict",
          databaseCode:
            "40001",
        });
      },
    );

    it(
      "rejects invalid metadata before cloud writes",
      async () => {
        await expect(
          saveEventRunSheet({
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
          saveEventRunSheet({
            collectionId:
              COLLECTION_ID,
            title:
              "Main Room",
            venueLabel:
              "Canal Hall",
            startsAt:
              "not-a-date",
            timeZone:
              "GMT+500",
          }),
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
      "deletes only through the authenticated RPC",
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
          ),
        ).resolves.toBeUndefined();

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "delete_creator_event_run_sheet",
          {
            run_sheet_id_value:
              RUN_SHEET_ID,
          },
        );
      },
    );

    it(
      "rejects a read completed after the active account changes",
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

        const query =
          createQuery({
            data: [
              runSheetRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          listOwnEventRunSheets(),
        ).rejects.toMatchObject({
          kind:
            "account-changed",
        });
      },
    );
  },
);
