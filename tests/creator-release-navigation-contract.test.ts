import {
  describe,
  expect,
  it,
} from "@jest/globals";

import fs from "node:fs";
import path from "node:path";

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
  "Creator Release Ballot navigation",
  () => {
    const layout =
      source(
        "app/_layout.tsx",
      );

    const createTab =
      source(
        "app/(tabs)/create.tsx",
      );

    const collection =
      source(
        "app/collections/[collectionId].tsx",
      );

    it(
      "registers list, create, and detail routes in the account-remounted stack",
      () => {
        expect(
          layout,
        ).toContain(
          'name="releases/index"',
        );
        expect(
          layout,
        ).toContain(
          'name="releases/new"',
        );
        expect(
          layout,
        ).toContain(
          'name="releases/[releaseId]"',
        );
      },
    );

    it(
      "links the Create tab to ballot creation and discovery",
      () => {
        expect(
          createTab,
        ).toContain(
          '"/releases/new"',
        );
        expect(
          createTab,
        ).toContain(
          '"/releases"',
        );
        expect(
          createTab,
        ).toContain(
          'accessibilityLabel="Browse creator releases"',
        );
      },
    );

    it(
      "offers ballot creation only from an owned public collection",
      () => {
        expect(
          collection,
        ).toMatch(
          /isOwner[\s\S]*collection[.]isPublic[\s\S]*pathname:[\s\S]*"[/]releases[/]new"[\s\S]*collectionId:/u,
        );
        expect(
          collection,
        ).toContain(
          "Start a Release Ballot from",
        );
      },
    );
  },
);
