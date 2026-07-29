#!/usr/bin/env node

/* global __dirname */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const plistModule = require("@expo/plist");

const plist = plistModule.default ?? plistModule;
const REQUIRED_IOS_SCHEMES = [
  "canal",
  "com.raishawnparks.canal.spotify",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }

  return typeof value === "string" ? [value] : [];
}

function readBuildSettings(projectFile) {
  const source = fs.readFileSync(projectFile, "utf8");
  const settings = new Map();

  for (const match of source.matchAll(
    /^\s*([A-Z][A-Z0-9_]*)\s*=\s*([^;]+);$/gm,
  )) {
    const name = match[1];
    const value = match[2].trim().replace(/^"(.*)"$/, "$1");
    const values = settings.get(name) ?? new Set();

    values.add(value);
    settings.set(name, values);
  }

  return settings;
}

function resolvePlistValue(
  rawValue,
  buildSettings,
  label,
  errors,
) {
  if (
    typeof rawValue !== "string" &&
    typeof rawValue !== "number"
  ) {
    errors.push(`The native iOS ${label} is missing.`);
    return "";
  }

  const value = String(rawValue);
  const variable = value.match(/^\$\(([^)]+)\)$/);

  if (!variable) {
    return value;
  }

  const candidates = [...(buildSettings.get(variable[1]) ?? [])];

  if (candidates.length !== 1) {
    errors.push(
      `The native iOS ${label} does not resolve to one value in every Xcode configuration.`,
    );
    return "";
  }

  return candidates[0];
}

function inspectReleaseConfig(projectRoot) {
  const errors = [];
  const metadata = {
    appVersion: "",
    buildNumber: "",
    bundleIdentifier: "",
    expoVersion: "",
  };

  let appJson;
  let packageJson;

  try {
    appJson = readJson(path.join(projectRoot, "app.json"));
    packageJson = readJson(path.join(projectRoot, "package.json"));
  } catch {
    errors.push("The Expo app or package configuration could not be read.");
    return { errors, metadata };
  }

  const expoConfig = appJson.expo;

  if (!expoConfig || typeof expoConfig !== "object") {
    errors.push("app.json does not contain an Expo app configuration.");
    return { errors, metadata };
  }

  metadata.appVersion =
    typeof expoConfig.version === "string" ? expoConfig.version : "";
  metadata.bundleIdentifier =
    typeof expoConfig.ios?.bundleIdentifier === "string"
      ? expoConfig.ios.bundleIdentifier
      : "";
  metadata.expoVersion = packageJson.dependencies?.expo ?? "";

  if (!/^~54\.0\.\d+$/.test(metadata.expoVersion)) {
    errors.push("The release candidate is not pinned to Expo SDK 54.");
  }

  if (!metadata.appVersion) {
    errors.push("The Expo app version is missing.");
  }

  if (!metadata.bundleIdentifier) {
    errors.push("The iOS bundle identifier is missing.");
  }

  const configuredSchemes = new Set([
    ...asStringArray(expoConfig.scheme),
    ...asStringArray(expoConfig.ios?.scheme),
  ]);

  for (const scheme of REQUIRED_IOS_SCHEMES) {
    if (!configuredSchemes.has(scheme)) {
      errors.push(
        `The Expo app configuration does not register the required ${scheme} iOS scheme.`,
      );
    }
  }

  const nativeName =
    typeof expoConfig.name === "string" ? expoConfig.name : "";
  const infoPlistPath = path.join(
    projectRoot,
    "ios",
    nativeName,
    "Info.plist",
  );
  const projectFile = path.join(
    projectRoot,
    "ios",
    `${nativeName}.xcodeproj`,
    "project.pbxproj",
  );

  let infoPlist;
  let buildSettings;

  try {
    infoPlist = plist.parse(fs.readFileSync(infoPlistPath, "utf8"));
    buildSettings = readBuildSettings(projectFile);
  } catch {
    errors.push(
      "The checked-in iOS native configuration could not be read.",
    );
    return { errors, metadata };
  }

  const nativeVersion = resolvePlistValue(
    infoPlist.CFBundleShortVersionString,
    buildSettings,
    "app version",
    errors,
  );
  metadata.buildNumber = resolvePlistValue(
    infoPlist.CFBundleVersion,
    buildSettings,
    "build number",
    errors,
  );
  const nativeBundleIdentifier = resolvePlistValue(
    infoPlist.CFBundleIdentifier,
    buildSettings,
    "bundle identifier",
    errors,
  );

  if (
    nativeVersion &&
    metadata.appVersion &&
    nativeVersion !== metadata.appVersion
  ) {
    errors.push(
      "The Expo app version and checked-in iOS app version do not match.",
    );
  }

  if (
    nativeBundleIdentifier &&
    metadata.bundleIdentifier &&
    nativeBundleIdentifier !== metadata.bundleIdentifier
  ) {
    errors.push(
      "The Expo and checked-in iOS bundle identifiers do not match.",
    );
  }

  const nativeSchemes = new Set(
    (
      Array.isArray(infoPlist.CFBundleURLTypes)
        ? infoPlist.CFBundleURLTypes
        : []
    ).flatMap((entry) => asStringArray(entry?.CFBundleURLSchemes)),
  );

  for (const scheme of REQUIRED_IOS_SCHEMES) {
    if (!nativeSchemes.has(scheme)) {
      errors.push(
        `The checked-in iOS project does not register the required ${scheme} scheme.`,
      );
    }
  }

  return { errors, metadata };
}

function inspectGitCandidate(projectRoot) {
  const errors = [];
  const head = spawnSync(
    "git",
    ["-C", projectRoot, "rev-parse", "--verify", "HEAD"],
    { encoding: "utf8" },
  );
  const commit = head.status === 0 ? head.stdout.trim() : "";

  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    errors.push("The full candidate commit SHA could not be resolved.");
  }

  const status = spawnSync(
    "git",
    [
      "-C",
      projectRoot,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ],
    { encoding: "utf8" },
  );

  if (status.status !== 0) {
    errors.push(
      "The release-candidate worktree state could not be inspected.",
    );
  } else if (status.stdout.trim()) {
    errors.push(
      "The release-candidate worktree contains tracked or untracked changes.",
    );
  }

  return { commit, errors };
}

function validatePublicEnvironment(
  projectRoot,
  environment = process.env,
) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "validate_public_env.cjs"), projectRoot],
    {
      encoding: "utf8",
      env: environment,
    },
  );

  return result.status === 0
    ? []
    : [
        "The public client configuration is incomplete or invalid; run ./script/build_and_run.sh --check-config.",
      ];
}

function runPreflight(projectRoot, environment = process.env) {
  const config = inspectReleaseConfig(projectRoot);
  const git = inspectGitCandidate(projectRoot);

  return {
    commit: git.commit,
    errors: [
      ...config.errors,
      ...git.errors,
      ...validatePublicEnvironment(projectRoot, environment),
    ],
    metadata: config.metadata,
  };
}

function main() {
  const projectRoot = path.resolve(
    process.argv[2] ?? path.join(__dirname, ".."),
  );
  const result = runPreflight(projectRoot);

  if (result.errors.length > 0) {
    console.error("Canal release preflight failed.");

    for (const error of result.errors) {
      console.error(`- ${error}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log("Canal release preflight passed.");
  console.log(`- Candidate commit: ${result.commit}`);
  console.log("- Worktree: clean");
  console.log(
    `- Expo SDK source constraint: ${result.metadata.expoVersion}`,
  );
  console.log(`- App version: ${result.metadata.appVersion}`);
  console.log(
    `- iOS source build number: ${result.metadata.buildNumber}`,
  );
  console.log(
    `- iOS bundle identifier: ${result.metadata.bundleIdentifier}`,
  );
  console.log(
    "- Required auth and Spotify schemes: registered in Expo and checked-in iOS configuration",
  );
  console.log("- Public client configuration: present and valid");
  console.log(
    "Record this source evidence before building. Verify the installed artifact's build identifier and commit provenance separately.",
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  inspectGitCandidate,
  inspectReleaseConfig,
  runPreflight,
  validatePublicEnvironment,
};
