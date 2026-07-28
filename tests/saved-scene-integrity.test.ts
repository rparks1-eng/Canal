import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  removeSavedSceneCompletely,
} from "../lib/saved-scene-management";
import {
  savePublicSceneToLibrary,
  savedSceneCopyId,
} from "../lib/social";
import type {
  PublicCanalScene,
} from "../lib/social";
import {
  supabase,
} from "../lib/supabase";
import {
  assertSceneCacheOwner,
  capturePreparedSceneCacheOwner,
  writeScenesForSceneCacheOwner,
} from "../lib/scene-sync";

jest.mock(
  "expo-crypto",
  () => {
    const {
      createHash,
    } =
      jest.requireActual<
        typeof import("node:crypto")
      >(
        "node:crypto",
      );

    return {
      CryptoDigestAlgorithm: {
        SHA256:
          "SHA-256",
      },
      digestStringAsync:
        jest.fn(
          async (
            _algorithm:
              string,
            value:
              string,
          ) =>
            createHash(
              "sha256",
            )
              .update(
                value,
              )
              .digest(
                "hex",
              ),
        ),
    };
  },
);

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      true,
    requireSupabaseConfiguration:
      jest.fn(),
    supabase: {
      from:
        jest.fn(),
      rpc:
        jest.fn(),
    },
  }),
);

jest.mock(
  "../lib/scene-sync",
  () => ({
    capturePreparedSceneCacheOwner:
      jest.fn(),
    assertSceneCacheOwner:
      jest.fn(),
    writeScenesForSceneCacheOwner:
      jest.fn(),
  }),
);

const mockRpc =
  jest.mocked(
    supabase.rpc,
  );

const mockFrom =
  jest.mocked(
    supabase.from,
  );

const mockCaptureOwner =
  jest.mocked(
    capturePreparedSceneCacheOwner,
  );

const mockAssertOwner =
  jest.mocked(
    assertSceneCacheOwner,
  );

const mockWriteScenes =
  jest.mocked(
    writeScenesForSceneCacheOwner,
  );

function publicScene(): PublicCanalScene {
  const createdAt =
    "2026-07-28T12:00:00.000Z";

  return {
    ownerId:
      "creator-user",
    sceneId:
      "source/a",
    scene: {
      id:
        "source/a",
      ownerId:
        "creator-user",
      name:
        "Creator Scene",
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
        "public",
      libraryType:
        "created",
      createdAt,
      updatedAt:
        createdAt,
    },
    creator: {
      id:
        "creator-user",
      displayName:
        "Creator",
      handle:
        "@creator",
      bio:
        "",
      favoriteActivities:
        "",
      avatarUrl:
        null,
      isPublic:
        true,
      isVerified:
        false,
      isCanal:
        false,
    },
    updatedAt:
      createdAt,
    savedByMe:
      false,
    isMine:
      false,
  };
}

describe(
  "saved Scene integrity",
  () => {
    let currentUserId =
      "viewer-a";

    beforeEach(() => {
      jest.clearAllMocks();

      currentUserId =
        "viewer-a";

      mockCaptureOwner.mockImplementation(
        async () => ({
          userId:
            currentUserId,
          generation:
            1,
        }),
      );

      mockAssertOwner.mockImplementation(
        async (owner) => {
          if (
            owner.userId !==
            currentUserId
          ) {
            throw new Error(
              "account changed",
            );
          }
        },
      );

      mockRpc.mockResolvedValue(
        {
          data:
            null,
          error:
            null,
        } as never,
      );
    });

    it(
      "uses the full source identity when deriving copy IDs",
      async () => {
        await expect(
          savedSceneCopyId(
            "owner-a",
            "a/b",
          ),
        ).resolves.not.toBe(
          await savedSceneCopyId(
            "owner-a",
            "ab",
          ),
        );

        await expect(
          savedSceneCopyId(
            "owner-a",
            "scene",
          ),
        ).resolves.not.toBe(
          await savedSceneCopyId(
            "owner-b",
            "scene",
          ),
        );
      },
    );

    it(
      "stamps the saver as copy owner while retaining source provenance",
      async () => {
        const saved =
          await savePublicSceneToLibrary(
            publicScene(),
          );

        expect(
          saved,
        ).toMatchObject({
          ownerId:
            "viewer-a",
          sourceOwnerId:
            "creator-user",
          sourceSceneId:
            "source/a",
          libraryType:
            "saved",
          visibility:
            "private",
        });

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "save_public_scene_to_library",
          expect.objectContaining({
            saved_copy_payload:
              expect.objectContaining({
                ownerId:
                  "viewer-a",
                sourceOwnerId:
                  "creator-user",
                sourceSceneId:
                  "source/a",
              }),
          }),
        );

        expect(
          mockWriteScenes,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            userId:
              "viewer-a",
          }),
          expect.arrayContaining([
            expect.objectContaining({
              ownerId:
                "viewer-a",
            }),
          ]),
        );
      },
    );

    it(
      "does not write an account A saved copy after its RPC resolves under account B",
      async () => {
        const rpcResult =
          (() => {
            let resolve:
              () => void =
              () => undefined;

            const promise =
              new Promise<{
                data: null;
                error: null;
              }>(
                (
                  nextResolve,
                ) => {
                  resolve =
                    () =>
                      nextResolve({
                        data:
                          null,
                        error:
                          null,
                      });
                },
              );

            return {
              promise,
              resolve:
                () =>
                  resolve(),
            };
          })();

        mockRpc.mockReturnValueOnce(
          rpcResult.promise as never,
        );

        const saveResult =
          savePublicSceneToLibrary(
            publicScene(),
          );

        await Promise.resolve();
        await Promise.resolve();

        currentUserId =
          "viewer-b";

        rpcResult.resolve();

        await expect(
          saveResult,
        ).rejects.toThrow(
          "account changed",
        );

        expect(
          mockWriteScenes,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "recovers one exact cloud copy identity without guessing a same-ID creator",
      async () => {
        const query = {
          select:
            jest.fn(
              () =>
                query,
            ),
          eq:
            jest.fn(
              () =>
                query,
            ),
          maybeSingle:
            jest.fn(
              async () => ({
                data: {
                  payload: {
                    id:
                      "saved-copy",
                    libraryType:
                      "saved",
                    sourceOwnerId:
                      "creator-a",
                    sourceSceneId:
                      "shared-scene",
                  },
                },
                error:
                  null,
              }),
            ),
        };

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await removeSavedSceneCompletely({
          ...publicScene().scene,
          id:
            "saved-copy",
          ownerId:
            "viewer-a",
          libraryType:
            "saved",
          sourceSceneId:
            "shared-scene",
          sourceOwnerId:
            undefined,
        });

        expect(
          mockFrom,
        ).toHaveBeenCalledTimes(
          1,
        );
        expect(
          mockFrom,
        ).toHaveBeenCalledWith(
          "scenes",
        );
        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "remove_saved_scene_from_library",
          {
            source_owner_id_value:
              "creator-a",
            source_scene_id_value:
              "shared-scene",
            saved_copy_id_value:
              "saved-copy",
          },
        );
      },
    );

    it(
      "refuses to fan-delete ambiguous legacy relationships",
      async () => {
        const query = {
          select:
            jest.fn(
              () =>
                query,
            ),
          eq:
            jest.fn(
              () =>
                query,
            ),
          maybeSingle:
            jest.fn(
              async () => ({
                data: {
                  payload: {
                    id:
                      "shared-scene",
                    name:
                      "Creator Scene",
                  },
                },
                error:
                  null,
              }),
            ),
        };

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          removeSavedSceneCompletely({
            ...publicScene()
              .scene,
            id:
              "saved-copy",
            ownerId:
              "viewer-a",
            libraryType:
              "saved",
            sourceSceneId:
              "shared-scene",
            sourceOwnerId:
              undefined,
          }),
        ).rejects.toThrow(
          "could not safely identify this legacy saved Scene",
        );

        expect(
          mockRpc,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
