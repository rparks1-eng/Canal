import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  eventRunSheetLocalDateTimeFromInstant,
  formatEventRunSheetInstant,
  isValidEventRunSheetTimeZone,
  resolveEventRunSheetLocalDateTime,
} from "../lib/event-run-sheet-datetime";

describe(
  "Event Run Sheet stored-zone date and time policy",
  () => {
    it(
      "round-trips an ordinary wall-clock time to one absolute instant",
      () => {
        const resolved =
          resolveEventRunSheetLocalDateTime(
            "2026-08-01T19:00",
            "America/New_York",
          );

        expect(
          resolved,
        ).toEqual({
          instant:
            "2026-08-01T23:00:00.000Z",
          overlap:
            "none",
        });

        expect(
          eventRunSheetLocalDateTimeFromInstant(
            resolved.instant,
            "America/New_York",
          ),
        ).toBe(
          "2026-08-01T19:00",
        );
      },
    );

    it(
      "rejects a daylight-saving gap instead of silently shifting it",
      () => {
        expect(() =>
          resolveEventRunSheetLocalDateTime(
            "2026-03-08T02:30",
            "America/New_York",
          ),
        ).toThrow(
          /does not exist/i,
        );
      },
    );

    it(
      "uses the earlier absolute instant for an overlapping local time",
      () => {
        expect(
          resolveEventRunSheetLocalDateTime(
            "2026-11-01T01:30",
            "America/New_York",
          ),
        ).toEqual({
          instant:
            "2026-11-01T05:30:00.000Z",
          overlap:
            "earlier",
        });
      },
    );

    it(
      "validates IANA zones and formats the stored instant in that zone",
      () => {
        expect(
          isValidEventRunSheetTimeZone(
            "America/New_York",
          ),
        ).toBe(
          true,
        );
        expect(
          isValidEventRunSheetTimeZone(
            "GMT+500",
          ),
        ).toBe(
          false,
        );
        expect(
          formatEventRunSheetInstant(
            "2026-08-01T23:00:00.000Z",
            "America/New_York",
          ),
        ).not.toBe(
          "Schedule unavailable",
        );
      },
    );
  },
);
