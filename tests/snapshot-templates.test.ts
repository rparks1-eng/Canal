import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  deleteSnapshotTemplate,
  listOwnSnapshotTemplates,
  saveSnapshotTemplate,
} from "../lib/snapshot-templates";

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

const TEMPLATE_ID =
  "00000000-0000-4000-8000-000000000003";

const CREATED_AT =
  "2026-07-29T00:00:00.000Z";

const UPDATED_AT =
  "2026-07-29T00:01:00.000Z";

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

function templateRow(
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    id:
      TEMPLATE_ID,
    owner_id:
      OWNER_ID,
    name:
      "Night Radio",
    brand_label:
      "Ari FM",
    theme:
      "midnight",
    is_default:
      true,
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
  "creator Snapshot templates client",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      authenticateAs(
        OWNER_ID,
      );
    });

    it(
      "lists and strictly normalizes only the signed-in owner's templates",
      async () => {
        const query =
          createQuery({
            data: [
              templateRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          listOwnSnapshotTemplates(),
        ).resolves.toEqual([
          {
            id:
              TEMPLATE_ID,
            ownerId:
              OWNER_ID,
            name:
              "Night Radio",
            brandLabel:
              "Ari FM",
            theme:
              "midnight",
            isDefault:
              true,
            createdAt:
              CREATED_AT,
            updatedAt:
              UPDATED_AT,
          },
        ]);

        expect(
          mockFrom,
        ).toHaveBeenCalledWith(
          "creator_snapshot_templates",
        );

        expect(
          query.eq,
        ).toHaveBeenCalledWith(
          "owner_id",
          OWNER_ID,
        );
      },
    );

    it(
      "rejects cross-account and malformed template rows",
      async () => {
        const query =
          createQuery({
            data: [
              templateRow({
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
          listOwnSnapshotTemplates(),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });
      },
    );

    it(
      "saves normalized fixed-theme input through the owner RPC",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              templateRow(),
            error:
              null,
          } as never,
        );

        await expect(
          saveSnapshotTemplate({
            name:
              "  Night Radio  ",
            brandLabel:
              "  Ari FM  ",
            theme:
              "midnight",
            isDefault:
              true,
          }),
        ).resolves.toMatchObject({
          id:
            TEMPLATE_ID,
          brandLabel:
            "Ari FM",
          theme:
            "midnight",
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "save_creator_snapshot_template",
          {
            template_id_value:
              null,
            name_value:
              "Night Radio",
            brand_label_value:
              "Ari FM",
            theme_value:
              "midnight",
            is_default_value:
              true,
          },
        );
      },
    );

    it(
      "rejects invalid input before making a cloud request",
      async () => {
        await expect(
          saveSnapshotTemplate({
            name:
              " ",
            brandLabel:
              "Ari",
            theme:
              "sunset",
            isDefault:
              false,
          }),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        await expect(
          saveSnapshotTemplate({
            name:
              "Ari",
            brandLabel:
              "Bad\u0000Brand",
            theme:
              "paper",
            isDefault:
              false,
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
      "deletes through the exact RPC and requires confirmation",
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
          deleteSnapshotTemplate(
            TEMPLATE_ID,
          ),
        ).resolves.toBeUndefined();

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "delete_creator_snapshot_template",
          {
            template_id_value:
              TEMPLATE_ID,
          },
        );
      },
    );

    it(
      "rejects a result that resolves after the active account changes",
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
              templateRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          listOwnSnapshotTemplates(),
        ).rejects.toMatchObject({
          kind:
            "account-changed",
        });
      },
    );
  },
);
