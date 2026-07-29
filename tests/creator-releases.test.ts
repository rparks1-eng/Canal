import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  CreatorReleaseError,
  captureCreatorReleaseAccount,
  castCreatorReleaseVote,
  closeCreatorRelease,
  createCreatorRelease,
  listCreatorReleases,
  loadCreatorRelease,
  openCreatorRelease,
  readMyCreatorReleaseVote,
  respondCreatorReleaseCredit,
} from "../lib/creator-releases";

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
        details?: string | null;
        hint?: string | null;
      }
    | null;
};

const OWNER_ID =
  "00000000-0000-4000-8000-000000000001";
const LISTENER_ID =
  "00000000-0000-4000-8000-000000000002";
const CONTRIBUTOR_ID =
  "00000000-0000-4000-8000-000000000003";
const RELEASE_ID =
  "00000000-0000-4000-8000-000000000004";
const SECOND_RELEASE_ID =
  "00000000-0000-4000-8000-000000000005";
const COLLECTION_ID =
  "00000000-0000-4000-8000-000000000006";

const SCENE_ONE_ID =
  "scene-one";
const SCENE_TWO_ID =
  "scene-two";

const CREATED_AT =
  "2026-07-29T01:00:00.000Z";
const UPDATED_AT =
  "2026-07-29T01:01:00.000Z";
const OPENED_AT =
  "2026-07-29T01:02:00.000Z";
const CLOSED_AT =
  "2026-07-29T01:03:00.000Z";

const RELEASE_COLUMNS = [
  "id",
  "owner_id",
  "collection_id",
  "title",
  "description",
  "status",
  "opened_at",
  "closed_at",
  "winner_scene_id",
  "created_at",
  "updated_at",
].join(", ");

const RELEASE_CONTRIBUTOR_COLUMNS = [
  "release_id",
  "owner_id",
  "contributor_id",
  "status",
  "public_display_name",
  "public_handle",
  "responded_at",
  "created_at",
  "updated_at",
].join(", ");

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

function releaseRow(
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    id:
      RELEASE_ID,
    owner_id:
      OWNER_ID,
    collection_id:
      COLLECTION_ID,
    title:
      "  After Hours  ",
    description:
      "  Pick a favorite Scene.  ",
    status:
      "draft",
    opened_at:
      null,
    closed_at:
      null,
    winner_scene_id:
      null,
    created_at:
      CREATED_AT,
    updated_at:
      UPDATED_AT,
    ...overrides,
  };
}

function openReleaseRow(
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return releaseRow({
    status:
      "open",
    opened_at:
      OPENED_AT,
    ...overrides,
  });
}

function closedReleaseRow(
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return releaseRow({
    status:
      "closed",
    opened_at:
      OPENED_AT,
    closed_at:
      CLOSED_AT,
    ...overrides,
  });
}

function itemRow(
  position: number,
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    release_id:
      RELEASE_ID,
    owner_id:
      OWNER_ID,
    scene_id:
      position === 0
        ? SCENE_ONE_ID
        : SCENE_TWO_ID,
    scene_revision:
      position + 7,
    position,
    scene_title:
      position === 0
        ? "Blue Hour"
        : "Night Drive",
    created_at:
      OPENED_AT,
    ...overrides,
  };
}

function contributorRow(
  contributorId: string,
  status:
    | "pending"
    | "accepted"
    | "declined",
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    release_id:
      RELEASE_ID,
    owner_id:
      OWNER_ID,
    contributor_id:
      contributorId,
    status,
    public_display_name:
      status === "accepted"
        ? "Avery"
        : null,
    public_handle:
      status === "accepted"
        ? "avery_wav"
        : null,
    responded_at:
      status === "pending"
        ? null
        : UPDATED_AT,
    created_at:
      CREATED_AT,
    updated_at:
      UPDATED_AT,
    ...overrides,
  };
}

function resultRow(
  position: number,
  voteCount: number,
  isWinner: boolean,
  overrides:
    Record<string, unknown> =
      {},
): Record<string, unknown> {
  return {
    scene_id:
      position === 0
        ? SCENE_ONE_ID
        : SCENE_TWO_ID,
    scene_revision:
      position + 7,
    position,
    scene_title:
      position === 0
        ? "Blue Hour"
        : "Night Drive",
    vote_count:
      voteCount,
    is_winner:
      isWinner,
    ...overrides,
  };
}

function createQuery(
  result: QueryResult,
) {
  const promise =
    Promise.resolve(result);

  const query = {
    select:
      jest.fn(),
    eq:
      jest.fn(),
    in:
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
  query.in.mockReturnValue(
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

function queueOpenDetailQueries(
  contributors: unknown[] = [],
  profiles: unknown[] = [],
) {
  const releaseQuery =
    createQuery({
      data:
        openReleaseRow(),
      error:
        null,
    });
  const itemQuery =
    createQuery({
      data: [
        itemRow(0),
        itemRow(1),
      ],
      error:
        null,
    });
  const contributorQuery =
    createQuery({
      data:
        contributors,
      error:
        null,
    });

  mockFrom
    .mockReturnValueOnce(
      releaseQuery as never,
    )
    .mockReturnValueOnce(
      itemQuery as never,
    )
    .mockReturnValueOnce(
      contributorQuery as never,
    );

  if (contributors.length > 0) {
    mockFrom.mockReturnValueOnce(
      createQuery({
        data:
          profiles,
        error:
          null,
      }) as never,
    );
  }

  return {
    releaseQuery,
    itemQuery,
    contributorQuery,
  };
}

describe(
  "Release Ballot client service",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      authenticateAs(
        OWNER_ID,
      );
    });

    it(
      "lists bounded, explicitly selected releases without returning raw fields",
      async () => {
        const query =
          createQuery({
            data: [
              releaseRow({
                access_token:
                  "must-not-leak",
                votes: [
                  {
                    voter_id:
                      LISTENER_ID,
                  },
                ],
              }),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        const releases =
          await listCreatorReleases({
            limit:
              12,
          });

        expect(releases).toEqual([
          {
            id:
              RELEASE_ID,
            ownerId:
              OWNER_ID,
            collectionId:
              COLLECTION_ID,
            title:
              "After Hours",
            description:
              "Pick a favorite Scene.",
            status:
              "draft",
            openedAt:
              null,
            closedAt:
              null,
            winnerSceneId:
              null,
            createdAt:
              CREATED_AT,
            updatedAt:
              UPDATED_AT,
          },
        ]);

        expect(mockFrom).toHaveBeenCalledWith(
          "creator_releases",
        );
        expect(query.select).toHaveBeenCalledWith(
          RELEASE_COLUMNS,
        );
        expect(query.limit).toHaveBeenCalledWith(
          12,
        );
        expect(
          JSON.stringify(releases),
        ).not.toMatch(
          /access_token|voter_id|must-not-leak/u,
        );
      },
    );

    it(
      "creates with normalized bounded input and one captured actor",
      async () => {
        mockGetUser
          .mockResolvedValueOnce({
            data: {
              user: {
                id:
                  OWNER_ID,
              },
            },
            error:
              null,
          } as never)
          .mockResolvedValueOnce({
            data: {
              user: {
                id:
                  OWNER_ID,
              },
            },
            error:
              null,
          } as never)
          .mockResolvedValueOnce({
            data: {
              user: {
                id:
                  OWNER_ID,
              },
            },
            error:
              null,
          } as never);

        mockRpc.mockResolvedValueOnce(
          {
            data:
              releaseRow({
                raw_payload: {
                  access_token:
                    "secret",
                },
              }),
            error:
              null,
          } as never,
        );

        const release =
          await createCreatorRelease({
            collectionId:
              `  ${COLLECTION_ID}  `,
            title:
              "  After Hours  ",
            description:
              "  Pick a favorite Scene.  ",
          });

        expect(mockRpc).toHaveBeenCalledWith(
          "create_creator_release",
          {
            collection_id_value:
              COLLECTION_ID,
            title_value:
              "After Hours",
            description_value:
              "Pick a favorite Scene.",
            expected_actor_id_value:
              OWNER_ID,
          },
        );
        expect(mockGetUser).toHaveBeenCalledTimes(
          3,
        );
        expect(
          JSON.stringify(release),
        ).not.toMatch(
          /raw_payload|access_token|secret/u,
        );
      },
    );

    it(
      "opens with the exact authenticated RPC payload",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              openReleaseRow(),
            error:
              null,
          } as never,
        );

        await expect(
          openCreatorRelease(
            RELEASE_ID,
          ),
        ).resolves.toMatchObject({
          id:
            RELEASE_ID,
          status:
            "open",
        });

        expect(mockRpc).toHaveBeenCalledWith(
          "open_creator_release",
          {
            release_id_value:
              RELEASE_ID,
            expected_actor_id_value:
              OWNER_ID,
          },
        );
      },
    );

    it(
      "responds to contributor credit with no profile invention",
      async () => {
        authenticateAs(
          CONTRIBUTOR_ID,
        );

        mockRpc.mockResolvedValueOnce(
          {
            data:
              contributorRow(
                CONTRIBUTOR_ID,
                "accepted",
                {
                  token:
                    "not-public",
                },
              ),
            error:
              null,
          } as never,
        );

        const contributor =
          await respondCreatorReleaseCredit(
            RELEASE_ID,
            "accepted",
          );

        expect(mockRpc).toHaveBeenCalledWith(
          "respond_creator_release_credit",
          {
            release_id_value:
              RELEASE_ID,
            response_value:
              "accepted",
            expected_actor_id_value:
              CONTRIBUTOR_ID,
          },
        );
        expect(contributor).toEqual({
          releaseId:
            RELEASE_ID,
          contributorId:
            CONTRIBUTOR_ID,
          status:
            "accepted",
          respondedAt:
            UPDATED_AT,
          createdAt:
            CREATED_AT,
          updatedAt:
            UPDATED_AT,
          profile: {
            id:
              CONTRIBUTOR_ID,
            displayName:
              "Avery",
            handle:
              "@avery_wav",
            avatarUrl:
              null,
          },
        });
        expect(
          JSON.stringify(contributor),
        ).not.toContain(
          "not-public",
        );
      },
    );

    it(
      "casts or changes a vote while accepting only a scene-only result",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        mockRpc.mockResolvedValueOnce(
          {
            data:
              SCENE_TWO_ID,
            error:
              null,
          } as never,
        );

        const selectedSceneId =
          await castCreatorReleaseVote(
            RELEASE_ID,
            SCENE_TWO_ID,
          );

        expect(mockRpc).toHaveBeenCalledWith(
          "cast_creator_release_vote",
          {
            release_id_value:
              RELEASE_ID,
            scene_id_value:
              SCENE_TWO_ID,
            expected_actor_id_value:
              LISTENER_ID,
          },
        );
        expect(selectedSceneId).toBe(
          SCENE_TWO_ID,
        );
        expect(
          JSON.stringify(
            selectedSceneId,
          ),
        ).not.toContain(
          "voter",
        );
      },
    );

    it(
      "closes with the exact authenticated RPC payload",
      async () => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              closedReleaseRow(),
            error:
              null,
          } as never,
        );

        await expect(
          closeCreatorRelease(
            RELEASE_ID,
          ),
        ).resolves.toMatchObject({
          status:
            "closed",
        });

        expect(mockRpc).toHaveBeenCalledWith(
          "close_creator_release",
          {
            release_id_value:
              RELEASE_ID,
            expected_actor_id_value:
              OWNER_ID,
          },
        );
      },
    );

    it(
      "reads only the caller's selected Scene through the safe RPC",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        mockRpc.mockResolvedValueOnce(
          {
            data:
              SCENE_ONE_ID,
            error:
              null,
          } as never,
        );

        await expect(
          readMyCreatorReleaseVote(
            RELEASE_ID,
          ),
        ).resolves.toBe(
          SCENE_ONE_ID,
        );

        expect(mockRpc).toHaveBeenCalledWith(
          "read_my_creator_release_vote",
          {
            release_id_value:
              RELEASE_ID,
            expected_actor_id_value:
              LISTENER_ID,
          },
        );
      },
    );

    it(
      "loads an open ballot with frozen items, safe credits, and only the caller's vote",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        const queries =
          queueOpenDetailQueries(
            [
              contributorRow(
                CONTRIBUTOR_ID,
                "accepted",
                {
                  public_display_name:
                    "Consented Avery",
                  public_handle:
                    "avery_credit",
                },
              ),
              contributorRow(
                LISTENER_ID,
                "pending",
              ),
            ],
            [
              {
                id:
                  CONTRIBUTOR_ID,
                display_name:
                  "Private Changed Name",
                handle:
                  "changed_handle",
                avatar_url:
                  "https://example.com/avatar.png",
                refresh_token:
                  "do-not-leak",
              },
              {
                id:
                  LISTENER_ID,
                display_name:
                  null,
                handle:
                  "listener_1",
                avatar_url:
                  "javascript:alert(1)",
              },
            ],
          );

        mockRpc.mockResolvedValueOnce(
          {
            data:
              SCENE_TWO_ID,
            error:
              null,
          } as never,
        );

        const detail =
          await loadCreatorRelease(
            RELEASE_ID,
          );

        expect(detail).toMatchObject({
          id:
            RELEASE_ID,
          status:
            "open",
          itemCount:
            2,
          viewerContributorStatus:
            "pending",
          selectedVoteSceneId:
            SCENE_TWO_ID,
          results:
            null,
        });
        expect(detail.items).toEqual([
          {
            releaseId:
              RELEASE_ID,
            sceneId:
              SCENE_ONE_ID,
            sceneRevision:
              7,
            position:
              0,
            title:
              "Blue Hour",
          },
          {
            releaseId:
              RELEASE_ID,
            sceneId:
              SCENE_TWO_ID,
            sceneRevision:
              8,
            position:
              1,
            title:
              "Night Drive",
          },
        ]);
        expect(
          detail.contributors[0].profile,
        ).toEqual({
          id:
            CONTRIBUTOR_ID,
          displayName:
            "Consented Avery",
          handle:
            "@avery_credit",
          avatarUrl:
            "https://example.com/avatar.png",
        });
        expect(
          detail.contributors[1].profile,
        ).toMatchObject({
          displayName:
            "@listener_1",
          handle:
            "@listener_1",
          avatarUrl:
            null,
        });
        expect(mockRpc).toHaveBeenCalledTimes(
          1,
        );
        expect(mockRpc).toHaveBeenCalledWith(
          "read_my_creator_release_vote",
          {
            release_id_value:
              RELEASE_ID,
            expected_actor_id_value:
              LISTENER_ID,
          },
        );
        expect(
          queries.itemQuery.order,
        ).toHaveBeenCalledWith(
          "position",
          {
            ascending:
            true,
          },
        );
        expect(
          queries.contributorQuery.select,
        ).toHaveBeenCalledWith(
          RELEASE_CONTRIBUTOR_COLUMNS,
        );

        const serialized =
          JSON.stringify(detail);

        expect(serialized).not.toMatch(
          /vote_count|voter_id|refresh_token|do-not-leak|Private Changed Name|changed_handle/u,
        );
      },
    );

    it(
      "keeps accepted public credit visible when profile RLS returns no row",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        queueOpenDetailQueries(
          [
            contributorRow(
              CONTRIBUTOR_ID,
              "accepted",
              {
                public_display_name:
                  "Public Credit",
                public_handle:
                  "public_credit",
                private_profile_payload: {
                  email:
                    "private@example.com",
                },
              },
            ),
          ],
          [],
        );

        mockRpc.mockResolvedValueOnce(
          {
            data:
              null,
            error:
              null,
          } as never,
        );

        const detail =
          await loadCreatorRelease(
            RELEASE_ID,
          );

        expect(detail.contributors).toEqual([
          {
            releaseId:
              RELEASE_ID,
            contributorId:
              CONTRIBUTOR_ID,
            status:
              "accepted",
            respondedAt:
              UPDATED_AT,
            createdAt:
              CREATED_AT,
            updatedAt:
              UPDATED_AT,
            profile: {
              id:
                CONTRIBUTOR_ID,
              displayName:
                "Public Credit",
              handle:
                "@public_credit",
              avatarUrl:
                null,
            },
          },
        ]);
        expect(
          JSON.stringify(detail),
        ).not.toMatch(
          /private_profile_payload|private@example[.]com|public_display_name|public_handle/u,
        );
      },
    );

    it.each([
      {
        status:
          "pending" as const,
        respondedAt:
          null,
      },
      {
        status:
          "declined" as const,
        respondedAt:
          UPDATED_AT,
      },
    ])(
      "rejects leaked public snapshots on a $status credit row",
      async ({
        status,
        respondedAt,
      }) => {
        authenticateAs(
          LISTENER_ID,
        );

        mockFrom
          .mockReturnValueOnce(
            createQuery({
              data:
                openReleaseRow(),
              error:
                null,
            }) as never,
          )
          .mockReturnValueOnce(
            createQuery({
              data: [
                itemRow(0),
                itemRow(1),
              ],
              error:
                null,
            }) as never,
          )
          .mockReturnValueOnce(
            createQuery({
              data: [
                contributorRow(
                  CONTRIBUTOR_ID,
                  status,
                  {
                    responded_at:
                      respondedAt,
                    public_display_name:
                      "Must Not Appear",
                    public_handle:
                      "must_not_appear",
                  },
                ),
              ],
              error:
                null,
            }) as never,
          );

        await expect(
          loadCreatorRelease(
            RELEASE_ID,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });

        expect(mockRpc).not.toHaveBeenCalled();
      },
    );

    it(
      "never calls a result RPC or exposes counts while voting is open",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );
        queueOpenDetailQueries();

        mockRpc.mockResolvedValueOnce(
          {
            data:
              null,
            error:
              null,
          } as never,
        );

        const detail =
          await loadCreatorRelease(
            RELEASE_ID,
          );

        expect(detail.results).toBeNull();
        expect(mockRpc).not.toHaveBeenCalledWith(
          "read_creator_release_results",
          expect.anything(),
        );
        expect(
          JSON.stringify(detail),
        ).not.toMatch(
          /totalVotes|voteCount|isWinner/u,
        );
      },
    );

    it(
      "exposes aggregate-only ordered results after closure",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        mockFrom
          .mockReturnValueOnce(
            createQuery({
              data:
                closedReleaseRow({
                  winner_scene_id:
                    SCENE_TWO_ID,
              }),
              error:
                null,
            }) as never,
          )
          .mockReturnValueOnce(
            createQuery({
              data: [
                itemRow(0),
                itemRow(1),
              ],
              error:
                null,
            }) as never,
          )
          .mockReturnValueOnce(
            createQuery({
              data:
                [],
              error:
                null,
            }) as never,
          );

        mockRpc.mockResolvedValueOnce(
          {
            data: [
              resultRow(
                0,
                1,
                false,
                {
                  voter_ids: [
                    LISTENER_ID,
                  ],
                },
              ),
              resultRow(
                1,
                2,
                true,
              ),
            ],
            error:
              null,
          } as never,
        );

        const detail =
          await loadCreatorRelease(
            RELEASE_ID,
          );

        expect(mockRpc).toHaveBeenCalledTimes(
          1,
        );
        expect(mockRpc).toHaveBeenCalledWith(
          "read_creator_release_results",
          {
            release_id_value:
              RELEASE_ID,
            expected_actor_id_value:
              LISTENER_ID,
          },
        );
        expect(detail.selectedVoteSceneId).toBeNull();
        expect(detail.results).toEqual({
          releaseId:
            RELEASE_ID,
          totalVotes:
            3,
          winnerSceneId:
            SCENE_TWO_ID,
          winnerSceneIds: [
            SCENE_TWO_ID,
          ],
          items: [
            {
              releaseId:
                RELEASE_ID,
              sceneId:
                SCENE_ONE_ID,
              sceneRevision:
                7,
              position:
                0,
              title:
                "Blue Hour",
              voteCount:
                1,
              isWinner:
                false,
            },
            {
              releaseId:
                RELEASE_ID,
              sceneId:
                SCENE_TWO_ID,
              sceneRevision:
                8,
              position:
                1,
              title:
                "Night Drive",
              voteCount:
                2,
              isWinner:
                true,
            },
          ],
        });
        expect(
          JSON.stringify(detail.results),
        ).not.toContain(
          LISTENER_ID,
        );
      },
    );

    it(
      "rejects duplicate release rows",
      async () => {
        mockFrom.mockReturnValueOnce(
          createQuery({
            data: [
              releaseRow(),
              releaseRow(),
            ],
            error:
              null,
          }) as never,
        );

        await expect(
          listCreatorReleases(),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });
      },
    );

    it.each([
      {
        label:
          "an invalid status",
        row:
          releaseRow({
            status:
              "published",
          }),
      },
      {
        label:
          "open timestamps on a draft",
        row:
          releaseRow({
            opened_at:
              OPENED_AT,
          }),
      },
      {
        label:
          "a malformed owner",
        row:
          releaseRow({
            owner_id:
              "not-a-uuid",
          }),
      },
      {
        label:
          "an overlong title",
        row:
          releaseRow({
            title:
              "x".repeat(81),
          }),
      },
    ])(
      "rejects $label in a server row",
      async ({
        row,
      }) => {
        mockFrom.mockReturnValueOnce(
          createQuery({
            data: [
              row,
            ],
            error:
              null,
          }) as never,
        );

        await expect(
          listCreatorReleases(),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });
      },
    );

    it(
      "rejects non-contiguous or duplicate frozen item order",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        mockFrom
          .mockReturnValueOnce(
            createQuery({
              data:
                openReleaseRow(),
              error:
                null,
            }) as never,
          )
          .mockReturnValueOnce(
            createQuery({
              data: [
                itemRow(
                  1,
                  {
                    scene_id:
                      SCENE_ONE_ID,
                  },
                ),
                itemRow(
                  1,
                  {
                    scene_id:
                      SCENE_ONE_ID,
                  },
                ),
              ],
              error:
                null,
            }) as never,
          );

        await expect(
          loadCreatorRelease(
            RELEASE_ID,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });

        expect(mockRpc).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects result rows that do not exactly match frozen order and revision",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        mockFrom
          .mockReturnValueOnce(
            createQuery({
              data:
                closedReleaseRow({
                  winner_scene_id:
                    SCENE_TWO_ID,
              }),
              error:
                null,
            }) as never,
          )
          .mockReturnValueOnce(
            createQuery({
              data: [
                itemRow(0),
                itemRow(1),
              ],
              error:
                null,
            }) as never,
          )
          .mockReturnValueOnce(
            createQuery({
              data:
                [],
              error:
                null,
            }) as never,
          );

        mockRpc.mockResolvedValueOnce(
          {
            data: [
              resultRow(
                0,
                1,
                false,
              ),
              resultRow(
                1,
                2,
                true,
                {
                  scene_revision:
                    999,
                },
              ),
            ],
            error:
              null,
          } as never,
        );

        await expect(
          loadCreatorRelease(
            RELEASE_ID,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });
      },
    );

    it(
      "rejects a caller-only vote that is not one of the frozen items",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );
        queueOpenDetailQueries();

        mockRpc.mockResolvedValueOnce(
          {
            data:
              "different-scene",
            error:
              null,
          } as never,
        );

        await expect(
          loadCreatorRelease(
            RELEASE_ID,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });
      },
    );

    it(
      "rejects malformed input before any database RPC",
      async () => {
        await expect(
          createCreatorRelease({
            collectionId:
              "not-a-uuid",
            title:
              "Release",
            description:
              "",
          }),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        await expect(
          createCreatorRelease({
            collectionId:
              COLLECTION_ID,
            title:
              "x".repeat(81),
            description:
              "",
          }),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        await expect(
          createCreatorRelease({
            collectionId:
              COLLECTION_ID,
            title:
              "Release",
            description:
              null as never,
          }),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        await expect(
          respondCreatorReleaseCredit(
            RELEASE_ID,
            "pending" as never,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        await expect(
          castCreatorReleaseVote(
            RELEASE_ID,
            "bad\u0000scene",
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-input",
        });

        expect(mockRpc).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        code:
          "22023",
        message:
          "invalid",
        kind:
          "invalid-input",
      },
      {
        code:
          "42501",
        message:
          "permission denied",
        kind:
          "permission-denied",
      },
      {
        code:
          "42501",
        message:
          "reciprocal block prevents access",
        kind:
          "blocked",
      },
      {
        code:
          "P0002",
        message:
          "missing",
        kind:
          "not-found",
      },
      {
        code:
          "40001",
        message:
          "stale",
        kind:
          "conflict",
      },
    ])(
      "maps permanent database code $code to $kind",
      async ({
        code,
        message,
        kind,
      }) => {
        mockRpc.mockResolvedValueOnce(
          {
            data:
              null,
            error: {
              code,
              message,
              details:
                "raw payload must not leak",
            },
          } as never,
        );

        let thrown: unknown;

        try {
          await createCreatorRelease({
            collectionId:
              COLLECTION_ID,
            title:
              "After Hours",
            description:
              "",
          });
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toMatchObject({
          kind,
          databaseCode:
            code,
        });
        expect(
          (thrown as Error).message,
        ).not.toContain(
          "raw payload must not leak",
        );
      },
    );

    it(
      "maps rejected connectivity to a retryable request failure without raw leakage",
      async () => {
        mockRpc.mockRejectedValueOnce(
          new TypeError(
            "Network request failed with token=raw-secret",
          ) as never,
        );

        let thrown: unknown;

        try {
          await createCreatorRelease({
            collectionId:
              COLLECTION_ID,
            title:
              "After Hours",
            description:
              "",
          });
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(
          CreatorReleaseError,
        );
        expect(thrown).toMatchObject({
          kind:
            "request-failed",
          retryable:
            true,
        });
        expect(
          (thrown as Error).message,
        ).not.toMatch(
          /raw-secret|token=/u,
        );
      },
    );

    it(
      "rejects an account changed before a mutation starts",
      async () => {
        const account =
          await captureCreatorReleaseAccount(
            OWNER_ID,
          );

        authenticateAs(
          LISTENER_ID,
        );

        await expect(
          openCreatorRelease(
            RELEASE_ID,
            {
              account,
            },
          ),
        ).rejects.toMatchObject({
          kind:
            "account-changed",
        });
        expect(mockRpc).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects a deferred mutation when the account changes during the RPC",
      async () => {
        let resolveRpc!: (
          value: unknown,
        ) => void;
        let markRpcStarted!: () => void;
        const rpcPromise =
          new Promise<unknown>((resolve) => {
            resolveRpc = resolve;
          });
        const rpcStarted =
          new Promise<void>((resolve) => {
            markRpcStarted = resolve;
          });

        mockRpc.mockImplementationOnce(
          (() => {
            markRpcStarted();

            return rpcPromise;
          }) as never,
        );

        const operation =
          openCreatorRelease(
            RELEASE_ID,
          );

        await rpcStarted;

        expect(mockRpc).toHaveBeenCalledTimes(
          1,
        );

        authenticateAs(
          LISTENER_ID,
        );

        resolveRpc({
          data:
            openReleaseRow(),
          error:
            null,
        });

        await expect(
          operation,
        ).rejects.toMatchObject({
          kind:
            "account-changed",
        });
      },
    );

    it(
      "rejects a changed expected account after capture",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        await expect(
          captureCreatorReleaseAccount(
            OWNER_ID,
          ),
        ).rejects.toMatchObject({
          kind:
            "account-changed",
        });
      },
    );

    it(
      "rejects a cast response for a different Scene and never accepts a voter payload",
      async () => {
        authenticateAs(
          LISTENER_ID,
        );

        mockRpc.mockResolvedValueOnce(
          {
            data: {
              release_id:
                RELEASE_ID,
              voter_id:
                LISTENER_ID,
              scene_id:
                SCENE_TWO_ID,
            },
            error:
              null,
          } as never,
        ).mockResolvedValueOnce(
          {
            data:
              SCENE_ONE_ID,
            error:
              null,
          } as never,
        );

        await expect(
          castCreatorReleaseVote(
            RELEASE_ID,
            SCENE_TWO_ID,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });

        await expect(
          castCreatorReleaseVote(
            RELEASE_ID,
            SCENE_TWO_ID,
          ),
        ).rejects.toMatchObject({
          kind:
            "invalid-response",
        });
      },
    );

    it(
      "keeps separate releases distinct while rejecting duplicate IDs",
      async () => {
        mockFrom.mockReturnValueOnce(
          createQuery({
            data: [
              releaseRow(),
              releaseRow({
                id:
                  SECOND_RELEASE_ID,
              }),
            ],
            error:
              null,
          }) as never,
        );

        await expect(
          listCreatorReleases(),
        ).resolves.toHaveLength(
          2,
        );
      },
    );
  },
);
