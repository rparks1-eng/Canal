import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  mockAsyncStorage,
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  supabase,
} from "../lib/supabase";

import {
  advancePlayerSession,
  CanalPlayerStorageError,
  clearPlayerSession,
  constrainPlayerSessionToScene,
  createPlayerSession,
  movePlayerSession,
  readPlayerSession,
  writePlayerSession,
} from "../lib/canal-player";

import type {
  CanalPlayerSession,
} from "../lib/canal-player";

import type {
  StoredScene,
} from "../lib/scenes";

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      true,
    supabase: {
      auth: {
        getSession:
          jest.fn(),
      },
    },
  }),
);

const PLAYER_KEY =
  "@canal/player-session";

const PLAYER_OWNER_ID =
  "00000000-0000-4000-8000-000000000001";

const REPLACEMENT_OWNER_ID =
  "00000000-0000-4000-8000-000000000002";

const mockGetSession =
  jest.mocked(
    supabase.auth.getSession,
  );

function playerAuthResult(
  ownerId:
    string | null,
): Awaited<
  ReturnType<
    typeof supabase.auth.getSession
  >
> {
  return {
    data: {
      session:
        ownerId
          ? {
              user: {
                id:
                  ownerId,
              },
            }
          : null,
    },
    error: null,
  } as Awaited<
    ReturnType<
      typeof supabase.auth.getSession
    >
  >;
}

const scene = {
  id: "scene-player",
  name: "Late-night focus",
  tracks: [],
} as unknown as StoredScene;

const sceneWithTracks = {
  ...scene,
  tracks: [
    {
      id: "track-one",
      title: "First",
      artist: "Canal",
      durationMs: 10_000,
    },
    {
      id: "track-two",
      title: "Second",
      artist: "Canal",
      durationMs: 20_000,
    },
  ],
} as StoredScene;

const replacementScene = {
  ...sceneWithTracks,
  id:
    "scene-player-replacement",
  name:
    "Morning focus",
} as StoredScene;

const playerSession:
  CanalPlayerSession = {
    id: "player-test",
    ownerId:
      PLAYER_OWNER_ID,
    sceneId:
      "scene-player",
    sceneName:
      "Late-night focus",
    currentIndex: 0,
    isPlaying: true,
    elapsedSeconds: 5,
    trackElapsedSeconds: 5,
    startedAt:
      "2026-07-28T20:00:00.000Z",
    updatedAt:
      "2026-07-28T20:00:05.000Z",
  };

describe(
  "Canal player session storage",
  () => {
    beforeEach(async () => {
      jest.clearAllMocks();

      await clearPlayerSession();

      mockStorage.clear();
      jest.clearAllMocks();

      mockGetSession.mockResolvedValue(
        playerAuthResult(
          PLAYER_OWNER_ID,
        ),
      );
    });

    it(
      "creates a recoverable session for the requested Scene",
      async () => {
        const session =
          await createPlayerSession(
            scene,
          );

        expect(
          session,
        ).toMatchObject({
          ownerId:
            PLAYER_OWNER_ID,
          sceneId:
            "scene-player",
          sceneName:
            "Late-night focus",
          currentIndex: 0,
          isPlaying: false,
          elapsedSeconds: 0,
          trackElapsedSeconds: 0,
        });

        await expect(
          readPlayerSession(),
        ).resolves.toMatchObject({
          id: session.id,
          sceneId:
            "scene-player",
        });
      },
    );

    it(
      "rejects playback for a Scene owned by another Canal account",
      async () => {
        await expect(
          createPlayerSession({
            ...scene,
            ownerId:
              "00000000-0000-4000-8000-000000000099",
          }),
        ).rejects.toThrow(
          "different Canal account",
        );

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(false);
      },
    );

    it(
      "normalizes counters and playback state from older local data",
      async () => {
        mockStorage.set(
          PLAYER_KEY,
          JSON.stringify({
            id: " player-legacy ",
            ownerId:
              PLAYER_OWNER_ID,
            sceneId:
              " scene-player ",
            sceneName:
              " Late-night focus ",
            currentIndex: 2.9,
            isPlaying:
              "true",
            elapsedSeconds: -12,
            startedAt:
              "2026-07-28T20:00:00.000Z",
          }),
        );

        await expect(
          readPlayerSession(),
        ).resolves.toEqual({
          id: "player-legacy",
          ownerId:
            PLAYER_OWNER_ID,
          sceneId:
            "scene-player",
          sceneName:
            "Late-night focus",
          currentIndex: 2,
          isPlaying: false,
          elapsedSeconds: 0,
          trackElapsedSeconds: 0,
          startedAt:
            "2026-07-28T20:00:00.000Z",
          updatedAt:
            "2026-07-28T20:00:00.000Z",
        });
      },
    );

    it(
      "removes legacy ownerless playback instead of claiming it for another account",
      async () => {
        const ownerlessSession:
          CanalPlayerSession = {
          ...playerSession,
        };

        delete ownerlessSession
          .ownerId;

        mockStorage.set(
          PLAYER_KEY,
          JSON.stringify(
            ownerlessSession,
          ),
        );

        await expect(
          readPlayerSession(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(false);
      },
    );

    it.each([
      "not-json",
      JSON.stringify({
        id: "player-broken",
        sceneName:
          "Missing Scene id",
        startedAt:
          "2026-07-28T20:00:00.000Z",
      }),
      JSON.stringify({
        id: "player-broken",
        sceneId:
          "scene-player",
        sceneName:
          "Invalid time",
        startedAt:
          "not-a-timestamp",
      }),
    ])(
      "rejects an unrecoverable stored session",
      async (serialized) => {
        mockStorage.set(
          PLAYER_KEY,
          serialized,
        );

        await expect(
          readPlayerSession(),
        ).resolves.toBeNull();
      },
    );

    it(
      "refuses to persist a session without stable Scene ownership",
      async () => {
        const invalidSession = {
          id: "player-invalid",
          sceneId: "",
          sceneName:
            "Missing owner",
          currentIndex: 0,
          isPlaying: false,
          elapsedSeconds: 0,
          startedAt:
            "2026-07-28T20:00:00.000Z",
          updatedAt:
            "2026-07-28T20:00:00.000Z",
        } as CanalPlayerSession;

        await expect(
          writePlayerSession(
            invalidSession,
          ),
        ).rejects.toThrow(
          "invalid player session",
        );

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(false);
      },
    );

    it(
      "constrains restored indices and progress to the active Scene",
      () => {
        expect(
          constrainPlayerSessionToScene(
            {
              ...playerSession,
              currentIndex: 99,
              trackElapsedSeconds: 90,
            },
            sceneWithTracks,
          ),
        ).toMatchObject({
          currentIndex: 1,
          trackElapsedSeconds: 20,
          elapsedSeconds: 5,
        });

        expect(
          constrainPlayerSessionToScene(
            playerSession,
            {
              ...sceneWithTracks,
              id:
                "another-scene",
            },
          ),
        ).toBeNull();
      },
    );

    it(
      "makes an empty queue safe and non-playing",
      () => {
        expect(
          constrainPlayerSessionToScene(
            {
              ...playerSession,
              currentIndex: 8,
              trackElapsedSeconds: 8,
            },
            scene,
          ),
        ).toMatchObject({
          currentIndex: 0,
          isPlaying: false,
          trackElapsedSeconds: 0,
          elapsedSeconds: 5,
        });
      },
    );

    it(
      "moves between tracks without resetting cumulative Scene time",
      () => {
        const moved =
          movePlayerSession(
            playerSession,
            sceneWithTracks,
            1,
          );

        expect(
          moved,
        ).toMatchObject({
          currentIndex: 1,
          elapsedSeconds: 5,
          trackElapsedSeconds: 0,
        });

        expect(
          movePlayerSession(
            moved!,
            sceneWithTracks,
            1,
          ),
        ).toMatchObject({
          currentIndex: 1,
          elapsedSeconds: 5,
          trackElapsedSeconds: 0,
        });
      },
    );

    it(
      "advances through the queue while preserving cumulative time",
      () => {
        expect(
          advancePlayerSession(
            {
              ...playerSession,
              trackElapsedSeconds: 9,
            },
            sceneWithTracks,
            3,
          ),
        ).toMatchObject({
          currentIndex: 1,
          isPlaying: true,
          elapsedSeconds: 8,
          trackElapsedSeconds: 2,
        });
      },
    );

    it(
      "stops at the queue end without counting time beyond the last track",
      () => {
        expect(
          advancePlayerSession(
            {
              ...playerSession,
              currentIndex: 1,
              trackElapsedSeconds: 18,
            },
            sceneWithTracks,
            5,
          ),
        ).toMatchObject({
          currentIndex: 1,
          isPlaying: false,
          elapsedSeconds: 7,
          trackElapsedSeconds: 20,
        });
      },
    );

    it(
      "clears after an in-flight progress write settles without resurrecting it",
      async () => {
        const racingSession = {
          ...playerSession,
          id:
            "player-racing-write",
        };

        let releaseWrite =
          (): void => {};

        let markWriteStarted =
          (): void => {};

        const writeStarted =
          new Promise<void>(
            (resolve) => {
              markWriteStarted =
                resolve;
            },
          );

        const blockedWrite =
          new Promise<void>(
            (resolve) => {
              releaseWrite =
                resolve;
            },
          );

        mockAsyncStorage
          .setItem
          .mockImplementationOnce(
            async (
              key: string,
              value: string,
            ) => {
              markWriteStarted();

              await blockedWrite;

              mockStorage.set(
                key,
                value,
              );
            },
          );

        const progressWrite =
          writePlayerSession(
            racingSession,
          );

        await writeStarted;

        const clear =
          clearPlayerSession(
            racingSession.id,
          );

        expect(
          mockAsyncStorage
            .removeItem,
        ).not.toHaveBeenCalled();

        releaseWrite();

        await Promise.all([
          progressWrite,
          clear,
        ]);

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(false);
      },
    );

    it(
      "keeps a replacement session when stale progress arrives from the previous session",
      async () => {
        const previousSession =
          await createPlayerSession(
            sceneWithTracks,
          );

        mockGetSession.mockResolvedValue(
          playerAuthResult(
            REPLACEMENT_OWNER_ID,
          ),
        );

        const replacementSession =
          await createPlayerSession(
            {
              ...replacementScene,
              ownerId:
                REPLACEMENT_OWNER_ID,
              sourceOwnerId:
                PLAYER_OWNER_ID,
            },
          );

        await writePlayerSession({
          ...previousSession,
          elapsedSeconds:
            previousSession
              .elapsedSeconds +
            10,
          trackElapsedSeconds:
            previousSession
              .trackElapsedSeconds +
            10,
        });

        await expect(
          readPlayerSession(),
        ).resolves.toMatchObject({
          id:
            replacementSession.id,
          ownerId:
            REPLACEMENT_OWNER_ID,
          sceneId:
            replacementScene.id,
        });
      },
    );

    it(
      "does not clear a replacement session when an older screen finishes",
      async () => {
        const previousSession =
          await createPlayerSession(
            sceneWithTracks,
          );

        mockGetSession.mockResolvedValue(
          playerAuthResult(
            REPLACEMENT_OWNER_ID,
          ),
        );

        const replacementSession =
          await createPlayerSession(
            {
              ...replacementScene,
              ownerId:
                REPLACEMENT_OWNER_ID,
              sourceOwnerId:
                PLAYER_OWNER_ID,
            },
          );

        await clearPlayerSession(
          previousSession.id,
        );

        await expect(
          readPlayerSession(),
        ).resolves.toMatchObject({
          id:
            replacementSession.id,
          ownerId:
            REPLACEMENT_OWNER_ID,
          sceneId:
            replacementScene.id,
        });
      },
    );

    it(
      "removes stored playback when the Canal account changes",
      async () => {
        await createPlayerSession(
          sceneWithTracks,
        );

        mockGetSession.mockResolvedValue(
          playerAuthResult(
            REPLACEMENT_OWNER_ID,
          ),
        );

        await expect(
          readPlayerSession(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(false);
      },
    );

    it(
      "rejects a read when the Canal account changes while storage is pending",
      async () => {
        mockStorage.set(
          PLAYER_KEY,
          JSON.stringify(
            playerSession,
          ),
        );

        let releaseRead =
          (): void => {};

        let markReadStarted =
          (): void => {};

        const readStarted =
          new Promise<void>(
            (resolve) => {
              markReadStarted =
                resolve;
            },
          );

        const blockedRead =
          new Promise<void>(
            (resolve) => {
              releaseRead =
                resolve;
            },
          );

        mockAsyncStorage
          .getItem
          .mockImplementationOnce(
            async (
              key: string,
            ) => {
              markReadStarted();

              await blockedRead;

              return (
                mockStorage.get(
                  key,
                ) ??
                null
              );
            },
          );

        const staleRead =
          readPlayerSession();

        await readStarted;

        mockGetSession.mockResolvedValue(
          playerAuthResult(
            REPLACEMENT_OWNER_ID,
          ),
        );

        releaseRead();

        await expect(
          staleRead,
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(true);

        await expect(
          readPlayerSession(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(false);
      },
    );

    it(
      "rejects an arbitrary owner-tagged write after an account switch",
      async () => {
        mockGetSession.mockResolvedValue(
          playerAuthResult(
            REPLACEMENT_OWNER_ID,
          ),
        );

        await writePlayerSession({
          ...playerSession,
          id:
            "player-wrong-owner",
        });

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(false);
      },
    );

    it(
      "keeps account cleanup authoritative over a stale create and progress write",
      async () => {
        const staleProgressSession = {
          ...playerSession,
          id:
            "player-cleanup-stale",
        };

        await writePlayerSession(
          staleProgressSession,
        );

        let releaseCreate =
          (): void => {};

        let markCreateStarted =
          (): void => {};

        const createStarted =
          new Promise<void>(
            (resolve) => {
              markCreateStarted =
                resolve;
            },
          );

        const blockedCreate =
          new Promise<void>(
            (resolve) => {
              releaseCreate =
                resolve;
            },
          );

        mockAsyncStorage
          .setItem
          .mockImplementationOnce(
            async (
              key: string,
              value: string,
            ) => {
              markCreateStarted();

              await blockedCreate;

              mockStorage.set(
                key,
                value,
              );
            },
          );

        const staleCreate =
          createPlayerSession(
            sceneWithTracks,
          );

        await createStarted;

        const cleanup =
          clearPlayerSession();

        const staleCreateResult =
          expect(
            staleCreate,
          ).rejects.toThrow(
            "Playback changed",
          );

        releaseCreate();

        await Promise.all([
          staleCreateResult,
          cleanup,
        ]);

        mockGetSession.mockResolvedValueOnce(
          playerAuthResult(
            null,
          ),
        );

        await expect(
          createPlayerSession(
            replacementScene,
          ),
        ).rejects.toThrow(
          "signed into Canal",
        );

        await writePlayerSession({
          ...staleProgressSession,
          elapsedSeconds: 20,
          trackElapsedSeconds: 9,
        });

        await expect(
          readPlayerSession(),
        ).resolves.toBeNull();

        expect(
          mockStorage.has(
            PLAYER_KEY,
          ),
        ).toBe(false);
      },
    );

    it(
      "surfaces recoverable storage read, write, and clear failures",
      async () => {
        const storageFailureSession = {
          ...playerSession,
          id:
            "player-storage-failure",
        };

        mockAsyncStorage
          .getItem
          .mockRejectedValueOnce(
            new Error(
              "read unavailable",
            ),
          );

        await expect(
          readPlayerSession(),
        ).rejects.toEqual(
          expect.objectContaining({
            name:
              "CanalPlayerStorageError",
            operation:
              "read",
          }),
        );

        mockAsyncStorage
          .setItem
          .mockRejectedValueOnce(
            new Error(
              "write unavailable",
            ),
          );

        await expect(
          writePlayerSession(
            storageFailureSession,
          ),
        ).rejects.toBeInstanceOf(
          CanalPlayerStorageError,
        );

        mockAsyncStorage
          .removeItem
          .mockRejectedValueOnce(
            new Error(
              "clear unavailable",
            ),
          );

        await expect(
          clearPlayerSession(),
        ).rejects.toMatchObject({
          operation:
            "clear",
        });
      },
    );
  },
);

describe(
  "Now Playing account lifecycle contract",
  () => {
    const source =
      readFileSync(
        join(
          process.cwd(),
          "app",
          "now-playing.tsx",
        ),
        "utf8",
      );

    it(
      "keys loading and timer ownership to the current Canal account",
      () => {
        expect(
          source,
        ).toContain(
          "useAuth",
        );

        expect(
          source,
        ).toContain(
          "playerLoadAccountKeyRef.current",
        );

        expect(
          source,
        ).toMatch(
          /playerLoadAccountKeyRef\.current !==\s*accountKey/,
        );

        expect(
          source,
        ).not.toMatch(
          /clearPlayerSession\(\s*\)/,
        );
      },
    );

    it(
      "reasserts the persisted session owner before finish side effects",
      () => {
        const finishStart =
          source.indexOf(
            "const finish =",
          );

        const finishEnd =
          source.indexOf(
            "const recoverStorage =",
            finishStart,
          );

        const finishSource =
          source.slice(
            finishStart,
            finishEnd,
          );

        const ownerRead =
          finishSource.indexOf(
            "await readPlayerSession()",
          );

        const historyWrite =
          finishSource.indexOf(
            "recordListeningHistory",
          );

        const playWrite =
          finishSource.indexOf(
            "recordScenePlay",
          );

        expect(
          ownerRead,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          ownerRead,
        ).toBeLessThan(
          historyWrite,
        );

        expect(
          ownerRead,
        ).toBeLessThan(
          playWrite,
        );

        expect(
          finishSource,
        ).toContain(
          "persistedSession.ownerId",
        );

        expect(
          finishSource,
        ).toContain(
          "accountKeyRef.current",
        );
      },
    );
  },
);
