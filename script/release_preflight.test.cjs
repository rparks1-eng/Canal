/* global __dirname */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  inspectReleaseConfig,
} = require("./release_preflight.cjs");

const projectRoot = path.resolve(__dirname, "..");
const realConfig = inspectReleaseConfig(projectRoot);

assert.deepEqual(
  realConfig.errors,
  [],
  realConfig.errors.join("\n"),
);

const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "canal-release-preflight-"),
);
const iosAppDirectory = path.join(fixtureRoot, "ios", "Canal");
const xcodeProjectDirectory = path.join(
  fixtureRoot,
  "ios",
  "Canal.xcodeproj",
);

fs.mkdirSync(iosAppDirectory, { recursive: true });
fs.mkdirSync(xcodeProjectDirectory, { recursive: true });

const appConfig = {
  expo: {
    name: "Canal",
    scheme: [
      "canal",
      "com.raishawnparks.canal.spotify",
    ],
    version: "1.0.0",
    ios: {
      bundleIdentifier: "com.raishawnparks.canal",
    },
  },
};
const packageConfig = {
  dependencies: {
    expo: "~54.0.0",
  },
};
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>42</string>
    <key>CFBundleURLTypes</key>
    <array>
      <dict>
        <key>CFBundleURLSchemes</key>
        <array>
          <string>canal</string>
          <string>com.raishawnparks.canal.spotify</string>
        </array>
      </dict>
    </array>
  </dict>
</plist>
`;
const projectFile = `/* Begin XCBuildConfiguration section */
  PRODUCT_BUNDLE_IDENTIFIER = com.raishawnparks.canal;
  PRODUCT_BUNDLE_IDENTIFIER = com.raishawnparks.canal;
/* End XCBuildConfiguration section */
`;

function writeJson(filePath, value) {
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function writeFixture() {
  writeJson(path.join(fixtureRoot, "app.json"), appConfig);
  writeJson(path.join(fixtureRoot, "package.json"), packageConfig);
  fs.writeFileSync(
    path.join(iosAppDirectory, "Info.plist"),
    infoPlist,
  );
  fs.writeFileSync(
    path.join(xcodeProjectDirectory, "project.pbxproj"),
    projectFile,
  );
  fs.writeFileSync(
    path.join(fixtureRoot, ".env"),
    [
      "EXPO_PUBLIC_SUPABASE_URL=https://canal.supabase.co",
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_release_preflight_marker",
      "EXPO_PUBLIC_SPOTIFY_CLIENT_ID=feedfacefeedfacefeedfacefeedface",
      "EXPO_PUBLIC_CANAL_SHARE_BASE_URL=https://canal.example.com",
      "",
    ].join("\n"),
  );
}

writeFixture();

const validFixture = inspectReleaseConfig(fixtureRoot);

assert.deepEqual(validFixture.errors, []);
assert.deepEqual(validFixture.metadata, {
  appVersion: "1.0.0",
  buildNumber: "42",
  bundleIdentifier: "com.raishawnparks.canal",
  expoVersion: "~54.0.0",
});

fs.writeFileSync(
  path.join(iosAppDirectory, "Info.plist"),
  infoPlist.replace(
    "com.raishawnparks.canal.spotify",
    "com.example.missing.spotify",
  ),
);

assert.match(
  inspectReleaseConfig(fixtureRoot).errors.join("\n"),
  /checked-in iOS project.*com\.raishawnparks\.canal\.spotify/,
);

writeFixture();
writeJson(path.join(fixtureRoot, "app.json"), {
  expo: {
    ...appConfig.expo,
    scheme: ["canal"],
  },
});

assert.match(
  inspectReleaseConfig(fixtureRoot).errors.join("\n"),
  /Expo app configuration.*com\.raishawnparks\.canal\.spotify/,
);

writeFixture();
writeJson(path.join(fixtureRoot, "app.json"), {
  expo: {
    ...appConfig.expo,
    version: "2.0.0",
  },
});

assert.match(
  inspectReleaseConfig(fixtureRoot).errors.join("\n"),
  /app version.*do not match/,
);

writeFixture();
fs.writeFileSync(
  path.join(xcodeProjectDirectory, "project.pbxproj"),
  projectFile.replaceAll(
    "com.raishawnparks.canal",
    "com.example.wrong",
  ),
);

assert.match(
  inspectReleaseConfig(fixtureRoot).errors.join("\n"),
  /bundle identifiers do not match/,
);

writeFixture();

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: fixtureRoot,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`,
  );
}

runGit(["init", "-q"]);
runGit(["add", "--all"]);
runGit([
  "-c",
  "user.name=Canal Preflight",
  "-c",
  "user.email=canal-preflight@example.com",
  "-c",
  "commit.gpgsign=false",
  "commit",
  "-qm",
  "Release fixture",
]);

const releasePreflight = path.join(
  __dirname,
  "release_preflight.cjs",
);
const baseEnvironment = {
  ...process.env,
  NODE_ENV: "development",
};

for (const name of [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SPOTIFY_CLIENT_ID",
  "EXPO_PUBLIC_SPOTIFY_REDIRECT_URI",
  "EXPO_PUBLIC_CANAL_SHARE_BASE_URL",
  "EXPO_PUBLIC_CANAL_WEB_URL",
]) {
  delete baseEnvironment[name];
}

function runReleasePreflight() {
  return spawnSync(
    process.execPath,
    [releasePreflight, fixtureRoot],
    {
      encoding: "utf8",
      env: baseEnvironment,
    },
  );
}

const cleanCandidate = runReleasePreflight();

assert.equal(
  cleanCandidate.status,
  0,
  `${cleanCandidate.stdout}\n${cleanCandidate.stderr}`,
);
assert.match(
  cleanCandidate.stdout,
  /Candidate commit: [0-9a-f]{40}/,
);
assert.match(
  cleanCandidate.stdout,
  /iOS source build number: 42/,
);
assert.match(
  cleanCandidate.stdout,
  /installed artifact's build identifier and commit provenance separately/,
);

const statusAfterPreflight = spawnSync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all"],
  {
    cwd: fixtureRoot,
    encoding: "utf8",
  },
);

assert.equal(statusAfterPreflight.status, 0);
assert.equal(statusAfterPreflight.stdout, "");

for (const sensitiveValue of [
  "sb_publishable_release_preflight_marker",
  "feedfacefeedfacefeedfacefeedface",
  "https://canal.supabase.co",
  "https://canal.example.com",
]) {
  assert.equal(
    `${cleanCandidate.stdout}${cleanCandidate.stderr}`.includes(
      sensitiveValue,
    ),
    false,
  );
}

const untrackedMarker = "untracked-private-value-must-not-leak";

fs.writeFileSync(
  path.join(fixtureRoot, "untracked-release-note.txt"),
  untrackedMarker,
);

const dirtyCandidate = runReleasePreflight();

assert.equal(dirtyCandidate.status, 1);
assert.match(
  dirtyCandidate.stderr,
  /worktree contains tracked or untracked changes/,
);
assert.equal(
  `${dirtyCandidate.stdout}${dirtyCandidate.stderr}`.includes(
    untrackedMarker,
  ),
  false,
);
assert.equal(
  `${dirtyCandidate.stdout}${dirtyCandidate.stderr}`.includes(
    "untracked-release-note.txt",
  ),
  false,
);

console.log("Release preflight tests passed.");
