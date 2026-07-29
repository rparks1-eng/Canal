import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  deleteSceneCollection,
  isSceneCollectionError,
  listOwnSceneCollections,
  listPublicSceneCollections,
  loadSceneCollection,
  saveSceneCollection,
} from "../lib/scene-collections";

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

type MockQuery = {
  select: ReturnType<
    typeof jest.fn
  >;
  eq: ReturnType<
    typeof jest.fn
  >;
  in: ReturnType<
    typeof jest.fn
  >;
  is: ReturnType<
    typeof jest.fn
  >;
  order: ReturnType<
    typeof jest.fn
  >;
  limit: ReturnType<
    typeof jest.fn
  >;
  maybeSingle: ReturnType<
    typeof jest.fn
  >;
  then:
    Promise<QueryResult>["then"];
};

const OWNER_ID =
  "00000000-0000-4000-8000-000000000001";

const VIEWER_ID =
  "00000000-0000-4000-8000-000000000002";

const NEXT_USER_ID =
  "00000000-0000-4000-8000-000000000003";

const COLLECTION_ID =
  "00000000-0000-4000-8000-000000000004";

const CREATED_AT =
  "2026-07-28T12:00:00.000Z";

const UPDATED_AT =
  "2026-07-28T13:00:00.000Z";

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

function collectionRow(
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    id:
      COLLECTION_ID,
    owner_id:
      OWNER_ID,
    title:
      "Sunday Reset",
    description:
      "A warm weekly reset.",
    visibility:
      "public",
    created_at:
      CREATED_AT,
    updated_at:
      UPDATED_AT,
    ...overrides,
  };
}

function itemRow(
  sceneId: string,
  position: number,
): Record<string, unknown> {
  return {
    collection_id:
      COLLECTION_ID,
    owner_id:
      OWNER_ID,
    scene_id:
      sceneId,
    position,
    created_at:
      CREATED_AT,
  };
}

function sceneRow(
  sceneId: string,
  name: string,
): Record<string, unknown> {
  return {
    user_id:
      OWNER_ID,
    id:
      sceneId,
    payload: {
      id:
        sceneId,
      ownerId:
        OWNER_ID,
      name,
      tracks: [],
      visibility:
        "public",
      libraryType:
        "created",
    },
    created_at:
      CREATED_AT,
    updated_at:
      UPDATED_AT,
    deleted_at:
      null,
  };
}

function createQuery(
  result:
    | QueryResult
    | Promise<QueryResult>,
): MockQuery {
  let query =
    {} as MockQuery;

  const promise =
    Promise.resolve(
      result,
    );

  query = {
    select:
      jest.fn(
        () => query,
      ),
    eq:
      jest.fn(
        () => query,
      ),
    in:
      jest.fn(
        () => query,
      ),
    is:
      jest.fn(
        () => query,
      ),
    order:
      jest.fn(
        () => query,
      ),
    limit:
      jest.fn(
        () => query,
      ),
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

  return query;
}

function createDeferred<
  Value,
>(): {
  promise:
    Promise<Value>;
  resolve: (
    value: Value,
  ) => void;
} {
  let resolve:
    (
      value: Value,
    ) => void =
      () => {};

  const promise =
    new Promise<Value>(
      (
        resolver,
      ) => {
        resolve =
          resolver;
      },
    );

  return {
    promise,
    resolve,
  };
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
  "creator Scene collections client",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      authenticateAs(
        OWNER_ID,
      );
    });

    it(
      "lists the current owner's draft and public collections with item counts",
      async () => {
        const collectionsQuery =
          createQuery({
            data: [
              collectionRow(),
            ],
            error:
              null,
          });

        const itemsQuery =
          createQuery({
            data: [
              {
                collection_id:
                  COLLECTION_ID,
              },
              {
                collection_id:
                  COLLECTION_ID,
              },
            ],
            error:
              null,
          });

        mockFrom
          .mockReturnValueOnce(
            collectionsQuery as never,
          )
          .mockReturnValueOnce(
            itemsQuery as never,
          );

        await expect(
          listOwnSceneCollections(),
        ).resolves.toEqual([
          {
            id:
              COLLECTION_ID,
            ownerId:
              OWNER_ID,
            title:
              "Sunday Reset",
            description:
              "A warm weekly reset.",
            isPublic:
              true,
            sceneCount:
              2,
            createdAt:
              CREATED_AT,
            updatedAt:
              UPDATED_AT,
          },
        ]);

        expect(
          collectionsQuery.eq,
        ).toHaveBeenCalledWith(
          "owner_id",
          OWNER_ID,
        );

        expect(
          itemsQuery.in,
        ).toHaveBeenCalledWith(
          "collection_id",
          [
            COLLECTION_ID,
          ],
        );
      },
    );

    it(
      "lists only public collections for an exact creator UUID",
      async () => {
        authenticateAs(
          VIEWER_ID,
        );

        const collectionsQuery =
          createQuery({
            data: [],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          collectionsQuery as never,
        );

        await expect(
          listPublicSceneCollections(
            OWNER_ID.toUpperCase(),
          ),
        ).resolves.toEqual(
          [],
        );

        expect(
          collectionsQuery.eq.mock.calls,
        ).toEqual([
          [
            "owner_id",
            OWNER_ID,
          ],
          [
            "visibility",
            "public",
          ],
        ]);
      },
    );

    it(
      "hydrates collection Scenes in stored item order",
      async () => {
        authenticateAs(
          VIEWER_ID,
        );

        const collectionQuery =
          createQuery({
            data:
              collectionRow(),
            error:
              null,
          });

        const itemsQuery =
          createQuery({
            data: [
              itemRow(
                "scene-b",
                1,
              ),
              itemRow(
                "scene-a",
                0,
              ),
            ],
            error:
              null,
          });

        const scenesQuery =
          createQuery({
            data: [
              sceneRow(
                "scene-b",
                "Second",
              ),
              sceneRow(
                "scene-a",
                "First",
              ),
            ],
            error:
              null,
          });

        mockFrom
          .mockReturnValueOnce(
            collectionQuery as never,
          )
          .mockReturnValueOnce(
            itemsQuery as never,
          )
          .mockReturnValueOnce(
            scenesQuery as never,
          );

        const result =
          await loadSceneCollection(
            COLLECTION_ID,
          );

        expect(
          result.items.map(
            (item) => [
              item.position,
              item.sceneId,
              item.scene.name,
            ],
          ),
        ).toEqual([
          [
            0,
            "scene-a",
            "First",
          ],
          [
            1,
            "scene-b",
            "Second",
          ],
        ]);

        expect(
          result.sceneCount,
        ).toBe(
          2,
        );
      },
    );

    it(
      "saves normalized ordered input through the exact RPC and returns hydrated detail",
      async () => {
        const collectionQuery =
          createQuery({
            data:
              collectionRow({
                title:
                  "Reset Mix",
                description:
                  "Warm and calm",
              }),
            error:
              null,
          });

        const itemsQuery =
          createQuery({
            data: [
              itemRow(
                "scene-a",
                0,
              ),
            ],
            error:
              null,
          });

        const scenesQuery =
          createQuery({
            data: [
              sceneRow(
                "scene-a",
                "First",
              ),
            ],
            error:
              null,
          });

        mockRpc.mockResolvedValueOnce(
          {
            data:
              collectionRow({
                title:
                  "Reset Mix",
                description:
                  "Warm and calm",
              }),
            error:
              null,
          } as never,
        );

        mockFrom
          .mockReturnValueOnce(
            collectionQuery as never,
          )
          .mockReturnValueOnce(
            itemsQuery as never,
          )
          .mockReturnValueOnce(
            scenesQuery as never,
          );

        await expect(
          saveSceneCollection({
            title:
              "  Reset Mix  ",
            description:
              "  Warm and calm  ",
            isPublic:
              true,
            sceneIds: [
              " scene-a ",
            ],
          }),
        ).resolves.toMatchObject({
          id:
            COLLECTION_ID,
          title:
            "Reset Mix",
          sceneCount:
            1,
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "save_creator_scene_collection",
          {
            collection_id_value:
              null,
            title_value:
              "Reset Mix",
            description_value:
              "Warm and calm",
            visibility_value:
              "public",
            scene_ids_value: [
              "scene-a",
            ],
          },
        );
      },
    );

    it(
      "deletes only through the collection RPC",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              null,
            error:
              null,
          } as never,
        );

        await expect(
          deleteSceneCollection(
            COLLECTION_ID,
          ),
        ).resolves.toBe(
          true,
        );

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "delete_creator_scene_collection",
          {
            collection_id_value:
              COLLECTION_ID,
          },
        );
      },
    );

    it(
      "rejects invalid titles, duplicate Scenes, and empty public collections before cloud writes",
      async () => {
        await expect(
          saveSceneCollection({
            title:
              " ",
            description:
              "",
            isPublic:
              false,
            sceneIds: [],
          }),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        await expect(
          saveSceneCollection({
            title:
              "Reset",
            description:
              "",
            isPublic:
              false,
            sceneIds: [
              "scene-a",
              " scene-a ",
            ],
          }),
        ).rejects.toThrow(
          "unique",
        );

        await expect(
          saveSceneCollection({
            title:
              "Reset",
            description:
              "",
            isPublic:
              true,
            sceneIds: [],
          }),
        ).rejects.toThrow(
          "at least one Scene",
        );

        expect(
          mockRpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "maps database errors to typed collection errors",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              null,
            error: {
              code:
                "P0002",
              message:
                "The creator Scene collection was not found.",
            },
          } as never,
        );

        const result =
          deleteSceneCollection(
            COLLECTION_ID,
          );

        await expect(
          result,
        ).rejects.toMatchObject({
          name:
            "SceneCollectionError",
          kind:
            "not-found",
          databaseCode:
            "P0002",
        });

        try {
          await result;
        } catch (error) {
          expect(
            isSceneCollectionError(
              error,
            ),
          ).toBe(
            true,
          );
        }
      },
    );

    it(
      "rejects data loaded after the signed-in account changes",
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
              collectionRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          listOwnSceneCollections(),
        ).rejects.toMatchObject({
          kind:
            "account-changed",
        });
      },
    );

    it(
      "never returns account B summaries to a screen bound to captured account A",
      async () => {
        const deferredResult =
          createDeferred<QueryResult>();

        const queryStarted =
          createDeferred<void>();

        const query =
          createQuery(
            deferredResult.promise,
          );

        query.order.mockImplementation(
          () => {
            queryStarted.resolve(
              undefined,
            );

            return query;
          },
        );

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        let committed:
          unknown[] = [];

        const result =
          listOwnSceneCollections({
            account: {
              userId:
                OWNER_ID,
            },
          }).then(
            (
              collections,
            ) => {
              committed =
                collections;

              return collections;
            },
          );

        await queryStarted.promise;

        authenticateAs(
          NEXT_USER_ID,
        );

        deferredResult.resolve({
          data: [
            collectionRow({
              owner_id:
                NEXT_USER_ID,
              title:
                "Account B collection",
            }),
          ],
          error:
            null,
        });

        await expect(
          result,
        ).rejects.toMatchObject({
          kind:
            "account-changed",
        });

        expect(
          committed,
        ).toEqual([]);

        expect(
          query.eq,
        ).toHaveBeenCalledWith(
          "owner_id",
          OWNER_ID,
        );
      },
    );

    it(
      "contains no local cache or offline mutation path",
      () => {
        const source =
          readFileSync(
            join(
              process.cwd(),
              "lib",
              "scene-collections.ts",
            ),
            "utf8",
          );

        expect(
          source,
        ).not.toMatch(
          /AsyncStorage|SecureStore|writeScenes|pending mutation|offline queue/i,
        );
      },
    );
  },
);
