import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  readScenes,
  writeScenes,
} from "../lib/scenes";
import {
  clearSceneSyncOwnership,
  deleteSceneForCurrentOwner,
  prepareSceneLibraryForUser,
  syncScenesWithCloud,
} from "../lib/scene-sync";
import {
  supabase,
} from "../lib/supabase";
import {
  mockStorage,
} from "./helpers/async-storage-mock";

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      true,
    requireSupabaseConfiguration:
      jest.fn(),
    supabase: {
      auth: {
        getUser:
          jest.fn(),
        getSession:
          jest.fn(),
      },
      from:
        jest.fn(),
    },
  }),
);

const mockGetUser =
  jest.mocked(
    supabase.auth.getUser,
  );

const mockGetSession =
  jest.mocked(
    supabase.auth.getSession,
  );

const mockFrom =
  jest.mocked(
    supabase.from,
  );

function deferred<Result>() {
  let resolve:
    (value: Result) => void =
    () => undefined;

  const promise =
    new Promise<Result>(
      (nextResolve) => {
        resolve =
          nextResolve;
      },
    );

  return {
    promise,
    resolve,
  };
}

function sceneRow(
  userId: string,
  sceneId: string,
) {
  const createdAt =
    "2026-07-28T12:00:00.000Z";

  return {
    user_id:
      userId,
    id:
      sceneId,
    revision:
      1,
    payload: {
      id:
        sceneId,
      ownerId:
        userId,
      name:
        `${userId} Scene`,
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
        "Mixed",
      artists:
        "",
      songRequest:
        "",
      avoid:
        "",
      collaborators:
        [],
      tracks:
        [],
      visibility:
        "private",
      libraryType:
        "created",
      createdAt,
      updatedAt:
        createdAt,
      revision:
        1,
    },
    created_at:
      createdAt,
    updated_at:
      createdAt,
    deleted_at:
      null,
  };
}

describe(
  "Scene cloud synchronization",
  () => {
    let currentUserId =
      "user-a";

    beforeEach(
      async () => {
        mockStorage.clear();
        currentUserId =
          "user-a";

        mockGetUser.mockImplementation(
          async () =>
            ({
              data: {
                user: {
                  id:
                    currentUserId,
                },
              },
              error:
                null,
            }) as never,
        );

        mockGetSession.mockImplementation(
          async () =>
            ({
              data: {
                session: {
                  user: {
                    id:
                      currentUserId,
                  },
                },
              },
              error:
                null,
            }) as never,
        );

        await clearSceneSyncOwnership();
      },
    );

    it(
      "does not let a deferred account A sync repopulate account B's cache",
      async () => {
        const accountARead =
          deferred<{
            data:
              ReturnType<
                typeof sceneRow
              >[];
            error: null;
          }>();

        let accountAReadStarted:
          () => void =
          () => undefined;

        const accountAStarted =
          new Promise<void>(
            (resolve) => {
              accountAReadStarted =
                resolve;
            },
          );

        mockFrom.mockImplementation(
          () =>
            ({
              select:
                jest.fn(
                  () => ({
                    eq:
                      jest.fn(
                        (
                          _column:
                            string,
                          userId:
                            string,
                        ) => {
                          if (
                            userId ===
                            "user-a"
                          ) {
                            accountAReadStarted();

                            return accountARead.promise;
                          }

                          return Promise.resolve({
                            data: [
                              sceneRow(
                                "user-b",
                                "scene-b",
                              ),
                            ],
                            error:
                              null,
                          });
                        },
                      ),
                  }),
                ),
              upsert:
                jest.fn(
                  async () => ({
                    error:
                      null,
                  }),
                ),
            }) as never,
        );

        const accountAResult =
          syncScenesWithCloud().catch(
            (error: unknown) =>
              error,
          );

        await accountAStarted;

        currentUserId =
          "user-b";

        const accountBResult =
          await syncScenesWithCloud();

        expect(
          accountBResult.total,
        ).toBe(
          1,
        );

        accountARead.resolve({
          data: [
            sceneRow(
              "user-a",
              "scene-a",
            ),
          ],
          error:
            null,
        });

        await expect(
          accountAResult,
        ).resolves.toBeInstanceOf(
          Error,
        );

        const cachedScenes =
          await readScenes();

        expect(
          cachedScenes.map(
            (scene) => ({
              id:
                scene.id,
              ownerId:
                scene.ownerId,
            }),
          ),
        ).toEqual([
          {
            id:
              "scene-b",
            ownerId:
              "user-b",
          },
        ]);
      },
    );

    it(
      "does not upload a timestamp-newer local Scene with a stale cloud revision",
      async () => {
        const remote =
          sceneRow(
            "user-a",
            "shared-scene",
          );
        remote.revision = 7;
        remote.payload.revision = 7;

        const upsert =
          jest.fn(
            async () => ({
              error: null,
            }),
          );

        mockFrom.mockImplementation(
          () =>
            ({
              select: jest.fn(
                () => ({
                  eq: jest.fn(
                    async () => ({
                      data: [remote],
                      error: null,
                    }),
                  ),
                }),
              ),
              upsert,
            }) as never,
        );

        await prepareSceneLibraryForUser(
          "user-a",
        );

        await writeScenes([
          {
            ...remote.payload,
            revision: 6,
            updatedAt:
              "2026-07-29T12:00:00.000Z",
          },
        ] as never);

        await syncScenesWithCloud();

        expect(upsert).not.toHaveBeenCalled();
        expect(
          (await readScenes())[0]?.revision,
        ).toBe(7);
      },
    );

    it(
      "keeps an intentionally deleted Scene removed when a stale cloud row returns",
      async () => {
        const staleRow =
          sceneRow(
            "user-a",
            "night",
          );

        const update =
          jest.fn(
            () => ({
              eq:
                jest.fn(
                  () => ({
                    eq:
                      jest.fn(
                        async () => ({
                          error:
                            null,
                        }),
                      ),
                  }),
                ),
            }),
          );

        mockFrom.mockImplementation(
          () =>
            ({
              select:
                jest.fn(
                  () => ({
                    eq:
                      jest.fn(
                        async () => ({
                          data: [
                            staleRow,
                          ],
                          error:
                            null,
                        }),
                      ),
                  }),
                ),
              update,
              upsert:
                jest.fn(
                  async () => ({
                    error:
                      null,
                  }),
                ),
            }) as never,
        );

        await prepareSceneLibraryForUser(
          "user-a",
        );

        await writeScenes([
          staleRow.payload,
        ] as never);

        await deleteSceneForCurrentOwner(
          "night",
        );

        expect(
          await readScenes(),
        ).toEqual([]);

        const result =
          await syncScenesWithCloud();

        expect(
          result.total,
        ).toBe(0);

        expect(
          await readScenes(),
        ).toEqual([]);

        expect(
          update,
        ).toHaveBeenCalled();

        expect(
          mockGetUser,
        ).toHaveBeenCalledTimes(3);
      },
    );
  },
);
