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
  loadProfileConnectionSummary,
  loadProfileFollowState,
  loadProfileFollowers,
  setViewerFollowingProfile,
} from "../lib/profile-social";

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
    },
  }),
);

type QueryError = {
  message: string;
};

type QueryResult = {
  data?: unknown;
  error:
    | QueryError
    | null;
  count?: number | null;
};

type MockQuery = {
  select: ReturnType<
    typeof jest.fn
  >;
  eq: ReturnType<
    typeof jest.fn
  >;
  not: ReturnType<
    typeof jest.fn
  >;
  in: ReturnType<
    typeof jest.fn
  >;
  order: ReturnType<
    typeof jest.fn
  >;
  range: ReturnType<
    typeof jest.fn
  >;
  limit: ReturnType<
    typeof jest.fn
  >;
  is: ReturnType<
    typeof jest.fn
  >;
  insert: ReturnType<
    typeof jest.fn
  >;
  update: ReturnType<
    typeof jest.fn
  >;
  delete: ReturnType<
    typeof jest.fn
  >;
  single: ReturnType<
    typeof jest.fn
  >;
  maybeSingle: ReturnType<
    typeof jest.fn
  >;
  then:
    Promise<QueryResult>["then"];
};

const VIEWER_ID =
  "00000000-0000-4000-8000-000000000001";

const TARGET_ID =
  "00000000-0000-4000-8000-000000000002";

const NEXT_VIEWER_ID =
  "00000000-0000-4000-8000-000000000005";

const PUBLIC_FOLLOWER_ID =
  "00000000-0000-4000-8000-000000000003";

const HIDDEN_FOLLOWER_ID =
  "00000000-0000-4000-8000-000000000004";

const mockGetUser =
  jest.mocked(
    supabase.auth.getUser,
  );

const mockFrom =
  jest.mocked(
    supabase.from,
  );

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
    not:
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
    range:
      jest.fn(
        () => query,
      ),
    limit:
      jest.fn(
        () => query,
      ),
    is:
      jest.fn(
        () => query,
      ),
    insert:
      jest.fn(
        () => query,
      ),
    update:
      jest.fn(
        () => query,
      ),
    delete:
      jest.fn(
        () => query,
      ),
    single:
      jest.fn(
        async () =>
          result,
      ),
    maybeSingle:
      jest.fn(
        async () =>
          result,
      ),
    then:
      resultPromise.then.bind(
        resultPromise,
      ),
  };

  return query;
}

function createDeferredQuery(): {
  query: MockQuery;
  resolve: (
    result: QueryResult,
  ) => void;
  started: Promise<void>;
} {
  let resolveResult:
    | ((
        result: QueryResult,
      ) => void)
    | undefined;

  let markStarted:
    | (() => void)
    | undefined;

  const resultPromise =
    new Promise<QueryResult>(
      (resolve) => {
        resolveResult =
          resolve;
      },
    );

  const started =
    new Promise<void>(
      (resolve) => {
        markStarted =
          resolve;
      },
    );

  const query =
    createQuery({
      error:
        null,
    });

  query.maybeSingle =
    jest.fn(
      () => {
        markStarted?.();
        return resultPromise;
      },
    );

  query.then =
    resultPromise.then.bind(
      resultPromise,
    );

  return {
    query,
    resolve: (
      result,
    ) => {
      resolveResult?.(
        result,
      );
    },
    started,
  };
}

function publicProfileRow(
  id: string,
) {
  return {
    id,
    display_name:
      "Public Listener",
    handle:
      "public_listener",
    avatar_url:
      null,
    bio:
      "Public profile",
    favorite_activities:
      "Focus",
    is_public:
      true,
    is_verified:
      true,
    is_canal:
      false,
  };
}

describe(
  "profile social Supabase contract",
  () => {
    beforeEach(() => {
      mockGetUser.mockReset();
      mockFrom.mockReset();

      mockGetUser.mockResolvedValue(
        {
          data: {
            user: {
              id:
                VIEWER_ID,
            },
          },
          error:
            null,
        } as never,
      );
    });

    it(
      "scopes connection counts to the selected profile and follow state to the viewer",
      async () => {
        const followingCountQuery =
          createQuery({
            count: 4,
            error:
              null,
          });

        const followerCountQuery =
          createQuery({
            count: 7,
            error:
              null,
          });

        const viewerStateQuery =
          createQuery({
            data: {
              target_user_id:
                TARGET_ID,
            },
            error:
              null,
          });

        mockFrom
          .mockImplementationOnce(
            () =>
              followingCountQuery as never,
          )
          .mockImplementationOnce(
            () =>
              followerCountQuery as never,
          )
          .mockImplementationOnce(
            () =>
              viewerStateQuery as never,
          );

        await expect(
          loadProfileConnectionSummary(
            TARGET_ID,
          ),
        ).resolves.toEqual({
          profileId:
            TARGET_ID,
          viewerId:
            VIEWER_ID,
          isOwnProfile:
            false,
          viewerIsFollowing:
            true,
          followingCount:
            4,
          followerCount:
            7,
        });

        expect(
          followingCountQuery.eq
            .mock.calls,
        ).toEqual([
          [
            "user_id",
            TARGET_ID,
          ],
          [
            "relationship_type",
            "following",
          ],
        ]);

        expect(
          followerCountQuery.eq
            .mock.calls,
        ).toEqual([
          [
            "target_user_id",
            TARGET_ID,
          ],
          [
            "relationship_type",
            "following",
          ],
        ]);

        expect(
          viewerStateQuery.eq
            .mock.calls,
        ).toEqual([
          [
            "user_id",
            VIEWER_ID,
          ],
          [
            "target_user_id",
            TARGET_ID,
          ],
          [
            "relationship_type",
            "following",
          ],
        ]);
      },
    );

    it(
      "rejects a deferred viewer-private follow state after the Canal account changes",
      async () => {
        const deferredQuery =
          createDeferredQuery();

        mockGetUser
          .mockResolvedValueOnce(
            {
              data: {
                user: {
                  id:
                    VIEWER_ID,
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
                    VIEWER_ID,
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
                    NEXT_VIEWER_ID,
                },
              },
              error:
                null,
            } as never,
          );

        mockFrom.mockReturnValueOnce(
          deferredQuery.query as never,
        );

        const followStatePromise =
          loadProfileFollowState(
            TARGET_ID,
          );

        const rejection =
          expect(
            followStatePromise,
          ).rejects.toThrow(
            "The signed-in Canal account changed while profile connections were loading.",
          );

        await deferredQuery.started;

        deferredQuery.resolve({
          data: {
            target_user_id:
              TARGET_ID,
          },
          error:
            null,
        });

        await rejection;

        expect(
          mockGetUser,
        ).toHaveBeenCalledTimes(
          3,
        );
      },
    );

    it(
      "hydrates only follower profiles visible through profile RLS",
      async () => {
        const followerRowsQuery =
          createQuery({
            data: [
              {
                user_id:
                  PUBLIC_FOLLOWER_ID,
                target_user_id:
                  TARGET_ID,
                created_at:
                  "2026-07-28T20:00:00.000Z",
              },
              {
                user_id:
                  HIDDEN_FOLLOWER_ID,
                target_user_id:
                  TARGET_ID,
                created_at:
                  "2026-07-28T19:00:00.000Z",
              },
            ],
            error:
              null,
          });

        const profileQuery =
          createQuery({
            data: [
              publicProfileRow(
                PUBLIC_FOLLOWER_ID,
              ),
            ],
            error:
              null,
          });

        const viewerFollowingQuery =
          createQuery({
            data: [
              {
                target_user_id:
                  PUBLIC_FOLLOWER_ID,
              },
            ],
            error:
              null,
          });

        mockFrom
          .mockImplementationOnce(
            () =>
              followerRowsQuery as never,
          )
          .mockImplementationOnce(
            () =>
              profileQuery as never,
          )
          .mockImplementationOnce(
            () =>
              viewerFollowingQuery as never,
          );

        const followers =
          await loadProfileFollowers(
            TARGET_ID,
          );

        expect(
          followers,
        ).toHaveLength(
          1,
        );

        expect(
          followers[0],
        ).toMatchObject({
          profile: {
            id:
              PUBLIC_FOLLOWER_ID,
            handle:
              "@public_listener",
            isPublic:
              true,
            isVerified:
              true,
          },
          viewerIsFollowing:
            true,
        });

        expect(
          followerRowsQuery.eq
            .mock.calls,
        ).toEqual([
          [
            "target_user_id",
            TARGET_ID,
          ],
          [
            "relationship_type",
            "following",
          ],
        ]);

        expect(
          profileQuery.in,
        ).toHaveBeenCalledWith(
          "id",
          [
            PUBLIC_FOLLOWER_ID,
            HIDDEN_FOLLOWER_ID,
          ],
        );
      },
    );

    it(
      "creates a follow owned by the authenticated viewer and keyed to the stable profile ID",
      async () => {
        const targetProfileQuery =
          createQuery({
            data: {
              ...publicProfileRow(
                TARGET_ID,
              ),
              handle:
                "Target_User",
            },
            error:
              null,
          });

        const existingByIdQuery =
          createQuery({
            data:
              null,
            error:
              null,
          });

        const existingByHandleQuery =
          createQuery({
            data:
              null,
            error:
              null,
          });

        const insertQuery =
          createQuery({
            error:
              null,
          });

        mockFrom
          .mockImplementationOnce(
            () =>
              targetProfileQuery as never,
          )
          .mockImplementationOnce(
            () =>
              existingByIdQuery as never,
          )
          .mockImplementationOnce(
            () =>
              existingByHandleQuery as never,
          )
          .mockImplementationOnce(
            () =>
              insertQuery as never,
          );

        await expect(
          setViewerFollowingProfile(
            TARGET_ID,
            true,
          ),
        ).resolves.toEqual({
          profileId:
            TARGET_ID,
          viewerId:
            VIEWER_ID,
          isOwnProfile:
            false,
          viewerIsFollowing:
            true,
        });

        expect(
          insertQuery.insert,
        ).toHaveBeenCalledWith({
          user_id:
            VIEWER_ID,
          target_user_id:
            TARGET_ID,
          target_username:
            "target_user",
          relationship_type:
            "following",
        });
      },
    );

    it(
      "deletes stable and legacy follow rows only for the authenticated viewer",
      async () => {
        const existingQuery =
          createQuery({
            data: {
              target_username:
                "Target_User",
            },
            error:
              null,
          });

        const stableDeleteQuery =
          createQuery({
            error:
              null,
          });

        const legacyDeleteQuery =
          createQuery({
            error:
              null,
          });

        mockFrom
          .mockImplementationOnce(
            () =>
              existingQuery as never,
          )
          .mockImplementationOnce(
            () =>
              stableDeleteQuery as never,
          )
          .mockImplementationOnce(
            () =>
              legacyDeleteQuery as never,
          );

        await expect(
          setViewerFollowingProfile(
            TARGET_ID,
            false,
          ),
        ).resolves.toEqual({
          profileId:
            TARGET_ID,
          viewerId:
            VIEWER_ID,
          isOwnProfile:
            false,
          viewerIsFollowing:
            false,
        });

        expect(
          stableDeleteQuery.eq
            .mock.calls,
        ).toEqual([
          [
            "user_id",
            VIEWER_ID,
          ],
          [
            "target_user_id",
            TARGET_ID,
          ],
          [
            "relationship_type",
            "following",
          ],
        ]);

        expect(
          legacyDeleteQuery.is,
        ).toHaveBeenCalledWith(
          "target_user_id",
          null,
        );

        expect(
          legacyDeleteQuery.eq
            .mock.calls,
        ).toEqual([
          [
            "user_id",
            VIEWER_ID,
          ],
          [
            "target_username",
            "target_user",
          ],
          [
            "relationship_type",
            "following",
          ],
        ]);
      },
    );

    it(
      "rejects a non-public target before writing a follow",
      async () => {
        const privateTargetQuery =
          createQuery({
            data: {
              ...publicProfileRow(
                TARGET_ID,
              ),
              is_public:
                false,
            },
            error:
              null,
          });

        mockFrom.mockImplementationOnce(
          () =>
            privateTargetQuery as never,
        );

        await expect(
          setViewerFollowingProfile(
            TARGET_ID,
            true,
          ),
        ).rejects.toThrow(
          "Only public Canal profiles can be followed.",
        );

        expect(
          mockFrom,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "reloads and masks an explicit-profile connection route when the viewer account changes",
      () => {
        const source =
          readFileSync(
            join(
              process.cwd(),
              "app",
              "following.tsx",
            ),
            "utf8",
          );

        expect(
          source,
        ).toMatch(
          /const viewerId\s*=\s*user\?\.id\s*\?\?\s*"";/,
        );

        expect(
          source,
        ).toMatch(
          /const profileId\s*=\s*explicitProfileId\s*\|\|\s*viewerId;/,
        );

        expect(
          source,
        ).toMatch(
          /const loadIdentity\s*=\s*\[\s*viewerId,\s*profileId,\s*mode,\s*\]\.join/,
        );

        expect(
          source,
        ).toMatch(
          /captureProfileSocialAccount\(\s*viewerId,\s*\)/,
        );

        expect(
          source,
        ).toMatch(
          /loadedIdentity\s*===\s*loadIdentity/,
        );

        expect(
          source,
        ).toMatch(
          /\[\s*loadIdentity,\s*mode,\s*profileId,\s*viewerId,\s*\]/,
        );
      },
    );
  },
);
