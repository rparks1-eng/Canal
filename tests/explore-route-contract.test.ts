import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "@jest/globals";

function readSource(
  relativePath: string,
): string {
  return readFileSync(
    join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

function normalizeWhitespace(
  value: string,
): string {
  return value.replace(
    /\s+/g,
    " ",
  );
}

describe(
  "Explore route contract",
  () => {
    it(
      "redirects the root Explore route to the canonical tab",
      () => {
        const source =
          normalizeWhitespace(
            readSource(
              "app/explore.tsx",
            ),
          );

        expect(
          source,
        ).toContain(
          'import { Redirect } from "expo-router";',
        );

        expect(
          source,
        ).toContain(
          '<Redirect href="/(tabs)/explore" />',
        );

        expect(
          source,
        ).not.toContain(
          "public-scenes",
        );
      },
    );

    it(
      "keeps the canonical tab connected to public Snapshots and Scenes",
      () => {
        const source =
          readSource(
            "app/(tabs)/explore.tsx",
          );

        expect(
          source,
        ).toMatch(
          /\bloadPublicSnapshotFeed\s*\(\s*\)/,
        );

        expect(
          source,
        ).toMatch(
          /\bloadExploreScenes\s*\(\s*\)/,
        );
      },
    );
  },
);
