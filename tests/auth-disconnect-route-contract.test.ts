import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "@jest/globals";

function source(
  relativePath: string,
): string {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "logout and Spotify disconnect route contract",
  () => {
    const settings =
      source(
        "app/settings.tsx",
      );

    const musicServices =
      source(
        "app/music-services.tsx",
      );

    const spotifyHook =
      source(
        "hooks/useSpotifyConnection.ts",
      );

    const connectMusic =
      source(
        "app/connect-music.tsx",
      );

    const login =
      source(
        "app/login.tsx",
      );

    const connectivityBanner =
      source(
        "components/connectivity-banner.tsx",
      );

    const recoveryNotice =
      source(
        "components/recovery-notice.tsx",
      );

    it(
      "requires destructive confirmation and preserves truthful account scope",
      () => {
        expect(
          settings,
        ).toMatch(
          /Alert[.]alert[(]\s*"Log Out of Canal[?]"/u,
        );

        expect(
          musicServices,
        ).toMatch(
          /Alert[.]alert[(]\s*"Disconnect Spotify[?]"/u,
        );

        expect(
          musicServices,
        ).toMatch(
          /Alert[.]alert[(]\s*"Log Out of Canal[?]"/u,
        );

        expect(
          musicServices,
        ).toContain(
          "Your Spotify account and Canal data are not deleted.",
        );

        expect(
          settings,
        ).toContain(
          "Your Canal account, cloud data, and saved Scenes are not deleted.",
        );
      },
    );

    it(
      "keeps stable labels, live regions, explicit announcements, and 48-point controls",
      () => {
        for (
          const routeSource of [
            settings,
            musicServices,
          ]
        ) {
          expect(
            routeSource,
          ).toContain(
            "AccessibilityInfo",
          );

          expect(
            routeSource,
          ).toContain(
            ".announceForAccessibility(",
          );

          expect(
            routeSource,
          ).toContain(
            'accessibilityLiveRegion="polite"',
          );

          expect(
            routeSource,
          ).toMatch(
            /backButton:\s*\{[\s\S]*?width:\s*48,[\s\S]*?height:\s*48,/u,
          );
        }

        expect(
          settings,
        ).toContain(
          'accessibilityLabel="Log Out of Canal"',
        );

        expect(
          musicServices,
        ).toContain(
          'accessibilityLabel="Disconnect Spotify"',
        );

        expect(
          musicServices,
        ).toContain(
          'accessibilityLabel="Log Out of Canal"',
        );

        expect(
          settings,
        ).toMatch(
          /logoutButton:\s*\{[\s\S]*?minHeight:\s*49,/u,
        );

        expect(
          musicServices,
        ).toMatch(
          /secondaryButton:\s*\{[\s\S]*?minHeight:\s*50,/u,
        );

        expect(
          recoveryNotice,
        ).toMatch(
          /accessibilityLabel=\{\s*props[.]issue\s*[.]actionLabel\s*\}/u,
        );

        expect(
          recoveryNotice,
        ).toContain(
          "accessibilityValue={{",
        );

        expect(
          recoveryNotice,
        ).toMatch(
          /button:\s*\{[\s\S]*?minHeight:\s*48,/u,
        );

        expect(
          connectMusic,
        ).toContain(
          "AccessibilityInfo",
        );

        expect(
          connectMusic,
        ).toContain(
          ".announceForAccessibility(",
        );

        expect(
          connectMusic,
        ).toMatch(
          /accessibilityLabel="Change Spotify Account"[\s\S]*?accessibilityState=\{\{[\s\S]*?busy:[\s\S]*?disabled:/u,
        );

        expect(
          connectMusic,
        ).toMatch(
          /accessibilityLabel="Connect Spotify"[\s\S]*?accessibilityState=\{\{[\s\S]*?busy:[\s\S]*?disabled:/u,
        );
      },
    );

    it(
      "binds each OAuth completion to one immutable account attempt",
      () => {
        expect(
          spotifyHook,
        ).toContain(
          "prepareSpotifyAuthAttempt",
        );

        expect(
          spotifyHook,
        ).toContain(
          "const promptPromise =",
        );

        expect(
          spotifyHook,
        ).toContain(
          "promptSpotifyAuthAttempt",
        );

        expect(
          spotifyHook,
        ).not.toContain(
          "useAuthRequest",
        );

        expect(
          spotifyHook,
        ).toContain(
          'response.type ===\n            "locked"',
        );

        expect(
          spotifyHook,
        ).toContain(
          "isSameSpotifyAuthAttempt",
        );

        expect(
          spotifyHook,
        ).toContain(
          "assertCurrentAttempt",
        );

        expect(
          spotifyHook,
        ).toMatch(
          /clearSpotifyReturnRoute[(]\s*attempt,\s*[)]/u,
        );

        expect(
          spotifyHook,
        ).not.toMatch(
          /clearSpotifyReturnRoute[(][)]/u,
        );

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
        ).not.toContain(
          "useAuthRequest",
        );

        expect(
          musicServices,
        ).toContain(
          '"locked"',
        );

        expect(
          musicServices,
        ).toContain(
          "assertCanCommitAuth",
        );

        expect(
          musicServices,
        ).not.toMatch(
          /clearSpotifyReturnRoute[(][)]/u,
        );

        for (
          const oauthSource of [
            spotifyHook,
            musicServices,
          ]
        ) {
          expect(
            oauthSource,
          ).toContain(
            "retirePreparedAuthRequest",
          );

          expect(
            oauthSource,
          ).toContain(
            "isSpotifyAuthAttemptAfterProviderRotation",
          );

          expect(
            oauthSource,
          ).toMatch(
            /const retiredRequest =\s*retirePreparedAuthRequest[(][)][\s\S]*?const disconnectResult =\s*disconnectSpotifyOnly[(][)][\s\S]*?await Promise[.]all/u,
          );

          expect(
            oauthSource,
          ).toMatch(
            /const replacement =\s*await prepareAuthRequest[(][)][\s\S]*?isSpotifyAuthAttemptAfterProviderRotation/u,
          );
        }

        expect(
          spotifyHook,
        ).toMatch(
          /shouldConnect[\s\S]*?await prepareAuthRequest[(][)][\s\S]*?shouldConnect =\s*true;[\s\S]*?await connect[(][)]/u,
        );

        expect(
          musicServices,
        ).toContain(
          "!requestReady",
        );

        const musicServicesConnectControl =
          musicServices.match(
            /<Pressable\s*accessibilityLabel="Connect Spotify"[\s\S]*?<[/]Pressable>/u,
          )?.[0] ??
          "";

        expect(
          musicServicesConnectControl.match(
            /!requestReady/gu,
          ),
        ).toHaveLength(
          4,
        );
        expect(
          musicServicesConnectControl.match(
            /recoveryAction ===\s*"cleanup"/gu,
          ),
        ).toHaveLength(
          2,
        );
      },
    );

    it(
      "exposes one current locked or cleanup status without announcing cancel or dismiss",
      () => {
        expect(
          connectMusic,
        ).toContain(
          "announceSpotifyAuthStatusEvent",
        );

        expect(
          connectMusic,
        ).toContain(
          "announcedStatusEventId",
        );

        expect(
          connectMusic,
        ).not.toMatch(
          /message \? [(]\s*<View\s*accessibilityLiveRegion="polite"/u,
        );

        expect(
          spotifyHook,
        ).toContain(
          "createSpotifyLockedStatusEvent",
        );

        expect(
          spotifyHook,
        ).toContain(
          "createSpotifyCleanupStatusEvent",
        );

        expect(
          spotifyHook,
        ).toContain(
          "setStatusEvent(null)",
        );

        expect(
          spotifyHook,
        ).toMatch(
          /response[.]type ===\s*"locked"[\s\S]*?isCurrentAttempt[(][)][\s\S]*?createSpotifyLockedStatusEvent[\s\S]*?setStatusEvent/u,
        );

        expect(
          spotifyHook,
        ).not.toMatch(
          /response[.]type ===\s*"(?:cancel|dismiss)"[\s\S]{0,220}?setStatusEvent/u,
        );

        expect(
          connectMusic.match(
            /announceForAccessibility/gu,
          ),
        ).toHaveLength(1);

        expect(
          spotifyHook,
        ).not.toMatch(
          /response[.]type ===\s*"(?:cancel|dismiss)"[\s\S]{0,180}?setMessage/u,
        );
      },
    );

    it(
      "prevents prior-account provider state from rendering after an account epoch change",
      () => {
        expect(
          musicServices,
        ).toContain(
          "providerStateAccountIdentity",
        );

        expect(
          musicServices,
        ).toContain(
          "visibleSession",
        );

        expect(
          musicServices,
        ).toContain(
          "accountIdentityRef.current",
        );

        expect(
          spotifyHook,
        ).toContain(
          "profileAccountIdentity",
        );

        expect(
          spotifyHook,
        ).toContain(
          "visibleProfile",
        );

        expect(
          spotifyHook,
        ).toContain(
          "PreparedSpotifyAuthAttempt",
        );

        expect(
          spotifyHook,
        ).toContain(
          "accountGuard:",
        );

        expect(
          musicServices,
        ).toMatch(
          /const isFailedOperationCurrent =[\s\S]*?failedAccount[\s\S]*?accountIdentityRef[.]current[\s\S]*?isSpotifyAuthOperationLeaseCurrent[\s\S]*?isSameSpotifyAuthAttempt/u,
        );

        expect(
          settings,
        ).toMatch(
          /setMessage[(]""[)];[\s\S]*?await retryIncompleteAccountCleanup/u,
        );

        expect(
          settings,
        ).toMatch(
          /if [(]!canCommit[(][)][)] \{\s*return;\s*\}[\s\S]*?announceForAccessibility/u,
        );

        expect(
          musicServices,
        ).toMatch(
          /if [(]!canCommit[(][)][)] \{\s*return;\s*\}[\s\S]*?announce[(]/u,
        );
      },
    );

    it(
      "routes partial cleanup and signout-only recovery without replaying a fresh logout",
      () => {
        expect(
          settings,
        ).toContain(
          "retryIncompleteAccountCleanup",
        );

        expect(
          musicServices,
        ).toContain(
          "retryIncompleteAccountCleanup",
        );

        expect(
          musicServices,
        ).toMatch(
          /recoveryAction ===[\s\S]*"cleanup"[\s\S]*await retryCleanup[(]\s*false/u,
        );

        expect(
          musicServices,
        ).toMatch(
          /recoveryAction ===[\s\S]*"signout"[\s\S]*await retryCleanup[(]\s*true/u,
        );

        expect(
          musicServices.match(
            /disconnectSpotifyOnly[(][)]/gu,
          ),
        ).toHaveLength(1);

        expect(
          spotifyHook.match(
            /disconnectSpotifyOnly[(][)]/gu,
          ),
        ).toHaveLength(2);
      },
    );

    it(
      "returns successful logout to the normal Login screen without a cold-start connectivity warning",
      () => {
        expect(
          settings,
        ).toContain(
          'router.replace(\n                        "/login"',
        );

        expect(
          musicServices,
        ).toContain(
          'router.replace(\n            "/login"',
        );

        expect(
          login,
        ).toContain(
          "Sign In to Canal",
        );

        expect(
          connectivityBanner,
        ).toMatch(
          /if [(]\s*!shouldShowConnectivityBanner[\s\S]*?\) \{\s*return null;/u,
        );
      },
    );
  },
);
