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

const SOURCES = {
  home:
    "app/home.tsx",

  notFound:
    "app/+not-found.tsx",

  help:
    "app/help.tsx",

  rootLayout:
    "app/_layout.tsx",

  bottomNav:
    "components/CanalBottomNav.tsx",

  tabLayout:
    "app/(tabs)/_layout.tsx",
} as const;

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

function extractDestinations(
  source: string,
): string[] {
  const routerCalls =
    source.matchAll(
      /router\.(?:push|replace)\(\s*["']([^"']+)["']/g,
    );

  const redirects =
    source.matchAll(
      /<Redirect\s+[^>]*href=["']([^"']+)["']/g,
    );

  return [
    ...Array.from(
      routerCalls,
      (match) =>
        match[1],
    ),

    ...Array.from(
      redirects,
      (match) =>
        match[1],
    ),
  ];
}

function routeExists(
  route: string,
): boolean {
  const routePath =
    route
      .split(/[?#]/u)[0]
      .replace(
        /^\/+/u,
        "",
      );

  const candidates = [
    resolve(
      PROJECT_ROOT,
      "app",
      `${routePath}.tsx`,
    ),

    resolve(
      PROJECT_ROOT,
      "app",
      routePath,
      "index.tsx",
    ),
  ];

  return candidates.some(
    existsSync,
  );
}

describe(
  "core navigation destinations",
  () => {
    const sources =
      Object.fromEntries(
        Object.entries(
          SOURCES,
        ).map(
          ([
            name,
            relativePath,
          ]) => [
            name,
            readSource(
              relativePath,
            ),
          ],
        ),
      ) as Record<
        keyof typeof SOURCES,
        string
      >;

    const destinations =
      Object.fromEntries(
        Object.entries(
          sources,
        ).map(
          ([
            name,
            source,
          ]) => [
            name,
            extractDestinations(
              source,
            ),
          ],
        ),
      ) as Record<
        keyof typeof SOURCES,
        string[]
      >;

    it(
      "routes the legacy home alias and not-found recovery to the tab index",
      () => {
        expect(
          destinations.home,
        ).toContain(
          "/(tabs)",
        );

        expect(
          destinations.notFound,
        ).toContain(
          "/(tabs)",
        );
      },
    );

    it(
      "routes Help creation to Scene Studio",
      () => {
        expect(
          destinations.help,
        ).toContain(
          "/scene-studio",
        );
      },
    );

    it(
      "remounts private route state when the Canal account changes",
      () => {
        expect(
          sources.rootLayout,
        ).toMatch(
          /<Stack\s+key=\{\s*userId\s*\?\?\s*"signed-out"\s*\}/u,
        );
      },
    );

    it(
      "keeps the primary navigation available on authenticated stack routes",
      () => {
        expect(sources.rootLayout).toContain("showPersistentNavigation");
        expect(sources.rootLayout).toContain("<CanalBottomNav />");
        expect(sources.tabLayout).toContain("tabBar={() => (");
        expect(sources.tabLayout).toContain("<CanalBottomNav />");
        expect(sources.bottomNav).toContain('route: "/(tabs)"');
        expect(sources.bottomNav).toContain('route: "/(tabs)/library"');
        expect(sources.bottomNav).toContain('route: "/scene-studio"');
        expect(sources.bottomNav).not.toContain('route: "/(tabs)/activity"');
        expect(sources.bottomNav).toContain('route: "/(tabs)/profile"');
        expect(sources.bottomNav).toContain('route: "/(tabs)/explore"');
      },
    );

    it.each([
      "/(tabs)",
      "/scene-studio",
    ])(
      "resolves %s to an Expo Router file",
      (route) => {
        expect(
          routeExists(
            route,
          ),
        ).toBe(
          true,
        );
      },
    );

    it.each([
      "/(tabs)/home",
      "/scene/create",
    ])(
      "does not reference obsolete destination %s",
      (obsoleteRoute) => {
        for (const source of
          Object.values(
            sources,
          )) {
          expect(
            source,
          ).not.toContain(
            obsoleteRoute,
          );
        }
      },
    );
  },
);
