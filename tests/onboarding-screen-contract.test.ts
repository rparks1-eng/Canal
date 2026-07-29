import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

const ONBOARDING_SOURCE =
  readFileSync(
    resolve(
      __dirname,
      "..",
      "app",
      "onboarding.tsx",
    ),
    "utf8",
  );

const CONNECT_MUSIC_SOURCE =
  readFileSync(
    resolve(
      __dirname,
      "..",
      "app",
      "connect-music.tsx",
    ),
    "utf8",
  );

const ROOT_LAYOUT_SOURCE =
  readFileSync(
    resolve(
      __dirname,
      "..",
      "app",
      "_layout.tsx",
    ),
    "utf8",
  );

const ONBOARDING_LIBRARY_SOURCE =
  readFileSync(
    resolve(
      __dirname,
      "..",
      "lib",
      "onboarding.ts",
    ),
    "utf8",
  );

const LOGIN_SOURCE =
  readFileSync(
    resolve(
      __dirname,
      "..",
      "app",
      "login.tsx",
    ),
    "utf8",
  );

describe(
  "onboarding screen",
  () => {
    it(
      "tracks an intentional Spotify skip only in screen state and resets it for account changes",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /spotifyConnectSkipped,[\s\S]*setSpotifyConnectSkipped,[\s\S]*useState[(]false[)]/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /label="Not now"[\s\S]*setSpotifyConnectSkipped[(]\s*true,[\s\S]*goToStep[(]\s*1,/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /setSpotifyConnectSkipped[(]\s*params[.]spotify ===[\s\S]*"skipped",[\s\S]*params[.]spotify,[\s\S]*user[?][.]id,/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).not.toMatch(
          /AsyncStorage|SecureStore/u,
        );
      },
    );

    it(
      "sends skipped users home without promising unavailable Scene creation",
      () => {
        const skippedBranch =
          ONBOARDING_SOURCE.match(
            /if \(\s*spotifyConnectSkipped\s*\) \{([\s\S]*?)\}\s*else \{[\s\S]*?void finishOnboarding\(\s*"\/scene-studio"/u,
          )?.[1] ??
          "";

        expect(
          skippedBranch,
        ).toMatch(
          /void finishOnboarding[(]\s*"[/][(]tabs[)]",/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /spotifyConnectSkipped[\s\S]*"Continue to Home"[\s\S]*"Shape my first Scene"/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /spotifyConnectSkipped[\s\S]*"Explore"[\s\S]*"Export"/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /spotifyConnectSkipped[\s\S]*"Next: Explore"[\s\S]*"Next: Export"/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /spotifyConnectSkipped[\s\S]*"PUBLIC SCENE"[\s\S]*"YOUR SCENE"/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).not.toMatch(
          /Nothing is blocked/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /if \(\s*spotifyConnectSkipped\s*\)[\s\S]*EXPLORE[\s\S]*Explore public Scenes and creator profiles now/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /spotifyConnectSkipped[\s\S]*"Connect Spotify"[\s\S]*"Go to Home"[\s\S]*pathname:[\s\S]*"\/connect-music"[\s\S]*mode:[\s\S]*"onboarding"/u,
        );
      },
    );

    it(
      "propagates the real connection outcome when returning from Music Services",
      () => {
        expect(
          CONNECT_MUSIC_SOURCE,
        ).toMatch(
          /pathname:[\s\S]*"\/onboarding"[\s\S]*step:[\s\S]*"shape"[\s\S]*spotify:[\s\S]*profile[\s\S]*"connected"[\s\S]*"skipped"/u,
        );
      },
    );

    it(
      "keeps connected completion, Home, Back, and analytics behavior",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /void finishOnboarding[(]\s*"[/]scene-studio",/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          '"Go to Home"',
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /else \{[\s\S]*?void finishOnboarding[(]\s*"[/][(]tabs[)]",[\s\S]*?\}/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          'accessibilityLabel="Back to Shape"',
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /recordAnalyticsFailure[(]\s*"onboarding_complete",[\s\S]*classifyAnalyticsFailure/u,
        );

        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /const expectedUserId =[\s\S]*user[.]id;[\s\S]*await completeOnboarding[(]\s*expectedUserId,\s*destination,/u,
        );
      },
    );

    it(
      "gives the root guard sole authority over the final destination",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).not.toMatch(
          /await completeOnboarding[\s\S]{0,300}router[.]replace/u,
        );

        expect(
          ONBOARDING_LIBRARY_SOURCE,
        ).toMatch(
          /assertOnboardingAccount[(]\s*userId,[\s\S]*AsyncStorage[.]setItem[\s\S]*"complete"[\s\S]*assertOnboardingAccount[(]\s*userId,[\s\S]*notifyUser[(]\s*userId,\s*\{[\s\S]*required: false,[\s\S]*destination,/u,
        );

        expect(
          ONBOARDING_LIBRARY_SOURCE,
        ).not.toMatch(
          /auth[.]updateUser/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /setOnboardingDestination[(]\s*update[.]destination,/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /const fallbackDestination\s*=[\s\S]*rootSegment ===[\s\S]*"onboarding"[\s\S]*onboardingDestination\s*[?][?]\s*"[/][(]tabs[)]"[\s\S]*:\s*"[/][(]tabs[)]"/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /consumePublicSceneReturn[(][)][\s\S]*[.]then[(][\s\S]*returnDestination[\s\S]*router[.]replace[(][\s\S]*returnDestination\s*[?][?]\s*fallbackDestination/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /[.]catch[(][\s\S]*router[.]replace[(]\s*fallbackDestination as never,/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /completionPublished\s*=\s*true[\s\S]*active\s*&&\s*!completionPublished/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /!completionPublished\s*&&\s*readPendingOnboardingDestination[(]\s*userId,[\s\S]*===\s*null/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /rememberPublicSceneReturn[\s\S]*[.]finally[\s\S]*consumePublicSceneReturn/u,
        );

        expect(
          LOGIN_SOURCE,
        ).not.toMatch(
          /continueAfterAccountLogin[\s\S]{0,500}router[.]replace/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /onboardingCheckedUserId\s*!==\s*userId/u,
        );

        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /const expectedUserId\s*=\s*userId[\s\S]*activeUserIdRef[.]current\s*!==\s*expectedUserId[\s\S]*router[.]replace/u,
        );
      },
    );
  },
);
