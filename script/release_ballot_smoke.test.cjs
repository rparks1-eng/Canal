"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createMetroEnvironment,
  missingExpectedText,
  normalizeRecognizedText,
  parseArguments,
  readSmokeCases,
} = require("./release_ballot_smoke.cjs");

const expectedCases = [
  "browse",
  "detail-owner",
  "detail-contributor",
  "detail-vote",
  "detail-change-vote",
  "detail-results",
  "loading",
  "empty",
  "error",
  "offline",
  "reconnect",
  "blocked",
  "lifecycle",
  "account-switch",
];

const cases =
  readSmokeCases();

assert.deepEqual(
  cases.map(
    ({
      id,
    }) => id,
  ),
  expectedCases,
);

assert.equal(
  cases.filter(
    ({
      relaunch,
    }) =>
      relaunch === true,
  ).length,
  1,
);

assert.equal(
  cases.find(
    ({
      id,
    }) =>
      id ===
      "lifecycle",
  ).relaunch,
  true,
);

assert.equal(
  normalizeRecognizedText(
    "  Results\nSTAY   sealed ",
  ),
  "results stay sealed",
);

assert.deepEqual(
  missingExpectedText(
    "OWNER\nResults stay sealed",
    [
      "owner",
      "Results stay sealed",
    ],
  ),
  [],
);

assert.deepEqual(
  missingExpectedText(
    "OWNER",
    [
      "OWNER",
      "Results stay sealed",
    ],
  ),
  [
    "Results stay sealed",
  ],
);

assert.deepEqual(
  parseArguments([
    "--allow-dirty",
    "--port",
    "8123",
    "--timeout-ms",
    "60000",
    "--udid",
    "SIMULATOR-ID",
    "--artifacts",
    "/tmp/canal-smoke-evidence",
  ]),
  {
    allowDirty: true,
    artifactDirectory:
      "/tmp/canal-smoke-evidence",
    port: 8123,
    timeoutMs: 60_000,
    udid:
      "SIMULATOR-ID",
  },
);

assert.throws(
  () =>
    parseArguments([
      "--port",
      "70000",
    ]),
  /at most 65535/,
);

assert.throws(
  () =>
    parseArguments([
      "--unknown",
    ]),
  /Unknown argument/,
);

const environmentRoot =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "canal-release-ballot-env-test-",
    ),
  );

const metroEnvironment =
  createMetroEnvironment(
    environmentRoot,
    {
      HOME:
        "/tmp/test-home",
      PATH:
        "/usr/bin:/bin",
      EXPO_PUBLIC_SUPABASE_URL:
        "https://secret-project.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_secret",
      EXPO_PUBLIC_SPOTIFY_CLIENT_ID:
        "secret-client-id",
      SUPABASE_ACCESS_TOKEN:
        "secret-token",
    },
  );

assert.equal(
  metroEnvironment
    .EXPO_PUBLIC_CANAL_RELEASE_BALLOT_SMOKE,
  "1",
);

assert.equal(
  metroEnvironment
    .EXPO_NO_DOTENV,
  "1",
);

assert.equal(
  metroEnvironment
    .EXPO_OFFLINE,
  "1",
);

for (
  const forbiddenKey of [
    "EXPO_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "EXPO_PUBLIC_SPOTIFY_CLIENT_ID",
    "SUPABASE_ACCESS_TOKEN",
  ]
) {
  assert.equal(
    Object.hasOwn(
      metroEnvironment,
      forbiddenKey,
    ),
    false,
  );
}

const invalidRoot =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "canal-release-ballot-cases-test-",
    ),
  );

fs.mkdirSync(
  path.join(
    invalidRoot,
    "fixtures",
  ),
);

fs.writeFileSync(
  path.join(
    invalidRoot,
    "fixtures",
    "release-ballot-smoke-cases.json",
  ),
  JSON.stringify([
    {
      id: "duplicate",
      expectedText: [
        "Visible",
      ],
    },
    {
      id: "duplicate",
      expectedText: [
        "Visible",
      ],
    },
  ]),
);

assert.throws(
  () =>
    readSmokeCases(
      invalidRoot,
    ),
  /Duplicate smoke case/,
);

console.log(
  "Release Ballot smoke runner contract tests passed.",
);
