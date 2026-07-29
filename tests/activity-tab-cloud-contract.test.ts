import {
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
        "app/activity.tsx",
      );

    it(
      "reuses the account-scoped cloud Activity screen",
      () => {
        expect(
          tabSource,
        ).toMatch(
          /import ActivityScreen from ["'][.][.]\/activity["']/,
        );

        expect(
          tabSource,
        ).toMatch(
          /<ActivityScreen\s+embeddedInTabs/,
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
      "uses tab-native navigation and accessible root recovery",
      () => {
        expect(
          activitySource,
        ).toMatch(
          /embeddedInTabs\s*\?\s*\([\s\S]*styles[.]headerSpacer/,
        );

        expect(
          activitySource,
        ).toContain(
          'accessibilityLabel="Go back from Activity"',
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

        expect(
          activitySource,
        ).toContain(
          'router.replace(\n                    "/(tabs)/index",',
        );
      },
    );
  },
);
