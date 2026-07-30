import {
  mockAsyncStorage,
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  acquireSpotifyAuthOperationLease,
  acquireSpotifyAuthPreparationLease,
  announceSpotifyAuthStatusEvent,
  clearSpotifyReturnRoute,
  createSpotifyAuthAttempt,
  createSpotifyCleanupStatusEvent,
  createSpotifyLockedStatusEvent,
  isSpotifyAuthAttemptForScope,
  isSpotifyAuthAttemptAfterProviderRotation,
  isSpotifyAuthPreparationOwnerCurrent,
  isSpotifyAuthPreparationLeaseCurrent,
  isSpotifyAuthOperationLeaseCurrent,
  prepareSpotifyAuthAttempt,
  promptSpotifyAuthAttempt,
  readSpotifyReturnRoute,
  releaseSpotifyAuthPreparationLease,
  releaseSpotifyAuthOperationLease,
  saveSpotifyReturnRoute,
  SpotifyAuthStateMismatchError,
} from "../lib/spotify-auth-return";

import type {
  SpotifyAuthAttempt,
  SpotifyAuthRequestLike,
} from "../lib/spotify-auth-return";

import type {
  SpotifyAccountScope,
} from "../lib/spotify-auth";

import type {
  AuthSessionResult,
} from "expo-auth-session";

let currentScope:
  SpotifyAccountScope;

let mockNextAttemptId =
  0;

const mockCaptureScope =
  jest.fn();

const mockAssertScope =
  jest.fn();

jest.mock(
  "../lib/spotify-auth",
  () => ({
    captureSpotifyAccountScope:
      () =>
        mockCaptureScope(),
    assertSpotifyAccountScopeCurrent:
      (
        scope:
          SpotifyAccountScope,
      ) =>
        mockAssertScope(
          scope,
        ),
  }),
);

jest.mock(
  "expo-crypto",
  () => ({
    randomUUID:
      () =>
        `attempt-${++mockNextAttemptId}`,
  }),
);

const scopeA:
  SpotifyAccountScope = {
  ownerId: "canal-a",
  sessionGeneration:
    "session-a-1",
  spotifyAccountGeneration: 3,
};

const scopeB:
  SpotifyAccountScope = {
  ownerId: "canal-b",
  sessionGeneration:
    "session-b-1",
  spotifyAccountGeneration: 4,
};

const scopeA2:
  SpotifyAccountScope = {
  ownerId: "canal-a",
  sessionGeneration:
    "session-a-2",
  spotifyAccountGeneration: 5,
};

describe(
  "Spotify OAuth return attempt isolation",
  () => {
    beforeEach(() => {
      mockStorage.clear();

      currentScope =
        scopeA;

      mockNextAttemptId =
        0;

      mockCaptureScope
        .mockReset()
        .mockImplementation(
          async () =>
            currentScope,
        );

      mockAssertScope
        .mockReset()
        .mockImplementation(
          async (
            expected:
              SpotifyAccountScope,
          ) => {
            if (
              !isSpotifyAuthAttemptForScope(
                {
                  ...expected,
                  attemptId:
                    "scope-check",
                },
                currentScope,
              )
            ) {
              throw new Error(
                "account changed",
              );
            }
          },
        );

      mockAsyncStorage.getItem
        .mockImplementation(
          async (key) =>
            mockStorage.get(
              key,
            ) ??
            null,
        );

      mockAsyncStorage.setItem
        .mockImplementation(
          async (
            key,
            value,
          ) => {
            mockStorage.set(
              key,
              value,
            );
          },
        );

      mockAsyncStorage.removeItem
        .mockImplementation(
          async (key) => {
            mockStorage.delete(
              key,
            );
          },
        );
    });

    it(
      "compare-and-clears only the exact B attempt after A switches to B",
      async () => {
        const attemptA =
          await createSpotifyAuthAttempt();

        await saveSpotifyReturnRoute(
          "/connect-music",
          attemptA,
        );

        currentScope =
          scopeB;

        const attemptB =
          await createSpotifyAuthAttempt();

        await saveSpotifyReturnRoute(
          "/music-services",
          attemptB,
        );

        await expect(
          clearSpotifyReturnRoute(
            attemptA,
          ),
        ).resolves.toBe(false);

        await expect(
          readSpotifyReturnRoute(),
        ).resolves.toBe(
          "/music-services",
        );

        await expect(
          clearSpotifyReturnRoute(
            attemptB,
          ),
        ).resolves.toBe(true);
      },
    );

    it.each([
      "cancel",
      "error",
      "locked",
      "success",
    ])(
      "quarantines late A %s after B and a new A2 session",
      async () => {
        const attemptA =
          await createSpotifyAuthAttempt();

        await saveSpotifyReturnRoute(
          "/connect-music",
          attemptA,
        );

        currentScope =
          scopeB;

        const attemptB =
          await createSpotifyAuthAttempt();

        await saveSpotifyReturnRoute(
          "/music-services",
          attemptB,
        );

        currentScope =
          scopeA2;

        const attemptA2 =
          await createSpotifyAuthAttempt();

        await saveSpotifyReturnRoute(
          "/connect-music",
          attemptA2,
        );

        expect(
          isSpotifyAuthAttemptForScope(
            attemptA,
            scopeA2,
          ),
        ).toBe(false);

        await expect(
          clearSpotifyReturnRoute(
            attemptA,
          ),
        ).resolves.toBe(false);

        await expect(
          readSpotifyReturnRoute(),
        ).resolves.toBe(
          "/connect-music",
        );

        await expect(
          clearSpotifyReturnRoute(
            attemptB,
          ),
        ).resolves.toBe(false);
      },
    );

    it(
      "announces one current locked attempt and quarantines it after B then A2",
      async () => {
        const attemptA =
          await createSpotifyAuthAttempt();

        const eventA =
          createSpotifyLockedStatusEvent(
            attemptA,
            "canal-a:epoch-1",
          );

        const announce =
          jest.fn();

        let announcedEventId =
          announceSpotifyAuthStatusEvent(
            eventA,
            "canal-a:epoch-1",
            null,
            announce,
          );

        expect(
          announce,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          announce,
        ).toHaveBeenLastCalledWith(
          "Spotify authorization is already in progress. Try again.",
        );

        announcedEventId =
          announceSpotifyAuthStatusEvent(
            eventA,
            "canal-a:epoch-1",
            announcedEventId,
            announce,
          );

        await Promise.resolve();

        announcedEventId =
          announceSpotifyAuthStatusEvent(
            eventA,
            "canal-b:epoch-2",
            announcedEventId,
            announce,
          );

        await Promise.resolve();

        announceSpotifyAuthStatusEvent(
          eventA,
          "canal-a:epoch-3",
          announcedEventId,
          announce,
        );

        expect(
          announce,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "announces one current durable cleanup event across remounts and quarantines stale identities",
      () => {
        const cleanupEvent =
          createSpotifyCleanupStatusEvent(
            {
              cleanupId:
                "cleanup-status-remount-a",
              ownerId:
                "canal-a",
              sessionGeneration:
                "session-a",
              spotifyAccountGeneration:
                8,
            },
            "canal-a:epoch-1",
          );

        const announce =
          jest.fn();

        expect(
          announceSpotifyAuthStatusEvent(
            cleanupEvent,
            "canal-a:epoch-1",
            null,
            announce,
          ),
        ).toBe(
          cleanupEvent.eventId,
        );

        announceSpotifyAuthStatusEvent(
          cleanupEvent,
          "canal-a:epoch-1",
          null,
          announce,
        );

        announceSpotifyAuthStatusEvent(
          cleanupEvent,
          "canal-b:epoch-2",
          null,
          announce,
        );

        expect(
          announce,
        ).toHaveBeenCalledTimes(
          1,
        );

        const nextCleanupEvent =
          createSpotifyCleanupStatusEvent(
            {
              cleanupId:
                "cleanup-status-remount-a-next",
              ownerId:
                "canal-a",
              sessionGeneration:
                "session-a",
              spotifyAccountGeneration:
                9,
            },
            "canal-a:epoch-1",
          );

        announceSpotifyAuthStatusEvent(
          nextCleanupEvent,
          "canal-a:epoch-1",
          null,
          announce,
        );

        expect(
          announce,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );

    it(
      "preserves the A2 preparation when a held A1 caller resumes after B and A2",
      async () => {
        const ownerA1 = {
          accountIdentity:
            "canal-a:epoch-1",
          epoch: 1,
        };

        const ownerA2 = {
          accountIdentity:
            "canal-a:epoch-3",
          epoch: 3,
        };

        let currentIdentity =
          ownerA1.accountIdentity;

        let currentOwner =
          ownerA1;

        let releaseA1:
          () => void =
          () => {};

        const heldA1 =
          new Promise<void>(
            (resolve) => {
              releaseA1 =
                resolve;
            },
          );

        const attemptA1 =
          await createSpotifyAuthAttempt();

        await saveSpotifyReturnRoute(
          "/connect-music",
          attemptA1,
        );

        currentScope =
          scopeB;
        currentIdentity =
          "canal-b:epoch-2";

        currentScope =
          scopeA2;
        currentIdentity =
          ownerA2.accountIdentity;
        currentOwner =
          ownerA2;

        const attemptA2 =
          await createSpotifyAuthAttempt();

        await saveSpotifyReturnRoute(
          "/connect-music",
          attemptA2,
        );

        const currentPreparation: {
          announcement: string;
          promptCount: number;
          readiness: boolean;
          route:
            | "/connect-music"
            | "/music-services"
            | null;
          tuple:
            SpotifyAuthAttempt;
        } = {
          announcement:
            "locked-a2",
          promptCount: 0,
          readiness: true,
          route:
            await readSpotifyReturnRoute(),
          tuple:
            attemptA2,
        };

        const frozenA2 =
          JSON.stringify(
            currentPreparation,
          );

        releaseA1();
        await heldA1;

        if (
          isSpotifyAuthPreparationOwnerCurrent(
            ownerA1,
            currentIdentity,
            currentOwner,
          )
        ) {
          currentPreparation.announcement =
            "";
          currentPreparation.promptCount +=
            1;
          currentPreparation.readiness =
            false;
          currentPreparation.route =
            null;
          currentPreparation.tuple =
            attemptA1;
        }

        await expect(
          clearSpotifyReturnRoute(
            attemptA1,
          ),
        ).resolves.toBe(false);

        currentPreparation.route =
          await readSpotifyReturnRoute();

        expect(
          JSON.stringify(
            currentPreparation,
          ),
        ).toBe(
          frozenA2,
        );
      },
    );

    it.each(
      [
        "hook",
        "music-services",
      ] as const,
    )(
      "%s preserves A2 route and preparation when unmounted A1 settles success, reject, or locked",
      async (surface) => {
        for (
          const outcome of [
            "success",
            "reject",
            "locked",
          ] as const
        ) {
          mockStorage.clear();
          currentScope =
            scopeA;

          let mountedA1 =
            true;

          const leaseA1 =
            acquireSpotifyAuthPreparationLease(
              `${surface}:canal-a:session-a-1`,
            );

          let markA1LoadStarted:
            () => void =
            () => {};

          const a1LoadStarted =
            new Promise<void>(
              (resolve) => {
                markA1LoadStarted =
                  resolve;
              },
            );

          let resolveA1Load:
            (
              request:
                SpotifyAuthRequestLike,
            ) => void =
            () => {};

          let rejectA1Load:
            (
              error: Error,
            ) => void =
            () => {};

          let a1RequestState =
            "";

          const lateA1Preparation =
            prepareSpotifyAuthAttempt(
              "/connect-music",
              {
                clientId:
                  "spotify-client",
                redirectUri:
                  "canal://spotify-callback",
                usePKCE: true,
              },
              {
                authorizationEndpoint:
                  "https://accounts.spotify.test/authorize",
              },
              async (config) => {
                a1RequestState =
                  config.state!;
                markA1LoadStarted();

                return new Promise(
                  (
                    resolve,
                    reject,
                  ) => {
                    resolveA1Load =
                      resolve;
                    rejectA1Load =
                      reject;
                  },
                );
              },
              () =>
                mountedA1 &&
                isSpotifyAuthPreparationLeaseCurrent(
                  leaseA1,
                ),
            );

          await a1LoadStarted;

          mountedA1 =
            false;

          expect(
            releaseSpotifyAuthPreparationLease(
              leaseA1,
            ),
          ).toBe(true);

          currentScope =
            scopeA2;

          const leaseA2 =
            acquireSpotifyAuthPreparationLease(
              `${surface}:canal-a:session-a-2`,
            );

          const preparedA2 =
            await prepareSpotifyAuthAttempt(
              "/music-services",
              {
                clientId:
                  "spotify-client",
                redirectUri:
                  "canal://spotify-callback",
                usePKCE: true,
              },
              {
                authorizationEndpoint:
                  "https://accounts.spotify.test/authorize",
              },
              async (config) => ({
                state:
                  config.state!,
                codeVerifier:
                  "verifier-a2",
                url:
                  `https://accounts.spotify.test/authorize?state=${config.state}`,
                promptAsync:
                  async () => ({
                    type:
                      "cancel" as const,
                  }),
              }),
              () =>
                isSpotifyAuthPreparationLeaseCurrent(
                  leaseA2,
                ),
            );

          const routeBeforeA1 =
            mockStorage.get(
              "@canal/spotify-return-route",
            );

          const a2State = {
            announcement:
              "locked-a2",
            codeVerifier:
              preparedA2.codeVerifier,
            readiness: true,
            requestState:
              preparedA2.requestState,
            requestUrl:
              preparedA2.requestUrl,
            route:
              routeBeforeA1,
            tuple:
              preparedA2.attempt,
          };

          const frozenA2State =
            JSON.stringify(
              a2State,
            );

          const staleEffects = {
            alerts: 0,
            announcements: 0,
            browserDismissals: 0,
            exchanges: 0,
            navigation: 0,
            profileReads: 0,
            providerWrites: 0,
            syncs: 0,
          };

          const staleFinalizerLoad =
            jest.fn();

          await expect(
            prepareSpotifyAuthAttempt(
              "/connect-music",
              {
                clientId:
                  "spotify-client",
                redirectUri:
                  "canal://spotify-callback",
                usePKCE: true,
              },
              {
                authorizationEndpoint:
                  "https://accounts.spotify.test/authorize",
              },
              staleFinalizerLoad,
              () =>
                mountedA1 &&
                isSpotifyAuthPreparationLeaseCurrent(
                  leaseA1,
                ),
            ),
          ).rejects.toThrow(
            "outdated Spotify authorization preparation",
          );

          expect(
            staleFinalizerLoad,
          ).not.toHaveBeenCalled();

          if (
            outcome ===
              "reject"
          ) {
            rejectA1Load(
              new Error(
                "late A1 load rejected",
              ),
            );
          } else {
            const lateRequest:
              SpotifyAuthRequestLike = {
              state:
                a1RequestState,
              codeVerifier:
                "verifier-a1",
              url:
                `https://accounts.spotify.test/authorize?state=${a1RequestState}`,
              promptAsync:
                async (): Promise<AuthSessionResult> => {
                  if (
                    outcome ===
                      "locked"
                  ) {
                    return {
                      type:
                        "locked",
                    };
                  }

                  return {
                    type:
                      "success",
                    authentication:
                      null,
                    errorCode:
                      null,
                    params: {
                      code:
                        "late-a1",
                      state:
                        a1RequestState,
                    },
                    url:
                      "canal://spotify-callback",
                  };
                },
              };

            resolveA1Load(
              lateRequest,
            );
          }

          await expect(
            lateA1Preparation,
          ).rejects.toThrow();

          expect(
            mockStorage.get(
              "@canal/spotify-return-route",
            ),
          ).toBe(
            routeBeforeA1,
          );

          expect(
            await readSpotifyReturnRoute(),
          ).toBe(
            "/music-services",
          );

          expect(
            isSpotifyAuthPreparationLeaseCurrent(
              leaseA2,
            ),
          ).toBe(true);

          expect(
            releaseSpotifyAuthPreparationLease(
              leaseA1,
            ),
          ).toBe(false);

          expect(
            await clearSpotifyReturnRoute({
              ...scopeA,
              attemptId:
                a1RequestState,
            }),
          ).toBe(false);

          expect(
            preparedA2.attempt,
          ).toMatchObject(
            scopeA2,
          );

          a2State.route =
            mockStorage.get(
              "@canal/spotify-return-route",
            );

          expect(
            JSON.stringify(
              a2State,
            ),
          ).toBe(
            frozenA2State,
          );

          expect(
            staleEffects,
          ).toEqual({
            alerts: 0,
            announcements: 0,
            browserDismissals: 0,
            exchanges: 0,
            navigation: 0,
            profileReads: 0,
            providerWrites: 0,
            syncs: 0,
          });

          releaseSpotifyAuthPreparationLease(
            leaseA2,
          );
        }
      },
    );

    it(
      "keeps one exact operation lease through prompt and revokes it when a successor prepares",
      () => {
        const preparation =
          acquireSpotifyAuthPreparationLease(
            "owner-a:session-stable",
          );

        const operation =
          acquireSpotifyAuthOperationLease(
            preparation,
            {
              ...scopeA,
              attemptId:
                "attempt-a1",
            },
            "hook-surface-a1",
            3,
          );

        expect(
          isSpotifyAuthOperationLeaseCurrent(
            operation,
          ),
        ).toBe(true);

        const successor =
          acquireSpotifyAuthPreparationLease(
            "owner-a:session-stable",
          );

        expect(
          isSpotifyAuthOperationLeaseCurrent(
            operation,
          ),
        ).toBe(false);
        expect(
          releaseSpotifyAuthOperationLease(
            operation,
          ),
        ).toBe(false);
        expect(
          isSpotifyAuthPreparationLeaseCurrent(
            successor,
          ),
        ).toBe(true);

        releaseSpotifyAuthPreparationLease(
          successor,
        );
      },
    );

    it(
      "loads a fresh state and PKCE request tuple for every prepared attempt",
      async () => {
        const loadedStates:
          string[] = [];

        const loadRequest =
          jest.fn(
            async (
              config: {
                state?: string;
              },
            ) => {
              loadedStates.push(
                config.state!,
              );

              return {
                state:
                  config.state!,
                codeVerifier:
                  `verifier-${config.state}`,
                url:
                  `https://accounts.spotify.test/authorize?state=${config.state}`,
                promptAsync:
                  async () => ({
                    type:
                      "cancel" as const,
                  }),
              };
            },
          );

        const first =
          await prepareSpotifyAuthAttempt(
            "/music-services",
            {
              clientId:
                "spotify-client",
              redirectUri:
                "canal://spotify-callback",
              usePKCE: true,
            },
            {
              authorizationEndpoint:
                "https://accounts.spotify.test/authorize",
            },
            loadRequest,
          );

        const second =
          await prepareSpotifyAuthAttempt(
            "/music-services",
            {
              clientId:
                "spotify-client",
              redirectUri:
                "canal://spotify-callback",
              usePKCE: true,
            },
            {
              authorizationEndpoint:
                "https://accounts.spotify.test/authorize",
            },
            loadRequest,
          );

        expect(
          first.attempt.attemptId,
        ).not.toBe(
          second.attempt.attemptId,
        );

        expect(
          loadedStates,
        ).toEqual([
          first.attempt.attemptId,
          second.attempt.attemptId,
        ]);

        expect(
          first.codeVerifier,
        ).not.toBe(
          second.codeVerifier,
        );
      },
    );

    it.each([
      "cancel",
      "error",
      "locked",
      "success",
    ] as const)(
      "rejects a late A %s through the actual prompt response path after B then A2",
      async (type) => {
        const attemptA =
          await createSpotifyAuthAttempt();

        let resolvePrompt:
          (
            result:
              AuthSessionResult,
          ) => void =
          () => {};

        const preparedA = {
          attempt:
            attemptA,
          requestState:
            attemptA.attemptId,
          codeVerifier:
            "verifier-a",
          requestUrl:
            "https://accounts.spotify.test/a",
          request: {
            state:
              attemptA.attemptId,
            codeVerifier:
              "verifier-a",
            url:
              "https://accounts.spotify.test/a",
            promptAsync:
              () =>
                new Promise<AuthSessionResult>(
                  (resolve) => {
                    resolvePrompt =
                      resolve;
                  },
                ),
          },
        };

        const pendingResult =
          promptSpotifyAuthAttempt(
            preparedA,
            {
              authorizationEndpoint:
                "https://accounts.spotify.test/authorize",
            },
          );

        currentScope =
          scopeB;
        currentScope =
          scopeA2;

        resolvePrompt(
          type === "cancel" ||
          type === "locked"
            ? {
                type,
              }
            : {
                type,
                authentication:
                  null,
                errorCode:
                  type ===
                  "error"
                    ? "denied"
                    : null,
                params: {
                  state:
                    attemptA.attemptId,
                  ...(type ===
                  "success"
                    ? {
                        code:
                          "code-a",
                      }
                    : {
                        error:
                          "denied",
                      }),
                },
                url:
                  "canal://spotify-callback",
              },
        );

        await expect(
          pendingResult,
        ).rejects.toThrow(
          "account changed",
        );
      },
    );

    it(
      "retires generation N without prompting it and consumes only a prepared N+1 replacement",
      async () => {
        const retiredAttempt =
          await createSpotifyAuthAttempt();

        const retiredPrompt =
          jest.fn();

        currentScope = {
          ...scopeA,
          spotifyAccountGeneration:
            retiredAttempt
              .spotifyAccountGeneration +
            1,
        };

        const replacementAttempt =
          await createSpotifyAuthAttempt();

        const replacementPrompt =
          jest.fn(
            async (): Promise<AuthSessionResult> => ({
              type:
                "success",
              authentication:
                null,
              errorCode:
                null,
              params: {
                code:
                  "replacement-code",
                state:
                  replacementAttempt
                    .attemptId,
              },
              url:
                "canal://spotify-callback",
            }),
          );

        expect(
          isSpotifyAuthAttemptAfterProviderRotation(
            retiredAttempt,
            replacementAttempt,
          ),
        ).toBe(true);

        const result =
          await promptSpotifyAuthAttempt(
            {
              attempt:
                replacementAttempt,
              requestState:
                replacementAttempt
                  .attemptId,
              codeVerifier:
                "replacement-verifier",
              requestUrl:
                "https://accounts.spotify.test/replacement",
              request: {
                state:
                  replacementAttempt
                    .attemptId,
                codeVerifier:
                  "replacement-verifier",
                url:
                  "https://accounts.spotify.test/replacement",
                promptAsync:
                  replacementPrompt,
              },
            },
            {
              authorizationEndpoint:
                "https://accounts.spotify.test/authorize",
            },
          );

        const visibleState = {
          cache:
            `cache:${replacementAttempt.spotifyAccountGeneration}`,
          profile:
            result.response.type ===
              "success"
              ? "spotify-replacement"
              : null,
        };

        expect(
          retiredPrompt,
        ).not.toHaveBeenCalled();
        expect(
          replacementPrompt,
        ).toHaveBeenCalledTimes(
          1,
        );
        expect(
          visibleState,
        ).toEqual({
          cache:
            `cache:${replacementAttempt.spotifyAccountGeneration}`,
          profile:
            "spotify-replacement",
        });

        expect(
          isSpotifyAuthAttemptAfterProviderRotation(
            retiredAttempt,
            {
              ...replacementAttempt,
              spotifyAccountGeneration:
                retiredAttempt
                  .spotifyAccountGeneration,
            },
          ),
        ).toBe(false);
      },
    );

    it(
      "rejects a success response whose returned state does not match its loaded request",
      async () => {
        const attempt =
          await createSpotifyAuthAttempt();

        await expect(
          promptSpotifyAuthAttempt(
            {
              attempt,
              requestState:
                attempt.attemptId,
              codeVerifier:
                "verifier-a",
              requestUrl:
                "https://accounts.spotify.test/a",
              request: {
                state:
                  attempt.attemptId,
                codeVerifier:
                  "verifier-a",
                url:
                  "https://accounts.spotify.test/a",
                promptAsync:
                  async () => ({
                    type:
                      "success",
                    authentication:
                      null,
                    errorCode:
                      null,
                    params: {
                      code: "code-a",
                      state:
                        "wrong-state",
                    },
                    url:
                      "canal://spotify-callback",
                  }),
              },
            },
            {
              authorizationEndpoint:
                "https://accounts.spotify.test/authorize",
            },
          ),
        ).rejects.toBeInstanceOf(
          SpotifyAuthStateMismatchError,
        );
      },
    );

    it(
      "returns locked as an owned terminal result without weakening its request tuple",
      async () => {
        const attempt =
          await createSpotifyAuthAttempt();

        const result =
          await promptSpotifyAuthAttempt(
            {
              attempt,
              requestState:
                attempt.attemptId,
              codeVerifier:
                "verifier-a",
              requestUrl:
                "https://accounts.spotify.test/a",
              request: {
                state:
                  attempt.attemptId,
                codeVerifier:
                  "verifier-a",
                url:
                  "https://accounts.spotify.test/a",
                promptAsync:
                  async () => ({
                    type:
                      "locked",
                  }),
              },
            },
            {
              authorizationEndpoint:
                "https://accounts.spotify.test/authorize",
            },
          );

        expect(
          result.response.type,
        ).toBe("locked");
        expect(
          result.requestState,
        ).toBe(
          attempt.attemptId,
        );
        expect(
          result.codeVerifier,
        ).toBe("verifier-a");
      },
    );
  },
);
