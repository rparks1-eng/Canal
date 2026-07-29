import {
  describe,
  expect,
  it,
} from "@jest/globals";

import fs from "node:fs";
import path from "node:path";

import smokeCases from "../fixtures/release-ballot-smoke-cases.json";

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
  "Release Ballot isolated simulator smoke lane",
  () => {
    const route =
      source(
        "app/auth/release-ballot-smoke.tsx",
      );

    const runner =
      source(
        "script/release_ballot_smoke.cjs",
      );

    it(
      "covers the requested ballot lifecycle and recovery matrix",
      () => {
        const expectedIds = [
          "browse",
          "detail-owner",
          "detail-contributor",
          "detail-vote",
          "detail-change-vote",
          "detail-results",
          "loading",
          "empty",
          "error",
          "offline",
          "reconnect",
          "blocked",
          "lifecycle",
          "account-switch",
        ];

        expect(
          smokeCases.map(
            ({
              id,
            }) => id,
          ),
        ).toEqual(
          expectedIds,
        );

        for (
          const id of
            expectedIds
        ) {
          expect(
            route,
          ).toContain(
            `"${id}"`,
          );
        }
      },
    );

    it(
      "is development-only and loads no authenticated service data",
      () => {
        expect(
          route,
        ).toMatch(
          /__DEV__[\s\S]*EXPO_PUBLIC_CANAL_RELEASE_BALLOT_SMOKE[\s\S]*===\s*"1"/u,
        );

        expect(
          route,
        ).toContain(
          '<Redirect href="/login" />',
        );

        expect(
          route,
        ).not.toContain(
          'from "../../lib/supabase"',
        );

        expect(
          route,
        ).not.toContain(
          "captureCreatorReleaseAccount",
        );

        expect(
          runner,
        ).toContain(
          'EXPO_NO_DOTENV: "1"',
        );

        expect(
          runner,
        ).toContain(
          "networkCredentialsLoaded:",
        );

        expect(
          runner,
        ).toContain(
          "productionDataMutated:",
        );
      },
    );

    it(
      "uses accessible 48-point controls and semantic states",
      () => {
        expect(
          route,
        ).toContain(
          "minHeight: 48",
        );

        expect(
          route,
        ).toContain(
          'accessibilityRole="radiogroup"',
        );

        expect(
          route,
        ).toContain(
          'accessibilityRole="radio"',
        );

        expect(
          route,
        ).toContain(
          "accessibilityState",
        );

        expect(
          route,
        ).toContain(
          'accessibilityLiveRegion="assertive"',
        );

        expect(
          route,
        ).toMatch(
          /<ScrollView[\s\S]*key=\{[\s\S]*scenario[.]id[\s\S]*\}/u,
        );
      },
    );

    it(
      "proves every fixture through screenshot OCR and relaunches the lifecycle case",
      () => {
        expect(
          runner,
        ).toContain(
          "recognizeScreenshots",
        );

        expect(
          runner,
        ).toContain(
          "missingExpectedText",
        );

        expect(
          runner,
        ).toMatch(
          /scenario[.]relaunch[\s\S]*terminateApp/u,
        );

        expect(
          runner,
        ).toContain(
          "screenshotSha256",
        );
      },
    );
  },
);
