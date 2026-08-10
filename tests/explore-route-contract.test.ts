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
      "keeps the canonical tab Scenes-first with a separate Live Stages view",
      () => {
        const source =
          readSource(
            "app/(tabs)/explore.tsx",
          );

        expect(
          source,
        ).toMatch(
          /\bloadExploreScenes\s*\(/,
        );
        expect(source).toContain('accessibilityLabel="Show Scenes"');
        expect(source).toContain('accessibilityLabel="Show Live Stages"');
        expect(source).toContain('title="Activities"');
        expect(source).toContain('title="Moods"');
        expect(source).toContain('title="Genres"');
        expect(source).toContain("Verified creators");
        expect(source).not.toContain("loadPublicSnapshotFeed");
      },
    );

    it("nests public Snapshots inside their source Scene or Stage", () => {
      const sceneSource = readSource("app/public-scene.tsx");
      const stageSource = readSource("app/live-stage/[stageId].tsx");

      expect(sceneSource).toContain("loadPublicSourceSnapshots(sceneId, ownerId)");
      expect(sceneSource).toContain("Snapshots from this Scene");
      expect(sceneSource).toContain("<PublicSnapshotGrid snapshots={sceneSnapshots} />");
      expect(stageSource).toContain('sceneId: `stage-${stage.id}`');
      expect(stageSource).toContain("Snapshots from this Stage");
      expect(stageSource).toContain("<PublicSnapshotGrid snapshots={stageSnapshots} />");
    });
  },
);
