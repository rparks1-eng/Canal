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
  captureSceneCollaborationAccount,
  inviteSceneCollaborator,
  isSceneRevisionConflictError,
  listIncomingSceneCollaborations,
  listSceneCollaborators,
  loadCollaborativeScene,
  normalizeSceneCollaboratorHandle,
  respondToSceneCollaboration,
  revokeSceneCollaborator,
  saveCollaborativeScene,
  SceneRevisionConflictError,
} from "../lib/scene-collaboration";

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

type QueryError = {
  code?: string;
  message: string;
  details?: string | null;
};

type QueryResult = {
  data?: unknown;
  error:
    | QueryError
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
  order: ReturnType<
    typeof jest.fn
  >;
  limit: ReturnType<
    typeof jest.fn
  >;
  then:
    Promise<QueryResult>["then"];
};

const OWNER_ID =
  "00000000-0000-4000-8000-000000000001";

const COLLABORATOR_ID =
  "00000000-0000-4000-8000-000000000002";

const NEXT_USER_ID =
  "00000000-0000-4000-8000-000000000003";

const SCENE_ID =
  "scene/shared-focus";

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

function collaborationRow(
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    scene_owner_id:
      OWNER_ID,
    scene_id:
      SCENE_ID,
    collaborator_id:
      COLLABORATOR_ID,
    status:
      "pending",
    invited_by:
      OWNER_ID,
    created_at:
      CREATED_AT,
    updated_at:
      UPDATED_AT,
    responded_at:
      null,
    ...overrides,
  };
}

function collaborativeSceneRow(
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    user_id:
      OWNER_ID,
    id:
      SCENE_ID,
    payload: {
      id:
        SCENE_ID,
      ownerId:
        OWNER_ID,
      name:
        "Shared Focus",
      tracks: [],
      visibility:
        "private",
      libraryType:
        "collaborative",
    },
    revision:
      5,
    created_at:
      CREATED_AT,
    updated_at:
      UPDATED_AT,
    deleted_at:
      null,
    ...overrides,
  };
}

function createQuery(
  result: QueryResult,
): MockQuery {
  let query =
    {} as MockQuery;

  const resultPromise =
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
    order:
      jest.fn(
        () => query,
      ),
    limit:
      jest.fn(
        () => query,
      ),
    then:
      resultPromise.then.bind(
        resultPromise,
      ),
  };

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
  "Scene collaboration Supabase client",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      authenticateAs(
        OWNER_ID,
      );
    });

    it(
      "normalizes only an exact Canal handle",
      () => {
        expect(
          normalizeSceneCollaboratorHandle(
            "  @Creator_2  ",
          ),
        ).toBe(
          "creator_2",
        );

        expect(
          () =>
            normalizeSceneCollaboratorHandle(
              "@creator-name",
            ),
        ).toThrow(
          "exact Canal handle",
        );

        expect(
          () =>
            normalizeSceneCollaboratorHandle(
              "@@creator",
            ),
        ).toThrow(
          "exact Canal handle",
        );
      },
    );

    it(
      "lists incoming pending and accepted collaborations for the captured account",
      async () => {
        authenticateAs(
          COLLABORATOR_ID,
        );

        const query =
          createQuery({
            data: [
              collaborationRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          listIncomingSceneCollaborations(),
        ).resolves.toEqual([
          {
            sceneOwnerId:
              OWNER_ID,
            sceneId:
              SCENE_ID,
            collaboratorId:
              COLLABORATOR_ID,
            status:
              "pending",
            invitedBy:
              OWNER_ID,
            createdAt:
              CREATED_AT,
            updatedAt:
              UPDATED_AT,
            respondedAt:
              null,
          },
        ]);

        expect(
          mockFrom,
        ).toHaveBeenCalledWith(
          "scene_collaborators",
        );

        expect(
          query.eq,
        ).toHaveBeenCalledWith(
          "collaborator_id",
          COLLABORATOR_ID,
        );

        expect(
          query.in,
        ).toHaveBeenCalledWith(
          "status",
          [
            "pending",
            "accepted",
          ],
        );

        expect(
          query.limit,
        ).toHaveBeenCalledWith(
          100,
        );
      },
    );

    it(
      "lists one Scene's collaborators by canonical owner and Scene identity",
      async () => {
        const query =
          createQuery({
            data: [
              collaborationRow({
                status:
                  "accepted",
                responded_at:
                  UPDATED_AT,
              }),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        const result =
          await listSceneCollaborators(
            OWNER_ID.toUpperCase(),
            ` ${SCENE_ID} `,
            {
              limit:
                12,
            },
          );

        expect(
          result[0],
        ).toMatchObject({
          status:
            "accepted",
          respondedAt:
            UPDATED_AT,
        });

        expect(
          query.eq.mock.calls,
        ).toEqual([
          [
            "scene_owner_id",
            OWNER_ID,
          ],
          [
            "scene_id",
            SCENE_ID,
          ],
        ]);

        expect(
          query.limit,
        ).toHaveBeenCalledWith(
          12,
        );
      },
    );

    it(
      "loads one accepted collaborative Scene by composite identity",
      async () => {
        authenticateAs(
          COLLABORATOR_ID,
        );

        const query =
          createQuery({
            data: [
              collaborativeSceneRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          loadCollaborativeScene(
            OWNER_ID,
            SCENE_ID,
          ),
        ).resolves.toMatchObject({
          ownerId:
            OWNER_ID,
          sceneId:
            SCENE_ID,
          revision:
            5,
          scene: {
            name:
              "Shared Focus",
          },
        });

        expect(
          mockFrom,
        ).toHaveBeenCalledWith(
          "scenes",
        );

        expect(
          query.eq.mock.calls,
        ).toEqual([
          [
            "user_id",
            OWNER_ID,
          ],
          [
            "id",
            SCENE_ID,
          ],
        ]);
      },
    );

    it(
      "invites by exact normalized handle through the owner RPC",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              collaborationRow(),
            error:
              null,
          } as never,
        );

        await expect(
          inviteSceneCollaborator(
            OWNER_ID,
            SCENE_ID,
            " @Listener_2 ",
          ),
        ).resolves.toMatchObject({
          collaboratorId:
            COLLABORATOR_ID,
          status:
            "pending",
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "invite_scene_collaborator",
          {
            scene_owner_id_value:
              OWNER_ID,
            scene_id_value:
              SCENE_ID,
            collaborator_handle_value:
              "listener_2",
          },
        );
      },
    );

    it(
      "responds with accepted or declined only",
      async () => {
        authenticateAs(
          COLLABORATOR_ID,
        );

        mockRpc.mockResolvedValueOnce(
          {
            data: [
              collaborationRow({
                status:
                  "accepted",
                responded_at:
                  UPDATED_AT,
              }),
            ],
            error:
              null,
          } as never,
        );

        await expect(
          respondToSceneCollaboration(
            OWNER_ID,
            SCENE_ID,
            "accepted",
          ),
        ).resolves.toMatchObject({
          status:
            "accepted",
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "respond_to_scene_collaboration",
          {
            scene_owner_id_value:
              OWNER_ID,
            scene_id_value:
              SCENE_ID,
            response_value:
              "accepted",
          },
        );

        await expect(
          respondToSceneCollaboration(
            OWNER_ID,
            SCENE_ID,
            "pending" as never,
          ),
        ).rejects.toThrow(
          "accepted or declined",
        );

        expect(
          mockRpc,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "revokes one exact collaborator through the owner RPC",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              collaborationRow({
                status:
                  "revoked",
                responded_at:
                  UPDATED_AT,
              }),
            error:
              null,
          } as never,
        );

        await expect(
          revokeSceneCollaborator(
            OWNER_ID,
            SCENE_ID,
            COLLABORATOR_ID,
          ),
        ).resolves.toMatchObject({
          status:
            "revoked",
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "revoke_scene_collaborator",
          {
            scene_owner_id_value:
              OWNER_ID,
            scene_id_value:
              SCENE_ID,
            collaborator_id_value:
              COLLABORATOR_ID,
          },
        );
      },
    );

    it(
      "saves a complete payload with an expected revision and returns the canonical revision",
      async () => {
        const payload = {
          id:
            SCENE_ID,
          ownerId:
            OWNER_ID,
          name:
            "Shared Focus",
          tracks: [],
          visibility:
            "private",
          libraryType:
            "collaborative",
        };

        mockRpc.mockResolvedValueOnce(
          {
            data:
              collaborativeSceneRow(),
            error:
              null,
          } as never,
        );

        const saved =
          await saveCollaborativeScene(
            OWNER_ID,
            SCENE_ID,
            4,
            payload,
          );

        expect(
          saved,
        ).toMatchObject({
          ownerId:
            OWNER_ID,
          sceneId:
            SCENE_ID,
          revision:
            5,
          scene: {
            id:
              SCENE_ID,
            ownerId:
              OWNER_ID,
            name:
              "Shared Focus",
          },
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "update_collaborative_scene",
          {
            scene_owner_id_value:
              OWNER_ID,
            scene_id_value:
              SCENE_ID,
            expected_revision_value:
              4,
            scene_payload_value:
              payload,
          },
        );
      },
    );

    it(
      "maps a serialization conflict to the typed revision error without retrying",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              null,
            error: {
              code:
                "40001",
              message:
                "SCENE_REVISION_CONFLICT",
              details:
                "expected revision: 4, current revision: 7",
            },
          } as never,
        );

        const result =
          saveCollaborativeScene(
            OWNER_ID,
            SCENE_ID,
            4,
            {
              id:
                SCENE_ID,
              ownerId:
                OWNER_ID,
              name:
                "Shared Focus",
              tracks: [],
            },
          );

        await expect(
          result,
        ).rejects.toMatchObject({
          name:
            "SceneRevisionConflictError",
          kind:
            "scene-revision-conflict",
          expectedRevision:
            4,
          currentRevision:
            7,
        });

        try {
          await result;
        } catch (error) {
          expect(
            isSceneRevisionConflictError(
              error,
            ),
          ).toBe(
            true,
          );

          expect(
            error,
          ).toBeInstanceOf(
            SceneRevisionConflictError,
          );
        }

        expect(
          mockRpc,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "rejects stale rows when the account changes after a cloud read",
      async () => {
        mockGetUser
          .mockResolvedValueOnce(
            {
              data: {
                user: {
                  id:
                    COLLABORATOR_ID,
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
                    COLLABORATOR_ID,
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
              collaborationRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          listIncomingSceneCollaborations(),
        ).rejects.toThrow(
          "signed-in Canal account changed",
        );
      },
    );

    it(
      "does not start a mutation for a captured account after sign-in changes",
      async () => {
        const account =
          await captureSceneCollaborationAccount();

        authenticateAs(
          NEXT_USER_ID,
        );

        await expect(
          inviteSceneCollaborator(
            OWNER_ID,
            SCENE_ID,
            "@listener_2",
            {
              account,
            },
          ),
        ).rejects.toThrow(
          "signed-in Canal account changed",
        );

        expect(
          mockRpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "never adds local or queued offline writes",
      () => {
        const source =
          readFileSync(
            join(
              process.cwd(),
              "lib",
              "scene-collaboration.ts",
            ),
            "utf8",
          );

        expect(
          source,
        ).not.toMatch(
          /AsyncStorage|SecureStore|writeScenes|uploadSceneToCloud|pending mutation/i,
        );
      },
    );
  },
);
