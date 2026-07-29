import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  captureScenePlaylistExportAccount,
  deleteScenePlaylistExport,
  readScenePlaylistExports,
  recordScenePlaylistExport,
} from "../lib/playlist-exports";

import type {
  StoredScene,
} from "../lib/scenes";

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
};

type MockQuery = {
  select: ReturnType<
    typeof jest.fn
  >;
  eq: ReturnType<
    typeof jest.fn
  >;
  order: ReturnType<
    typeof jest.fn
  >;
  limit: ReturnType<
    typeof jest.fn
  >;
  upsert: ReturnType<
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

const REPLACEMENT_VIEWER_ID =
  "00000000-0000-4000-8000-000000000004";

const SOURCE_OWNER_ID =
  "00000000-0000-4000-8000-000000000002";

const EXPORT_ID =
  "00000000-0000-4000-8000-000000000003";

const CREATED_AT =
  "2026-07-28T20:00:00.000Z";

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
    order:
      jest.fn(
        () => query,
      ),
    limit:
      jest.fn(
        () => query,
      ),
    upsert:
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

function sceneWithPrivateData(): StoredScene {
  return {
    id:
      "saved-source-scene",
    name:
      "Private Export Source",
    activity:
      "Focus",
    duration:
      "30 minutes",
    emotions:
      "Calm",
    genres:
      "Ambient",
    energy:
      "Low",
    familiarity:
      "Balanced",
    artists:
      "Private Artist Preference",
    songRequest:
      "Private Song Request",
    avoid:
      "Private Avoid List",
    collaborators: [],
    tracks: [
      {
        id:
          "track-private",
        title:
          "Private Track",
        artist:
          "Private Artist",
        spotifyUri:
          "spotify:track:private",
      },
    ],
    visibility:
      "private",
    libraryType:
      "saved",
    createdAt:
      CREATED_AT,
    updatedAt:
      CREATED_AT,
    spotifyAccessToken:
      "access-token-must-not-persist",
    spotifyRefreshToken:
      "refresh-token-must-not-persist",
    privatePayload: {
      rawProviderResponse:
        "provider-payload-must-not-persist",
    },
  };
}

function exportRow() {
  return {
    id:
      EXPORT_ID,
    user_id:
      VIEWER_ID,
    source_owner_id:
      SOURCE_OWNER_ID,
    source_scene_id:
      "source-scene",
    scene_name:
      "Private Export Source",
    spotify_playlist_id:
      "playlist-123",
    spotify_playlist_url:
      "https://open.spotify.com/playlist/playlist-123",
    track_count:
      1,
    created_at:
      CREATED_AT,
  };
}

describe(
  "playlist export Supabase contract",
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
      "writes an owner-scoped export without provider tokens or private Scene payloads",
      async () => {
        const writeQuery =
          createQuery({
            data:
              exportRow(),
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          writeQuery as never,
        );

        const scene =
          sceneWithPrivateData();

        const result =
          await recordScenePlaylistExport(
            scene,
            {
              playlistId:
                "playlist-123",
              playlistUrl:
                "https://open.spotify.com/playlist/playlist-123",
              trackCount:
                1,
              accessToken:
                "provider-token-must-not-persist",
            } as never,
            {
              sourceOwnerId:
                SOURCE_OWNER_ID,
              sourceSceneId:
                "source-scene",
            },
          );

        expect(
          result,
        ).toMatchObject({
          id:
            EXPORT_ID,
          userId:
            VIEWER_ID,
          sourceOwnerId:
            SOURCE_OWNER_ID,
          spotifyPlaylistId:
            "playlist-123",
        });

        expect(
          writeQuery.upsert,
        ).toHaveBeenCalledWith(
          {
            user_id:
              VIEWER_ID,
            source_owner_id:
              SOURCE_OWNER_ID,
            source_scene_id:
              "source-scene",
            scene_name:
              scene.name,
            spotify_playlist_id:
              "playlist-123",
            spotify_playlist_url:
              "https://open.spotify.com/playlist/playlist-123",
            track_count:
              1,
          },
          {
            onConflict:
              "user_id,spotify_playlist_id",
          },
        );

        const persistedPayload =
          writeQuery.upsert
            .mock.calls[0][0];

        const serialized =
          JSON.stringify(
            persistedPayload,
          );

        expect(
          serialized,
        ).not.toContain(
          "access-token-must-not-persist",
        );

        expect(
          serialized,
        ).not.toContain(
          "refresh-token-must-not-persist",
        );

        expect(
          serialized,
        ).not.toContain(
          "provider-payload-must-not-persist",
        );

        expect(
          serialized,
        ).not.toContain(
          "Private Song Request",
        );

        expect(
          Object.keys(
            persistedPayload as object,
          ).sort(),
        ).toEqual([
          "scene_name",
          "source_owner_id",
          "source_scene_id",
          "spotify_playlist_id",
          "spotify_playlist_url",
          "track_count",
          "user_id",
        ]);
      },
    );

    it(
      "reads only the authenticated owner's exports and clamps the requested limit",
      async () => {
        const readQuery =
          createQuery({
            data: [
              exportRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          readQuery as never,
        );

        await expect(
          readScenePlaylistExports({
            limit:
              500,
            sourceOwnerId:
              SOURCE_OWNER_ID,
            sourceSceneId:
              "source-scene",
          }),
        ).resolves.toEqual([
          {
            id:
              EXPORT_ID,
            userId:
              VIEWER_ID,
            sourceOwnerId:
              SOURCE_OWNER_ID,
            sourceSceneId:
              "source-scene",
            sceneName:
              "Private Export Source",
            spotifyPlaylistId:
              "playlist-123",
            spotifyPlaylistUrl:
              "https://open.spotify.com/playlist/playlist-123",
            trackCount:
              1,
            createdAt:
              CREATED_AT,
          },
        ]);

        expect(
          readQuery.eq
            .mock.calls,
        ).toEqual([
          [
            "user_id",
            VIEWER_ID,
          ],
          [
            "source_owner_id",
            SOURCE_OWNER_ID,
          ],
          [
            "source_scene_id",
            "source-scene",
          ],
        ]);

        expect(
          readQuery.limit,
        ).toHaveBeenCalledWith(
          100,
        );
      },
    );

    it(
      "does not record an earlier account's export after an account switch",
      async () => {
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
                    REPLACEMENT_VIEWER_ID,
                },
              },
              error:
                null,
            } as never,
          );

        const account =
          await captureScenePlaylistExportAccount();

        await expect(
          recordScenePlaylistExport(
            sceneWithPrivateData(),
            {
              playlistId:
                "playlist-123",
              trackCount:
                1,
            },
            {
              account,
            },
          ),
        ).rejects.toThrow(
          "signed-in Canal account changed",
        );

        expect(
          mockFrom,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not return an earlier account's exports after a mid-read switch",
      async () => {
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
                    REPLACEMENT_VIEWER_ID,
                },
              },
              error:
                null,
            } as never,
          );

        const readQuery =
          createQuery({
            data: [
              exportRow(),
            ],
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          readQuery as never,
        );

        await expect(
          readScenePlaylistExports(),
        ).rejects.toThrow(
          "signed-in Canal account changed",
        );
      },
    );

    it(
      "deletes an export only when both its ID and authenticated owner match",
      async () => {
        const deleteQuery =
          createQuery({
            data: {
              id:
                EXPORT_ID,
            },
            error:
              null,
          });

        mockFrom.mockReturnValueOnce(
          deleteQuery as never,
        );

        await expect(
          deleteScenePlaylistExport(
            EXPORT_ID,
          ),
        ).resolves.toBe(
          true,
        );

        expect(
          deleteQuery.eq
            .mock.calls,
        ).toEqual([
          [
            "id",
            EXPORT_ID,
          ],
          [
            "user_id",
            VIEWER_ID,
          ],
        ]);
      },
    );

    it.each([
      {
        operation:
          "write",
        message:
          "write denied",
        expected:
          "Canal could not save this playlist export: write denied",
      },
      {
        operation:
          "read",
        message:
          "read denied",
        expected:
          "Canal could not load your playlist exports: read denied",
      },
      {
        operation:
          "delete",
        message:
          "delete denied",
        expected:
          "Canal could not delete this playlist export: delete denied",
      },
    ])(
      "maps a Supabase $operation error to a bounded product error",
      async ({
        operation,
        message,
        expected,
      }) => {
        const errorQuery =
          createQuery({
            error: {
              message,
            },
          });

        mockFrom.mockReturnValueOnce(
          errorQuery as never,
        );

        let request:
          Promise<unknown>;

        if (
          operation ===
          "write"
        ) {
          request =
            recordScenePlaylistExport(
              sceneWithPrivateData(),
              {
                playlistId:
                  "playlist-123",
                trackCount:
                  1,
              },
            );
        } else if (
          operation ===
          "read"
        ) {
          request =
            readScenePlaylistExports();
        } else {
          request =
            deleteScenePlaylistExport(
              EXPORT_ID,
            );
        }

        await expect(
          request,
        ).rejects.toThrow(
          expected,
        );
      },
    );
  },
);
