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
  "private Event Run Sheet route contract",
  () => {
    const layout =
      source(
        "app/_layout.tsx",
      );

    const route =
      source(
        "app/event-run-sheet.tsx",
      );

    const collectionDetail =
      source(
        "app/collections/[collectionId].tsx",
      );

    it(
      "registers an account-remounted private creator route from an owned collection",
      () => {
        expect(
          layout,
        ).toContain(
          'name="event-run-sheet"',
        );
        expect(
          collectionDetail,
        ).toMatch(
          /isOwner[\s\S]*pathname:[\s\S]*"[/]event-run-sheet"[\s\S]*collectionId:/,
        );
        expect(
          route,
        ).toMatch(
          /<EventRunSheetContent[\s\S]*key=\{[\s\S]*user[?][.]id[\s\S]*"signed-out"/,
        );
        expect(
          route,
        ).toContain(
          "PRIVATE CREATOR TOOL",
        );
      },
    );

    it(
      "uses the SDK-compatible native date picker with an accessible web fallback",
      () => {
        expect(
          route,
        ).toContain(
          '@react-native-community/datetimepicker',
        );
        expect(
          route,
        ).toContain(
          'Platform.OS ===',
        );
        expect(
          route,
        ).toContain(
          'accessibilityLabel="Choose event date"',
        );
        expect(
          route,
        ).toContain(
          'accessibilityLabel="Choose event time"',
        );
        expect(
          route,
        ).toContain(
          'contentInsetAdjustmentBehavior="automatic"',
        );
      },
    );

    it(
      "saves owner-only venue metadata and advances collection Scenes with CAS",
      () => {
        expect(
          route,
        ).toMatch(
          /saveEventRunSheet[(]\{[\s\S]*collectionId:[\s\S]*title,[\s\S]*venueLabel,[\s\S]*startsAt:[\s\S]*toISOString[(][)][\s\S]*timeZone/,
        );
        expect(
          route,
        ).toMatch(
          /advanceEventRunSheet[(][\s\S]*runSheet[.]id,[\s\S]*runSheet[.]activePosition/,
        );
        expect(
          route,
        ).toContain(
          "deleteEventRunSheet",
        );
        expect(
          route,
        ).not.toMatch(
          /createStage|joinStage|live-stages|Realtime|attendee|ticket/i,
        );
      },
    );
  },
);
