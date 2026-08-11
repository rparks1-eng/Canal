import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

function source(
  path: string,
): string {
  return readFileSync(
    resolve(
      __dirname,
      "..",
      path,
    ),
    "utf8",
  );
}

const ONBOARDING_SOURCE =
  source(
    "app/onboarding.tsx",
  );
const LOGIN_SOURCE =
  source(
    "app/login.tsx",
  );
const CONNECT_MUSIC_SOURCE =
  source(
    "app/connect-music.tsx",
  );
const ROOT_LAYOUT_SOURCE =
  source(
    "app/_layout.tsx",
  );
const ONBOARDING_LIBRARY_SOURCE =
  source(
    "lib/onboarding.ts",
  );
const ONBOARDING_SEED_SOURCE =
  source(
    "lib/onboarding-scene-seed.ts",
  );
const SCENE_STUDIO_ROUTE_SOURCE =
  source(
    "app/scene-studio.tsx",
  );
const SCENE_STUDIO_LIBRARY_SOURCE =
  source(
    "lib/scene-studio.ts",
  );
const UI_SOURCE =
  source(
    "components/auth-onboarding-ui.tsx",
  );

describe(
  "refined authentication and onboarding",
  () => {
    it(
      "renders the complete staged setup with adaptive immersive chrome",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /"Music",[\s\S]*"Identity",[\s\S]*"Taste",[\s\S]*"First Scene",[\s\S]*"Ready"/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /OnboardingAtmosphere[\s\S]*OnboardingHeader[\s\S]*OnboardingPanel/u,
        );
        expect(
          UI_SOURCE,
        ).toContain(
          "experimental_backgroundImage",
        );
        expect(
          UI_SOURCE,
        ).toContain(
          "linear-gradient",
        );
        expect(
          UI_SOURCE,
        ).toContain(
          "accessibilityState={{",
        );
        expect(
          UI_SOURCE,
        ).toMatch(
          /actionButton:\s*\{[\s\S]*minHeight:\s*48/u,
        );
      },
    );

    it(
      "keeps Spotify optional and returns the real provider outcome",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /spotifyConnectSkipped,[\s\S]*setSpotifyConnectSkipped/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /"Continue without Spotify"[\s\S]*setSpotifyConnectSkipped/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /pathname:[\s\S]*"\/connect-music"[\s\S]*mode:[\s\S]*"onboarding"/u,
        );
        expect(
          CONNECT_MUSIC_SOURCE,
        ).toMatch(
          /pathname:[\s\S]*"\/onboarding"[\s\S]*step:[\s\S]*"shape"[\s\S]*spotify:[\s\S]*profile[\s\S]*"connected"[\s\S]*"skipped"/u,
        );
      },
    );

    it(
      "validates required taste choices and caps moods at five without silent replacement",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /!activity[\s\S]*Choose at least one activity before continuing/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /moods[.]length ===[\s\S]*0[\s\S]*Choose at least one mood before continuing/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /current[.]length >=[\s\S]*5[\s\S]*Remove one before adding another/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          "${props.moods.length}/5 selected",
        );
      },
    );

    it(
      "connects identity customization and contextual permission timing",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          'router.push(\n                    "/profile-picture" as never,',
        );
        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          'label="Activity notifications"',
        );
        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          'detail="Asked after an invite, reaction, comment, follow, or Stage change"',
        );
        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          'label="Camera and microphone"',
        );
        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          'detail="Requested only when you open Snapshot capture"',
        );
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /Cross-device sync[\s\S]*Ready/u,
        );
      },
    );

    it(
      "persists one account-scoped first-Scene seed before completion and consumes it once",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /activity &&[\s\S]*moods[.]length > 0[\s\S]*await writeOnboardingSceneSeed[\s\S]*await completeOnboarding/u,
        );
        expect(
          ONBOARDING_SEED_SOURCE,
        ).toMatch(
          /@canal\/onboarding\/scene-seed\/\$\{userId\}/u,
        );
        expect(
          ONBOARDING_SEED_SOURCE,
        ).toMatch(
          /assertCurrentUser[\s\S]*AsyncStorage[.]setItem[\s\S]*assertCurrentUser/u,
        );
        expect(
          ONBOARDING_SEED_SOURCE,
        ).toMatch(
          /consumeOnboardingSceneSeed[\s\S]*AsyncStorage[.]removeItem/u,
        );
        expect(
          SCENE_STUDIO_ROUTE_SOURCE,
        ).toMatch(
          /consumeOnboardingSceneSeed[\s\S]*freshDraft[\s\S]*onboardingSeed[\s\S]*setDraft/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toContain(
          '"Go to Home"',
        );
        expect(
          ONBOARDING_SOURCE,
        ).not.toContain(
          '"Finish later"',
        );
      },
    );

    it(
      "makes adjacent-genre behavior a real Scene generator preference",
      () => {
        expect(
          SCENE_STUDIO_ROUTE_SOURCE,
        ).toMatch(
          /accessibilityLabel="Allow adjacent sounds"[\s\S]*allowAdjacentGenres/u,
        );
        expect(
          SCENE_STUDIO_LIBRARY_SOURCE,
        ).toMatch(
          /allowAdjacentGenres: boolean/u,
        );
        expect(
          SCENE_STUDIO_LIBRARY_SOURCE,
        ).toMatch(
          /const selectionPool = draft[.]allowAdjacentGenres[\s\S]*strictCandidates[\s\S]*adjacentCandidates/u,
        );
      },
    );

    it(
      "validates auth fields, supports password reveal, and displays preserved return context without consuming it",
      () => {
        expect(
          LOGIN_SOURCE,
        ).toMatch(
          /validateFields[\s\S]*valid email address[\s\S]*at least 8 characters/u,
        );
        expect(
          LOGIN_SOURCE,
        ).toMatch(
          /secureTextEntry=[\s\S]*!showPassword/u,
        );
        expect(
          LOGIN_SOURCE,
        ).toContain(
          '"Show password"',
        );
        expect(
          LOGIN_SOURCE,
        ).toContain(
          '"Hide password"',
        );
        expect(
          LOGIN_SOURCE,
        ).toMatch(
          /readPublicSceneReturn[\s\S]*Your shared Scene is waiting/u,
        );
        expect(
          LOGIN_SOURCE,
        ).not.toMatch(
          /consumePublicSceneReturn/u,
        );
        expect(
          LOGIN_SOURCE,
        ).toMatch(
          /const updateField =[\s\S]*delete next\[field\][\s\S]*Check the highlighted fields and try again/u,
        );
        expect(
          LOGIN_SOURCE,
        ).not.toContain(
          "By continuing, you agree",
        );
      },
    );

    it(
      "keeps the root navigator as the sole final-destination authority",
      () => {
        expect(
          ONBOARDING_SOURCE,
        ).not.toMatch(
          /await completeOnboarding[\s\S]{0,300}router[.]replace/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /recordAnalyticsFailure[(][\s\S]*"onboarding_complete"[\s\S]*classifyAnalyticsFailure/u,
        );
        expect(
          ONBOARDING_SOURCE,
        ).toMatch(
          /const expectedUserId =[\s\S]*user[.]id;[\s\S]*await completeOnboarding[(][\s\S]*expectedUserId,[\s\S]*destination,/u,
        );
        expect(
          ONBOARDING_LIBRARY_SOURCE,
        ).toMatch(
          /assertOnboardingAccount[(][\s\S]*AsyncStorage[.]setItem[\s\S]*"complete"[\s\S]*assertOnboardingAccount[(][\s\S]*notifyUser/u,
        );
        expect(
          ROOT_LAYOUT_SOURCE,
        ).toMatch(
          /consumePublicSceneReturn[(][)][\s\S]*returnDestination[\s\S]*router[.]replace/u,
        );
        expect(
          LOGIN_SOURCE,
        ).not.toMatch(
          /continueAfterAccountLogin[\s\S]{0,500}router[.]replace/u,
        );
      },
    );
  },
);
