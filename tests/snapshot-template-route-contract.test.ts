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
  "Snapshot template route contract",
  () => {
    const layout =
      source(
        "app/_layout.tsx",
      );

    const templateRoute =
      source(
        "app/snapshot-templates.tsx",
      );

    const composer =
      source(
        "app/scene-snapshot.tsx",
      );

    const publicCard =
      source(
        "components/PublicSnapshotCard.tsx",
      );

    const detailRoute =
      source(
        "app/snapshots/[snapshotId].tsx",
      );

    const composition =
      source(
        "components/snapshot-composition.tsx",
      );

    const profileRoute =
      source(
        "app/(tabs)/profile.tsx",
      );

    it(
      "registers an account-remounted owner management route",
      () => {
        expect(
          layout,
        ).toContain(
          'name="snapshot-templates"',
        );

        expect(
          templateRoute,
        ).toMatch(
          /<SnapshotTemplatesContent[\s\S]*key=\{[\s\S]*user[?][.]id[\s\S]*"signed-out"/,
        );

        expect(
          templateRoute,
        ).toContain(
          "listOwnSnapshotTemplates",
        );
        expect(
          templateRoute,
        ).toContain(
          "saveSnapshotTemplate",
        );
        expect(
          templateRoute,
        ).toContain(
          "deleteSnapshotTemplate",
        );
        expect(
          templateRoute.match(
            /const refreshed =\s*await loadTemplates\(\)/g,
          ),
        ).toHaveLength(
          2,
        );
      },
    );

    it(
      "offers only accessible fixed presets and a default choice",
      () => {
        expect(
          templateRoute,
        ).toContain(
          "SNAPSHOT_TEMPLATE_THEMES",
        );
        expect(
          templateRoute,
        ).toContain(
          'accessibilityRole="radiogroup"',
        );
        expect(
          templateRoute,
        ).toContain(
          'accessibilityRole="radio"',
        );
        expect(
          templateRoute,
        ).toMatch(
          /accessibilityState=\{\{[\s\S]*checked:/,
        );
        expect(
          templateRoute,
        ).toContain(
          "isDefault",
        );
        expect(
          templateRoute,
        ).toContain(
          'contentInsetAdjustmentBehavior="automatic"',
        );
        expect(
          templateRoute,
        ).not.toMatch(
          /hex|color picker|backgroundColorInput/i,
        );
      },
    );

    it(
      "applies an automatic built-in style to Scene publication",
      () => {
        expect(
          composer,
        ).toContain(
          "BUILT_IN_SNAPSHOT_STYLES",
        );
        expect(
          composer,
        ).not.toContain(
          "listOwnSnapshotTemplates",
        );
        expect(
          composer,
        ).toContain(
          'accessibilityRole="radiogroup"',
        );
        expect(
          composer,
        ).toContain(
          'accessibilityRole="radio"',
        );
        expect(
          composer,
        ).toMatch(
          /createSnapshotWithStatus\(\{[\s\S]*templateBrandLabel:[\s\S]*selectedTemplate[?][.]brandLabel[\s\S]*templateTheme:[\s\S]*selectedTemplate[?][.]theme/,
        );
        expect(
          composer,
        ).not.toContain(
          '"/snapshot-templates" as never',
        );
      },
    );

    it(
      "renders only server-hydrated immutable provenance on public surfaces",
      () => {
        for (const renderedSource of [publicCard, detailRoute]) {
          expect(
            renderedSource,
          ).toContain(
            "SnapshotComposition",
          );
          expect(
            renderedSource,
          ).not.toContain(
            "snapshot.template.",
          );
        }

        expect(composition).toContain("snapshot.templateBrandLabel");
        expect(composition).toContain("snapshot.templateTheme");

        expect(composition).toContain('{snapshot.templateBrandLabel || "canal"}');
      },
    );

    it(
      "removes user-owned template management from the owner profile",
      () => {
        expect(
          profileRoute,
        ).not.toContain(
          "listOwnSnapshotTemplates",
        );
        expect(
          profileRoute,
        ).not.toContain(
          "Snapshot Templates",
        );
        expect(
          profileRoute,
        ).not.toContain(
          '"/snapshot-templates" as never',
        );
        expect(
          profileRoute,
        ).not.toContain(
          'accessibilityLabel="Manage Snapshot templates"',
        );
      },
    );
  },
);
