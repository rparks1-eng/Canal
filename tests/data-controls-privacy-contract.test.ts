import fs from "node:fs";
import path from "node:path";

describe(
  "Data Controls privacy contract",
  () => {
    const screen =
      fs.readFileSync(
        path.join(
          process.cwd(),
          "app",
          "data-controls.tsx",
        ),
        "utf8",
      );

    const settings =
      fs.readFileSync(
        path.join(
          process.cwd(),
          "app",
          "settings.tsx",
        ),
        "utf8",
      );

    const dataControls =
      fs.readFileSync(
        path.join(
          process.cwd(),
          "lib",
          "data-controls.ts",
        ),
        "utf8",
      );

    it(
      "makes analytics explicit, default-off, accessible, and content-free",
      () => {
        expect(
          screen,
        ).toContain(
          "Share limited usage analytics",
        );

        expect(
          screen,
        ).toContain(
          "Off by default",
        );

        expect(
          screen,
        ).toContain(
          "accessibilityState",
        );

        expect(
          screen,
        ).toContain(
          "Delete Analytics History",
        );

        expect(
          screen,
        ).toMatch(
          /never[\s\S]*passwords[\s\S]*emails[\s\S]*reset links[\s\S]*tokens[\s\S]*raw[\s\S]*errors[\s\S]*tracks/i,
        );
      },
    );

    it(
      "links Data Controls from Settings",
      () => {
        expect(
          settings,
        ).toContain(
          '"/data-controls"',
        );

        expect(
          settings,
        ).toContain(
          'accessibilityLabel="Open Data Controls"',
        );
      },
    );

    it(
      "keeps device clearing local and does not silently delete cloud relationships",
      () => {
        expect(
          screen,
        ).toMatch(
          /Clearing this device is not\s+account deletion/,
        );

        expect(
          screen,
        ).toMatch(
          /does not delete your\s+Canal account or most\s+cloud data/,
        );

        expect(
          dataControls,
        ).not.toMatch(
          /clearActivity|clearRelationships/,
        );
      },
    );
  },
);
