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
  "Scene collection route contract",
  () => {
    const layout =
      source(
        "app/_layout.tsx",
      );

    const createRoute =
      source(
        "app/collections/new.tsx",
      );

    const detailRoute =
      source(
        "app/collections/[collectionId].tsx",
      );

    it(
      "registers create and dynamic detail routes",
      () => {
        expect(
          layout,
        ).toContain(
          'name="collections/new"',
        );
        expect(
          layout,
        ).toContain(
          'name="collections/[collectionId]"',
        );
      },
    );

    it(
      "publishes an ordered nonempty selection of owner public Scenes",
      () => {
        expect(
          createRoute,
        ).toMatch(
          /readScenes[(][)][\s\S]*libraryType !==[\s\S]*"saved"[\s\S]*visibility ===[\s\S]*"public"/,
        );
        expect(
          createRoute,
        ).toMatch(
          /isPublic[\s\S]*selectedIds[.]size ===[\s\S]*0[\s\S]*saveSceneCollection[(][\s\S]*isPublic,[\s\S]*sceneIds:[\s\S]*Array[.]from/,
        );
        expect(
          createRoute,
        ).toContain(
          'accessibilityRole="checkbox"',
        );
      },
    );

    it(
      "loads ordered collection detail and limits edit and delete controls to the owner",
      () => {
        expect(
          detailRoute,
        ).toMatch(
          /loadSceneCollection[(][\s\S]*collectionId/,
        );
        expect(
          detailRoute,
        ).toMatch(
          /const isOwner[\s\S]*user[?][.]id ===[\s\S]*collection[.]ownerId/,
        );
        expect(
          detailRoute,
        ).toContain(
          "{isOwner ? (",
        );
        expect(
          detailRoute,
        ).toMatch(
          /collection[.]items[.]map[\s\S]*position[\s\S]*item[.]scene[.]visibility !==[\s\S]*"public"/,
        );
        expect(
          detailRoute,
        ).toContain(
          '"/scenes/[sceneId]"',
        );
        expect(
          detailRoute,
        ).toContain(
          '"/public-scene"',
        );
        expect(
          detailRoute,
        ).toMatch(
          /deleteSceneCollection[(][\s\S]*collection[.]id/,
        );
      },
    );
  },
);
