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

import type {
  StoredScene,
} from "../lib/scenes";

import {
  clearSceneSyncOwnership,
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

        await clearSceneSyncOwnership();
      },
    );

    it(
      "clears account A's local Scene cache before account B can read it, without changing offline storage semantics",
      async () => {
        await prepareSceneLibraryForUser(
          "user-a",
        );

        await writeScenes([
          sceneRow(
            "user-a",
            "scene-a",
          ).payload as StoredScene,
        ]);

        expect(
          (
            await readScenes()
          ).map(
            (scene) =>
              scene.id,
          ),
        ).toEqual([
          "scene-a",
        ]);

        currentUserId =
          "user-b";

        await prepareSceneLibraryForUser(
          "user-b",
        );

        expect(
          await readScenes(),
        ).toEqual([]);
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
  },
);
