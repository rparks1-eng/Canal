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
  "private frozen Event Run Sheet route contract",
  () => {
    const layout =
      source(
        "app/_layout.tsx",
      );

    const legacyRoute =
      source(
        "app/event-run-sheet.tsx",
      );

    const hub =
      source(
        "app/event-run-sheets/index.tsx",
      );

    const builder =
      source(
        "app/event-run-sheets/new.tsx",
      );

    const run =
      source(
        "app/event-run-sheets/[runSheetId].tsx",
      );

    const createTab =
      source(
        "app/(tabs)/create.tsx",
      );

    const collectionDetail =
      source(
        "app/collections/[collectionId].tsx",
      );

    it(
      "registers a hub, builder, and run route while preserving old deep links",
      () => {
        expect(
          layout,
        ).toContain(
          'name="event-run-sheets/index"',
        );
        expect(
          layout,
        ).toContain(
          'name="event-run-sheets/new"',
        );
        expect(
          layout,
        ).toContain(
          'name="event-run-sheets/[runSheetId]"',
        );
        expect(
          legacyRoute,
        ).toContain(
          "Redirect",
        );
        expect(
          legacyRoute,
        ).toContain(
          '"/event-run-sheets/[runSheetId]"',
        );
        expect(
          legacyRoute,
        ).toContain(
          '"/event-run-sheets/new"',
        );
      },
    );

    it(
      "offers owner entry points from Create and collection detail",
      () => {
        expect(
          createTab,
        ).toContain(
          "Plan an Event Run Sheet",
        );
        expect(
          createTab,
        ).toContain(
          'router.push(\n            "/event-run-sheets/new"',
        );
        expect(
          createTab,
        ).toContain(
          "Browse Event Run Sheets",
        );
        expect(
          collectionDetail,
        ).toMatch(
          /isOwner[\s\S]*pathname:[\s\S]*"[/]event-run-sheets[/]new"[\s\S]*collectionId:/,
        );
      },
    );

    it(
      "remounts per account and prevents stale hub navigation during reload or offline recovery",
      () => {
        expect(
          hub,
        ).toMatch(
          /<EventRunSheetHubContent[\s\S]*key=\{[\s\S]*user[?][.]id[\s\S]*expectedUserId=/,
        );
        expect(
          hub,
        ).toContain(
          "eventRunSheetRequestCanCommit",
        );
        expect(
          hub,
        ).toContain(
          "useReconnectReload",
        );
        expect(
          hub,
        ).toMatch(
          /isLoading \|\|[\s\S]*!hasFreshSnapshot/,
        );
        expect(
          hub,
        ).toContain(
          'accessibilityRole="radiogroup"',
        );
        expect(
          hub,
        ).toContain(
          'accessibilityRole="radio"',
        );
        expect(
          hub,
        ).toMatch(
          /filter:[\s\S]*minHeight:[\s\S]*48/,
        );
      },
    );

    it(
      "builds planned sheets with stored-zone DST policy and fresh online mutation guards",
      () => {
        expect(
          builder,
        ).toMatch(
          /<EventRunSheetBuilderContent[\s\S]*key=\{[\s\S]*user[?][.]id[\s\S]*expectedUserId=/,
        );
        expect(
          builder,
        ).toContain(
          "captureEventRunSheetAccount",
        );
        expect(
          builder,
        ).toContain(
          "eventRunSheetMutationIsBlocked",
        );
        expect(
          builder,
        ).toContain(
          "resolveEventRunSheetLocalDateTime",
        );
        expect(
          builder,
        ).toContain(
          "Daylight-saving gaps are rejected",
        );
        expect(
          builder,
        ).toContain(
          "@react-native-community/datetimepicker",
        );
        expect(
          builder,
        ).toContain(
          'accessibilityLabel="Choose event date"',
        );
        expect(
          builder,
        ).toContain(
          'accessibilityLabel="Choose event time"',
        );
        expect(
          builder,
        ).toContain(
          'accessibilityRole="radiogroup"',
        );
        expect(
          builder,
        ).toContain(
          'accessibilityRole="radio"',
        );
        expect(
          builder,
        ).toMatch(
          /collectionOption:[\s\S]*minHeight:[\s\S]*64/,
        );
        expect(
          builder,
        ).toMatch(
          /saveEventRunSheet[(][\s\S]*startEventRunSheet[(]/,
        );
      },
    );

    it(
      "runs only from frozen item data with version and position compare-and-swap",
      () => {
        expect(
          run,
        ).toMatch(
          /<EventRunSheetDetailContent[\s\S]*key=\{[\s\S]*user[?][.]id[\s\S]*expectedUserId=/,
        );
        expect(
          run,
        ).toContain(
          "eventRunSheetMutationIsBlocked",
        );
        expect(
          run,
        ).toMatch(
          /advanceEventRunSheet[(][\s\S]*detail[.]id,[\s\S]*detail[.]activePosition,[\s\S]*detail[.]version/,
        );
        expect(
          run,
        ).toMatch(
          /completeEventRunSheet[(][\s\S]*detail[.]id,[\s\S]*detail[.]activePosition,[\s\S]*detail[.]version/,
        );
        expect(
          run,
        ).toContain(
          "Frozen Scene order",
        );
        expect(
          run,
        ).toContain(
          "retained summary",
        );
        expect(
          run,
        ).not.toMatch(
          /loadSceneCollection|public-scene|scenes[/]\[sceneId\]|LiveStage|Release Ballot/,
        );
      },
    );

    it(
      "exposes loading, empty, offline, stale, retry, completed, and accessible busy states",
      () => {
        const allRoutes = [
          hub,
          builder,
          run,
        ].join(
          "\n",
        );

        expect(
          allRoutes,
        ).toContain(
          "RecoveryNotice",
        );
        expect(
          allRoutes,
        ).toContain(
          "useReconnectReload",
        );
        expect(
          allRoutes,
        ).toContain(
          '"offline"',
        );
        expect(
          allRoutes,
        ).toContain(
          "hasFreshSnapshot",
        );
        expect(
          allRoutes,
        ).toContain(
          'accessibilityRole="progressbar"',
        );
        expect(
          allRoutes,
        ).toContain(
          "accessibilityState",
        );
        expect(
          hub,
        ).toContain(
          "No Event Run Sheets yet",
        );
        expect(
          run,
        ).toContain(
          "Run completed",
        );
      },
    );
  },
);
