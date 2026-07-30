import fs from "node:fs";
import path from "node:path";

import {
  isSameSpotifyAuthAttempt,
  isSpotifyAuthAttemptForScope,
  rebindSpotifyAuthAttemptAuthority,
} from "../lib/spotify-auth-return";

import type {
  SpotifyAuthAttempt,
} from "../lib/spotify-auth-return";

const musicServices =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "app/music-services.tsx",
    ),
    "utf8",
  );

const spotifyConnectionHook =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "hooks/useSpotifyConnection.ts",
    ),
    "utf8",
  );

const attemptA:
  SpotifyAuthAttempt = {
  attemptId: "attempt-a",
  ownerId: "canal-a",
  sessionGeneration:
    "session-a-1",
  spotifyAccountGeneration: 4,
};

const attemptB:
  SpotifyAuthAttempt = {
  attemptId: "attempt-b",
  ownerId: "canal-b",
  sessionGeneration:
    "session-b-1",
  spotifyAccountGeneration: 5,
};

const attemptA2:
  SpotifyAuthAttempt = {
  attemptId: "attempt-a2",
  ownerId: "canal-a",
  sessionGeneration:
    "session-a-2",
  spotifyAccountGeneration: 6,
};

describe(
  "Music Services OAuth account-race contract",
  () => {
    it.each([
      "cancel",
      "error",
      "success",
    ] as const)(
      "quarantines a late A %s after B then A2 without stale screen effects",
      async (resultType) => {
        let pendingAttempt:
          SpotifyAuthAttempt =
          attemptA;

        const effects = {
          announcements: 0,
          navigation: 0,
          providerWrites: 0,
          syncs: 0,
          uiCommits: 0,
        };

        const commitLateA =
          (
            resultType:
              | "cancel"
              | "error"
              | "success",
          ): void => {
            if (
              resultType !==
                "cancel" &&
              resultType !==
                "error" &&
              resultType !==
                "success"
            ) {
              throw new Error(
                "Unexpected OAuth result.",
              );
            }

            if (
              !isSameSpotifyAuthAttempt(
                pendingAttempt,
                attemptA,
              ) ||
              !isSpotifyAuthAttemptForScope(
                attemptA,
                attemptA2,
              )
            ) {
              return;
            }

            effects.uiCommits +=
              1;
            effects.providerWrites +=
              1;
            effects.syncs +=
              1;
            effects.announcements +=
              1;
            effects.navigation +=
              1;
          };

        pendingAttempt =
          attemptB;
        pendingAttempt =
          attemptA2;

        await Promise.resolve();
        commitLateA(
          resultType,
        );

        expect(
          effects,
        ).toEqual({
          announcements: 0,
          navigation: 0,
          providerWrites: 0,
          syncs: 0,
          uiCommits: 0,
        });
      },
    );

    it(
      "binds the prompt result, verifier, return route, writes, sync, and browser dismissal to the exact attempt",
      () => {
        expect(
          musicServices,
        ).toContain(
          "prepareSpotifyAuthAttempt",
        );

        expect(
          musicServices,
        ).toContain(
          "promptSpotifyAuthAttempt",
        );

        expect(
          musicServices,
        ).toMatch(
          /const promptPromise =\s*promptSpotifyAuthAttempt[(][\s\S]*?setConnectionState[\s\S]*?const promptResult =\s*await promptPromise;[\s\S]*?setAuthCompletion[(]\{[\s\S]*response:\s*result,[\s\S]*attempt,[\s\S]*codeVerifier:/u,
        );

        expect(
          musicServices,
        ).toContain(
          "assertSpotifyAccountScopeCurrent",
        );

        expect(
          musicServices,
        ).toContain(
          "isSameSpotifyAuthAttempt",
        );

        expect(
          musicServices,
        ).toMatch(
          /processingCode[.]current =\s*`\$\{responseAttempt[.]attemptId\}:\$\{code\}`/u,
        );

        expect(
          musicServices,
        ).toMatch(
          /await assertCanCommitAuth[(][)][\s\S]*AuthSession[.]exchangeCodeAsync[\s\S]*await assertCanCommitAuth[(][)][\s\S]*fetch[(][\s\S]*await assertCanCommitAuth[(][)][\s\S]*saveSpotifySession[\s\S]*syncLibrary:\s*true,[\s\S]*operationCommitGuard:\s*canCommitAuth,[\s\S]*await assertCanCommitAuth[(][)][\s\S]*WebBrowser[.]dismissAuthSession/u,
        );

        expect(
          musicServices,
        ).toMatch(
          /clearSpotifyReturnRoute[(]\s*responseAttempt,\s*[)]/u,
        );

        expect(
          musicServices,
        ).toContain(
          'result.type ===\n            "locked"',
        );

        expect(
          musicServices,
        ).toContain(
          "SpotifyAuthStateMismatchError",
        );
      },
    );

    it(
      "requires an exact identity and preparation lease before either caller creates or commits a request",
      () => {
        for (
          const callerSource of [
            spotifyConnectionHook,
            musicServices,
          ]
        ) {
          expect(
            callerSource,
          ).toContain(
            "isSpotifyAuthPreparationOwnerCurrent",
          );

          expect(
            callerSource,
          ).toContain(
            "authInstanceLifecycle",
          );

          expect(
            callerSource,
          ).toContain(
            "acquireSpotifyAuthPreparationLease",
          );

          expect(
            callerSource,
          ).toContain(
            "isSpotifyAuthPreparationLeaseCurrent",
          );

          expect(
            callerSource,
          ).toMatch(
            /accountIdentityRef[.]current !==\s*preparationIdentity[\s\S]*?return null;[\s\S]*?authPreparationEpoch[.]current =\s*preparationEpoch/u,
          );

          expect(
            callerSource,
          ).toMatch(
            /await previousPreparation;[\s\S]*?if [(]!ownsPreparation[(][)][)] \{[\s\S]*?return null;[\s\S]*?prepareSpotifyAuthAttempt/u,
          );

          expect(
            callerSource,
          ).toMatch(
            /if [(]\s*accountIdentityRef[.]current !==\s*preparationIdentity \|\|\s*!ownsPreparation[(][)][\s\S]*?clearSpotifyReturnRoute[(]\s*prepared[.]attempt/u,
          );

          expect(
            callerSource,
          ).toMatch(
            /spotifyDiscovery,\s*undefined,\s*ownsPreparation,/u,
          );
        }
      },
    );

    it.each([
      "hook",
      "music-services",
    ] as const)(
      "%s rebinds only provider generation after replacement and suppresses mismatched authority",
      (surface) => {
        const pendingAttempt = {
          ...attemptA,
        };

        const accountIdentity =
          `${surface}:canal-a:session-a-1`;

        let visibleProfile =
          "spotify-a";

        let connectionState =
          "connecting";

        const returnedGuard = {
          accountGeneration:
            attemptA
              .spotifyAccountGeneration +
            1,
          configured: true,
          ownerId:
            attemptA.ownerId,
        };

        const rebound =
          rebindSpotifyAuthAttemptAuthority(
            pendingAttempt,
            returnedGuard,
          );

        const canCommit =
          accountIdentity ===
            `${surface}:canal-a:session-a-1` &&
          isSameSpotifyAuthAttempt(
            pendingAttempt,
            attemptA,
          ) &&
          rebound.ownerId ===
            attemptA.ownerId &&
          rebound.sessionGeneration ===
            attemptA
              .sessionGeneration;

        if (canCommit) {
          visibleProfile =
            "spotify-b";
          connectionState =
            "connected";
        }

        expect(
          rebound,
        ).toEqual({
          ...attemptA,
          spotifyAccountGeneration:
            returnedGuard
              .accountGeneration,
        });

        expect(
          visibleProfile,
        ).toBe(
          "spotify-b",
        );

        expect(
          connectionState,
        ).toBe(
          "connected",
        );

        const nextAttempt = {
          ...attemptA,
          attemptId:
            "attempt-after-b",
          spotifyAccountGeneration:
            returnedGuard
              .accountGeneration,
        };

        const returningAuthority =
          rebindSpotifyAuthAttemptAuthority(
            nextAttempt,
            {
              ...returnedGuard,
              accountGeneration:
                returnedGuard
                  .accountGeneration +
                1,
            },
          );

        expect(
          returningAuthority,
        ).toEqual({
          ...nextAttempt,
          spotifyAccountGeneration:
            returnedGuard
              .accountGeneration +
            1,
        });

        expect(
          () =>
            rebindSpotifyAuthAttemptAuthority(
              pendingAttempt,
              {
                ...returnedGuard,
                ownerId:
                  "canal-b",
              },
            ),
        ).toThrow(
          "verify the Spotify authorization response",
        );
      },
    );

    it.each([
      "hook",
      "music-services",
    ] as const)(
      "%s exits connecting and exposes recovery when provider cleanup blocks replacement",
      async (surface) => {
        let connectionState =
          "connecting";

        let visibleProfile:
          string | null =
          "spotify-a";

        let recoveryVisible =
          false;

        let routeClearCount =
          0;

        try {
          await Promise.reject(
            new Error(
              "Canal must finish the prior Spotify provider cache cleanup before connecting the replacement.",
            ),
          );
        } catch {
          visibleProfile =
            null;
          connectionState =
            "disconnected";
          recoveryVisible =
            true;
          routeClearCount +=
            1;
        }

        expect({
          connectionState,
          recoveryVisible,
          routeClearCount,
          surface,
          visibleProfile,
        }).toEqual({
          connectionState:
            "disconnected",
          recoveryVisible:
            true,
          routeClearCount: 1,
          surface,
          visibleProfile:
            null,
        });
      },
    );

    it(
      "both callers consume save authority before their post-save guard and visible commit",
      () => {
        for (
          const callerSource of [
            spotifyConnectionHook,
            musicServices,
          ]
        ) {
          expect(
            callerSource,
          ).toMatch(
            /const savedAccountGuard =\s*await saveSpotifySession[\s\S]*?rebindSpotifyAuthAttemptAuthority[\s\S]*?await assert(?:CurrentAttempt|CanCommitAuth)[(][)][\s\S]*?set(?:Profile|Session)[(]/u,
          );
        }

        expect(
          spotifyConnectionHook,
        ).toMatch(
          /setProfile[(]\s*null\s*[)]/u,
        );

        expect(
          spotifyConnectionHook,
        ).toMatch(
          /setIsConnecting[(]false[)]/u,
        );

        expect(
          musicServices,
        ).toMatch(
          /completeConnection[(][)][.]catch[\s\S]*?await getValidSpotifySession[(][)][\s\S]*?setSession[(]\s*restoredSession,[\s\S]*?setConnectionState[(]\s*restoredSession\s*[?]\s*"connected"\s*:\s*"disconnected"/u,
        );
      },
    );
  },
);
