import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

const PROJECT_ROOT =
  resolve(
    __dirname,
    "..",
  );

function readSource(
  relativePath: string,
): string {
  return readFileSync(
    resolve(
      PROJECT_ROOT,
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "cloud Activity tab",
  () => {
    const tabSource =
      readSource(
        "app/(tabs)/activity.tsx",
      );

    const activitySource =
      readSource(
        "components/activity-screen.tsx",
      );

    it(
      "uses one canonical tab route backed by a shared component",
      () => {
        expect(
          tabSource,
        ).toMatch(
          /import ActivityScreen from ["'][.][.]\/[.][.]\/components\/activity-screen["']/,
        );

        expect(
          tabSource,
        ).toMatch(
          /import\s*\{\s*useAuth\s*\}\s*from\s*["'][.][.][/][.][.][/]providers[/]auth-provider["']/,
        );

        expect(
          tabSource,
        ).toMatch(
          /const\s*\{\s*accountEpoch\s*,\s*sessionGeneration\s*,\s*user\s*\}\s*=\s*useAuth\s*\(\s*\)/,
        );

        expect(
          tabSource,
        ).toMatch(
          /<ActivityScreen\s+key=\{`\$\{user[?][.]id\s*[?][?]\s*"signed-out"\}:\$\{accountEpoch\}:\$\{sessionGeneration\s*[?][?]\s*"session-pending"\}`\}\s*\/>/,
        );

        expect(
          existsSync(
            resolve(
              PROJECT_ROOT,
              "app/activity.tsx",
            ),
          ),
        ).toBe(
          false,
        );

        expect(
          activitySource,
        ).toMatch(
          /from ["'][.][.]\/lib\/relationships["']/,
        );

        expect(
          activitySource,
        ).toMatch(
          /\breadActivity\s*\(\s*\)/,
        );

        expect(
          activitySource,
        ).toMatch(
          /\bmarkAllActivityRead\s*\(\s*\)/,
        );
      },
    );

    it(
      "does not restore the obsolete device-only social preview",
      () => {
        expect(
          tabSource,
        ).not.toMatch(
          /canal-session|readListeningHistory|readSharedSnapshots|toggleSnapshotLike/,
        );

        expect(
          activitySource,
        ).not.toMatch(
          /Local social preview|real multi-user feed requires the cloud backend/i,
        );
      },
    );

    it(
      "uses tab-native navigation and accessible controls",
      () => {
        expect(
          activitySource,
        ).toMatch(
          /<View[\s\S]*styles[.]headerSpacer[\s\S]*\/>/,
        );

        expect(
          activitySource,
        ).toContain(
          'accessibilityLabel="Clear Activity history"',
        );

        expect(
          activitySource,
        ).toMatch(
          /accessibilityLabel=\{`\$\{item[.]title\}[.] \$\{item[.]description\}`\}/,
        );

      },
    );
  },
);
