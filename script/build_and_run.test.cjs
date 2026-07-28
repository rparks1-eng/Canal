"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const testRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "canal-ios-launcher-test-"),
);
const binDirectory = path.join(testRoot, "bin");

fs.mkdirSync(binDirectory);

function writeCommand(name, contents) {
  const commandPath = path.join(binDirectory, name);
  fs.writeFileSync(commandPath, contents, { mode: 0o755 });
}

writeCommand(
  "uname",
  `#!/usr/bin/env bash
printf 'Darwin\\n'
`,
);

writeCommand(
  "npx",
  `#!/usr/bin/env bash
printf 'npx %s\\n' "$*" >> "$CANAL_FAKE_COMMAND_LOG"

if [[ -n "\${CANAL_FAIL_NATIVE_BUILD:-}" && "$*" == "expo run:ios --no-bundler" ]]; then
  exit 9
fi
`,
);

const baseEnvironment = {
  ...process.env,
  PATH: `${binDirectory}:${process.env.PATH}`,
  EXPO_PUBLIC_SUPABASE_URL: "https://canal.supabase.co",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_public_value",
  EXPO_PUBLIC_SPOTIFY_CLIENT_ID: "1234567890abcdef1234567890abcdef",
};

function runLauncher(mode, extraEnvironment = {}) {
  const commandLog = path.join(
    testRoot,
    `${mode.replaceAll("-", "")}-${Date.now()}.log`,
  );
  const result = spawnSync(
    "/bin/bash",
    [path.join(projectRoot, "script", "build_and_run.sh"), mode],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...baseEnvironment,
        ...extraEnvironment,
        CANAL_FAKE_COMMAND_LOG: commandLog,
      },
    },
  );

  return {
    commands: fs.existsSync(commandLog)
      ? fs.readFileSync(commandLog, "utf8")
      : "",
    result,
  };
}

const cleanLaunch = runLauncher("--ios-clean");
assert.equal(
  cleanLaunch.result.status,
  0,
  `${cleanLaunch.result.stdout}\n${cleanLaunch.result.stderr}`,
);
assert.equal(
  cleanLaunch.commands.trim(),
  "npx expo start --dev-client --localhost --clear --ios",
);
assert.doesNotMatch(cleanLaunch.commands, /run:ios/);

const nativeBuild = runLauncher("--build-ios");
assert.equal(
  nativeBuild.result.status,
  0,
  `${nativeBuild.result.stdout}\n${nativeBuild.result.stderr}`,
);
assert.equal(
  nativeBuild.commands.trim(),
  [
    "npx expo run:ios --no-bundler",
    "npx expo start --dev-client --localhost --ios",
  ].join("\n"),
);

const failedBuild = runLauncher("--build-ios", {
  CANAL_FAIL_NATIVE_BUILD: "1",
});
assert.equal(failedBuild.result.status, 9);
assert.equal(
  failedBuild.commands.trim(),
  "npx expo run:ios --no-bundler",
);

console.log("iOS launcher command tests passed.");
