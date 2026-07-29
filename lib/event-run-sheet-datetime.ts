export type EventRunSheetDateTimeResolution =
  Readonly<{
    instant: string;
    overlap:
      | "none"
      | "earlier";
  }>;

type WallClockParts =
  Readonly<{
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  }>;

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const formatterCache =
  new Map<
    string,
    Intl.DateTimeFormat
  >();

export function resolvedEventRunSheetTimeZone(): string {
  const timeZone =
    Intl.DateTimeFormat()
      .resolvedOptions()
      .timeZone;

  return isValidEventRunSheetTimeZone(
    timeZone,
  )
    ? timeZone
    : "UTC";
}

export function isValidEventRunSheetTimeZone(
  value: unknown,
): value is string {
  if (
    typeof value !==
      "string" ||
    value.length ===
      0 ||
    value.length >
      64 ||
    /[\u0000-\u001f\u007f]/.test(
      value,
    )
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          value,
      },
    ).format(
      new Date(0),
    );

    return true;
  } catch {
    return false;
  }
}

export function eventRunSheetLocalDateTimeFromInstant(
  instant: string,
  timeZone: string,
): string {
  const epoch =
    Date.parse(
      instant,
    );

  if (
    !Number.isFinite(
      epoch,
    ) ||
    !isValidEventRunSheetTimeZone(
      timeZone,
    )
  ) {
    throw new Error(
      "The Event Run Sheet date, time, or time zone is invalid.",
    );
  }

  const parts =
    wallClockParts(
      epoch,
      timeZone,
    );

  return [
    pad(
      parts.year,
      4,
    ),
    "-",
    pad(
      parts.month,
      2,
    ),
    "-",
    pad(
      parts.day,
      2,
    ),
    "T",
    pad(
      parts.hour,
      2,
    ),
    ":",
    pad(
      parts.minute,
      2,
    ),
  ].join(
    "",
  );
}

export function resolveEventRunSheetLocalDateTime(
  localDateTime: string,
  timeZone: string,
): EventRunSheetDateTimeResolution {
  const parts =
    parseLocalDateTime(
      localDateTime,
    );

  if (
    !parts ||
    !isValidEventRunSheetTimeZone(
      timeZone,
    )
  ) {
    throw new Error(
      "Choose a valid local date, time, and IANA time zone.",
    );
  }

  const nominalEpoch =
    Date.UTC(
      parts.year,
      parts.month -
        1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
      0,
    );

  const sampleOffsets =
    new Set<number>();

  for (
    const deltaHours of [
      -36,
      -12,
      0,
      12,
      36,
    ]
  ) {
    const sampleEpoch =
      nominalEpoch +
      deltaHours *
        60 *
        60 *
        1000;

    sampleOffsets.add(
      timeZoneOffsetMs(
        sampleEpoch,
        timeZone,
      ),
    );
  }

  const matches =
    Array.from(
      sampleOffsets,
    )
      .map(
        (offset) =>
          nominalEpoch -
          offset,
      )
      .filter(
        (
          candidate,
          index,
          candidates,
        ) =>
          candidates.indexOf(
            candidate,
          ) === index &&
          sameWallClock(
            wallClockParts(
              candidate,
              timeZone,
            ),
            parts,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          left -
          right,
      );

  if (
    matches.length ===
    0
  ) {
    throw new Error(
      "That local time does not exist because the selected time zone moves clocks forward. Choose another time.",
    );
  }

  return {
    instant:
      new Date(
        matches[0],
      ).toISOString(),
    overlap:
      matches.length >
      1
        ? "earlier"
        : "none",
  };
}

export function formatEventRunSheetInstant(
  instant: string,
  timeZone: string,
): string {
  const epoch =
    Date.parse(
      instant,
    );

  if (
    !Number.isFinite(
      epoch,
    ) ||
    !isValidEventRunSheetTimeZone(
      timeZone,
    )
  ) {
    return "Schedule unavailable";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      timeZone,
      weekday:
        "short",
      year:
        "numeric",
      month:
        "short",
      day:
        "numeric",
      hour:
        "numeric",
      minute:
        "2-digit",
      timeZoneName:
        "short",
    },
  ).format(
    new Date(
      epoch,
    ),
  );
}

function parseLocalDateTime(
  value: string,
): WallClockParts | null {
  const match =
    LOCAL_DATE_TIME_PATTERN.exec(
      value.trim(),
    );

  if (!match) {
    return null;
  }

  const parts = {
    year:
      Number(
        match[1],
      ),
    month:
      Number(
        match[2],
      ),
    day:
      Number(
        match[3],
      ),
    hour:
      Number(
        match[4],
      ),
    minute:
      Number(
        match[5],
      ),
  };

  if (
    parts.year <
      1 ||
    parts.year >
      9999 ||
    parts.month <
      1 ||
    parts.month >
      12 ||
    parts.day <
      1 ||
    parts.day >
      31 ||
    parts.hour <
      0 ||
    parts.hour >
      23 ||
    parts.minute <
      0 ||
    parts.minute >
      59
  ) {
    return null;
  }

  const validationDate =
    new Date(
      Date.UTC(
        parts.year,
        parts.month -
          1,
        parts.day,
        parts.hour,
        parts.minute,
      ),
    );

  return (
    validationDate
      .getUTCFullYear() ===
      parts.year &&
    validationDate
      .getUTCMonth() +
      1 ===
      parts.month &&
    validationDate
      .getUTCDate() ===
      parts.day &&
    validationDate
      .getUTCHours() ===
      parts.hour &&
    validationDate
      .getUTCMinutes() ===
      parts.minute
  )
    ? parts
    : null;
}

function wallClockParts(
  epoch: number,
  timeZone: string,
): WallClockParts {
  const formatter =
    wallClockFormatter(
      timeZone,
    );

  const values =
    new Map<
      string,
      string
    >();

  for (
    const part of formatter
      .formatToParts(
        new Date(
          epoch,
        ),
      )
  ) {
    values.set(
      part.type,
      part.value,
    );
  }

  return {
    year:
      Number(
        values.get(
          "year",
        ),
      ),
    month:
      Number(
        values.get(
          "month",
        ),
      ),
    day:
      Number(
        values.get(
          "day",
        ),
      ),
    hour:
      Number(
        values.get(
          "hour",
        ),
      ),
    minute:
      Number(
        values.get(
          "minute",
        ),
      ),
  };
}

function wallClockFormatter(
  timeZone: string,
): Intl.DateTimeFormat {
  const cached =
    formatterCache.get(
      timeZone,
    );

  if (cached) {
    return cached;
  }

  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone,
        calendar:
          "gregory",
        numberingSystem:
          "latn",
        hourCycle:
          "h23",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
        hour:
          "2-digit",
        minute:
          "2-digit",
      },
    );

  formatterCache.set(
    timeZone,
    formatter,
  );

  return formatter;
}

function timeZoneOffsetMs(
  epoch: number,
  timeZone: string,
): number {
  const parts =
    wallClockParts(
      epoch,
      timeZone,
    );

  const roundedEpoch =
    Math.floor(
      epoch /
        60_000,
    ) *
    60_000;

  return (
    Date.UTC(
      parts.year,
      parts.month -
        1,
      parts.day,
      parts.hour,
      parts.minute,
    ) -
    roundedEpoch
  );
}

function sameWallClock(
  left: WallClockParts,
  right: WallClockParts,
): boolean {
  return (
    left.year ===
      right.year &&
    left.month ===
      right.month &&
    left.day ===
      right.day &&
    left.hour ===
      right.hour &&
    left.minute ===
      right.minute
  );
}

function pad(
  value: number,
  width: number,
): string {
  return value
    .toString()
    .padStart(
      width,
      "0",
    );
}
