import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "@jest/globals";

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
  "explicit recovery states",
  () => {
    it(
      "keeps app-wide connectivity recovery silent",
      () => {
        const layout =
          readSource(
            "app/_layout.tsx",
          );

        expect(
          layout,
        ).toMatch(
          /<ConnectivityProvider>[\s\S]*<AuthProvider>/,
        );

        expect(
          layout,
        ).not.toContain(
          "ConnectivityBanner",
        );
      },
    );

    it.each([
      "app/(tabs)/library.tsx",
      "app/(tabs)/explore.tsx",
      "components/activity-screen.tsx",
    ])(
      "gives %s an inline recovery action and reconnect reload",
      (relativePath) => {
        const source =
          readSource(
            relativePath,
          );

        expect(
          source,
        ).toContain(
          "classifyRecoveryIssue",
        );

        expect(
          source,
        ).toContain(
          "RecoveryNotice",
        );

        expect(
          source,
        ).toMatch(
          /\buseReconnectReload\s*\(/,
        );

        expect(
          source,
        ).toMatch(
          /\brefreshConnectivity\s*\(\s*\)/,
        );
      },
    );
  },
);
