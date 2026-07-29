"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const {
  spawn,
  spawnSync,
} = require("node:child_process");

const DEFAULT_PORT = 8099;
const DEFAULT_TIMEOUT_MS = 45_000;
const APP_BUNDLE_ID =
  "com.raishawnparks.canal";
const DEV_CLIENT_SCHEME =
  "exp+canal";
const APP_SCHEME = "canal";

function projectRoot() {
  return path.resolve(
    __dirname,
    "..",
  );
}

function scenarioManifestPath(
  root = projectRoot(),
) {
  return path.join(
    root,
    "fixtures",
    "release-ballot-smoke-cases.json",
  );
}

function readSmokeCases(
  root = projectRoot(),
) {
  const parsed = JSON.parse(
    fs.readFileSync(
      scenarioManifestPath(
        root,
      ),
      "utf8",
    ),
  );

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0
  ) {
    throw new Error(
      "Release Ballot smoke cases must be a non-empty array.",
    );
  }

  const seen =
    new Set();

  for (
    const scenario of
      parsed
  ) {
    if (
      !scenario ||
      typeof scenario !==
        "object" ||
      typeof scenario.id !==
        "string" ||
      !/^[a-z][a-z0-9-]*$/u.test(
        scenario.id,
      ) ||
      !Array.isArray(
        scenario.expectedText,
      ) ||
      scenario.expectedText.length ===
        0 ||
      scenario.expectedText.some(
        (token) =>
          typeof token !==
            "string" ||
          token.trim().length <
            2,
      ) ||
      (
        scenario.relaunch !==
          undefined &&
        typeof scenario.relaunch !==
          "boolean"
      )
    ) {
      throw new Error(
        "Each smoke case needs a safe id and one or more expectedText tokens.",
      );
    }

    if (
      seen.has(
        scenario.id,
      )
    ) {
      throw new Error(
        `Duplicate smoke case: ${scenario.id}`,
      );
    }

    seen.add(
      scenario.id,
    );
  }

  return parsed;
}

function normalizeRecognizedText(
  value,
) {
  return String(
    value ?? "",
  )
    .normalize("NFKC")
    .replace(
      /\s+/gu,
      " ",
    )
    .trim()
    .toLocaleLowerCase(
      "en-US",
    );
}

function missingExpectedText(
  recognizedText,
  expectedText,
) {
  const normalized =
    normalizeRecognizedText(
      recognizedText,
    );

  return expectedText.filter(
    (token) =>
      !normalized.includes(
        normalizeRecognizedText(
          token,
        ),
      ),
  );
}

function expectedScenarioText(
  scenario,
) {
  return [
    ...new Set([
      "RELEASE BALLOT SMOKE",
      scenario.id,
      "ISOLATED FIXTURE",
      ...scenario.expectedText,
    ]),
  ];
}

function parseArguments(
  values,
) {
  const options = {
    allowDirty: false,
    artifactDirectory:
      "",
    port: DEFAULT_PORT,
    timeoutMs:
      DEFAULT_TIMEOUT_MS,
    udid: "",
  };

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    const value =
      values[index];

    if (
      value ===
      "--allow-dirty"
    ) {
      options.allowDirty =
        true;
      continue;
    }

    if (
      value === "--udid" ||
      value === "--port" ||
      value ===
        "--artifacts" ||
      value ===
        "--timeout-ms"
    ) {
      const next =
        values[
          index + 1
        ];

      if (!next) {
        throw new Error(
          `${value} requires a value.`,
        );
      }

      index += 1;

      if (
        value === "--udid"
      ) {
        options.udid =
          next;
      } else if (
        value ===
        "--artifacts"
      ) {
        options.artifactDirectory =
          path.resolve(
            next,
          );
      } else {
        const parsed =
          Number.parseInt(
            next,
            10,
          );

        if (
          !Number.isInteger(
            parsed,
          ) ||
          parsed <= 0
        ) {
          throw new Error(
            `${value} must be a positive integer.`,
          );
        }

        if (
          value ===
          "--port"
        ) {
          options.port =
            parsed;
        } else {
          options.timeoutMs =
            parsed;
        }
      }

      continue;
    }

    throw new Error(
      `Unknown argument: ${value}`,
    );
  }

  if (
    options.port > 65_535
  ) {
    throw new Error(
      "--port must be at most 65535.",
    );
  }

  return options;
}

function createMetroEnvironment(
  artifactDirectory,
  baseEnvironment =
    process.env,
) {
  const safeKeys = [
    "HOME",
    "LANG",
    "LC_ALL",
    "LOGNAME",
    "PATH",
    "SHELL",
    "USER",
  ];

  const environment = {};

  for (
    const key of
      safeKeys
  ) {
    const value =
      baseEnvironment[
        key
      ];

    if (
      typeof value ===
        "string" &&
      value.length > 0
    ) {
      environment[key] =
        value;
    }
  }

  const runtimeDirectory =
    path.join(
      artifactDirectory,
      "runtime",
    );

  fs.mkdirSync(
    path.join(
      runtimeDirectory,
      "expo-home",
    ),
    {
      recursive: true,
    },
  );

  fs.mkdirSync(
    path.join(
      runtimeDirectory,
      "tmp",
    ),
    {
      recursive: true,
    },
  );

  return {
    ...environment,
    CI: "1",
    EXPO_HOME:
      path.join(
        runtimeDirectory,
        "expo-home",
      ),
    EXPO_NO_DOTENV: "1",
    EXPO_NO_TELEMETRY: "1",
    EXPO_OFFLINE: "1",
    EXPO_PUBLIC_CANAL_RELEASE_BALLOT_SMOKE:
      "1",
    NODE_ENV:
      "development",
    NO_PROXY:
      "127.0.0.1,localhost",
    TMPDIR:
      path.join(
        runtimeDirectory,
        "tmp",
      ),
  };
}

function run(
  command,
  args,
  options = {},
) {
  const result =
    spawnSync(
      command,
      args,
      {
        cwd:
          options.cwd ??
          projectRoot(),
        encoding:
          "utf8",
        env:
          options.env ??
          process.env,
        timeout:
          options.timeout,
      },
    );

  if (
    result.error
  ) {
    throw result.error;
  }

  if (
    result.status !== 0
  ) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with status ${result.status}.`,
        result.stdout,
        result.stderr,
      ]
        .filter(
          Boolean,
        )
        .join("\n"),
    );
  }

  return result.stdout.trim();
}

function resolveBootedSimulator(
  requestedUdid,
) {
  const payload =
    JSON.parse(
      run(
        "xcrun",
        [
          "simctl",
          "list",
          "devices",
          "booted",
          "--json",
        ],
      ),
    );

  const booted =
    Object.entries(
      payload.devices ??
        {},
    )
      .flatMap(
        (
          [
            runtime,
            devices,
          ],
        ) =>
          devices.map(
            (device) => ({
              ...device,
              runtime,
            }),
          ),
      )
      .filter(
        (device) =>
          device &&
          device.state ===
            "Booted" &&
          device.isAvailable !==
            false,
      );

  const selected =
    requestedUdid
      ? booted.find(
          (device) =>
            device.udid ===
            requestedUdid,
        )
      : booted[0];

  if (!selected) {
    throw new Error(
      requestedUdid
        ? `Simulator ${requestedUdid} is not booted.`
        : "No booted iOS Simulator is available.",
    );
  }

  return {
    name:
      selected.name,
    runtime:
      selected.runtime,
    udid:
      selected.udid,
  };
}

function assertInstalledDevClient(
  udid,
) {
  run(
    "xcrun",
    [
      "simctl",
      "get_app_container",
      udid,
      APP_BUNDLE_ID,
      "app",
    ],
  );
}

function assertCleanTree(
  root,
  allowDirty,
) {
  const status =
    run(
      "git",
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      {
        cwd: root,
      },
    );

  if (
    status &&
    !allowDirty
  ) {
    throw new Error(
      "The Release Ballot smoke lane requires a clean worktree. Commit the frozen candidate or pass --allow-dirty during local development.",
    );
  }

  return status;
}

function ensureExternalArtifacts(
  root,
  requestedDirectory,
) {
  const directory =
    requestedDirectory ||
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "canal-release-ballot-smoke-",
      ),
    );

  const relative =
    path.relative(
      root,
      directory,
    );

  if (
    relative === "" ||
    (
      !relative.startsWith(
        "..",
      ) &&
      !path.isAbsolute(
        relative,
      )
    )
  ) {
    throw new Error(
      "Smoke artifacts must be written outside the repository.",
    );
  }

  fs.mkdirSync(
    directory,
    {
      recursive: true,
    },
  );

  return directory;
}

async function assertPortAvailable(
  port,
) {
  await new Promise(
    (
      resolve,
      reject,
    ) => {
      const server =
        net.createServer();

      server.once(
        "error",
        () => {
          reject(
            new Error(
              `Port ${port} is already in use.`,
            ),
          );
        },
      );

      server.listen(
        port,
        "127.0.0.1",
        () => {
          server.close(
            resolve,
          );
        },
      );
    },
  );
}

function sleep(
  milliseconds,
) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

function metroIsReady(
  port,
) {
  return new Promise(
    (resolve) => {
      const request =
        http.get(
          {
            host:
              "127.0.0.1",
            path:
              "/status",
            port,
            timeout: 800,
          },
          (response) => {
            let body = "";

            response.setEncoding(
              "utf8",
            );

            response.on(
              "data",
              (chunk) => {
                body +=
                  chunk;
              },
            );

            response.on(
              "end",
              () => {
                resolve(
                  body.includes(
                    "packager-status:running",
                  ),
                );
              },
            );
          },
        );

      request.on(
        "timeout",
        () => {
          request.destroy();
          resolve(false);
        },
      );

      request.on(
        "error",
        () => {
          resolve(false);
        },
      );
    },
  );
}

async function waitForMetro(
  port,
  timeoutMs,
  child,
) {
  const started =
    Date.now();

  while (
    Date.now() -
      started <
    timeoutMs
  ) {
    if (
      child.exitCode !==
        null
    ) {
      throw new Error(
        `Metro exited before becoming ready (status ${child.exitCode}).`,
      );
    }

    if (
      await metroIsReady(
        port,
      )
    ) {
      return;
    }

    await sleep(500);
  }

  throw new Error(
    `Metro did not become ready within ${timeoutMs}ms.`,
  );
}

function startMetro(
  root,
  port,
  artifactDirectory,
) {
  const expoPath =
    path.join(
      root,
      "node_modules",
      ".bin",
      "expo",
    );

  if (
    !fs.existsSync(
      expoPath,
    )
  ) {
    throw new Error(
      "Install project dependencies before running the smoke lane.",
    );
  }

  const logPath =
    path.join(
      artifactDirectory,
      "metro.log",
    );

  const logDescriptor =
    fs.openSync(
      logPath,
      "w",
    );

  const child =
    spawn(
      expoPath,
      [
        "start",
        "--dev-client",
        "--localhost",
        "--port",
        String(port),
      ],
      {
        cwd: root,
        detached: true,
        env:
          createMetroEnvironment(
            artifactDirectory,
          ),
        stdio: [
          "ignore",
          logDescriptor,
          logDescriptor,
        ],
      },
    );

  fs.closeSync(
    logDescriptor,
  );

  return {
    child,
    logPath,
  };
}

async function stopMetro(
  child,
) {
  if (
    child.exitCode !==
      null ||
    !child.pid
  ) {
    return;
  }

  try {
    process.kill(
      -child.pid,
      "SIGINT",
    );
  } catch {
    return;
  }

  const exited =
    await Promise.race([
      new Promise(
        (resolve) => {
          child.once(
            "exit",
            () => {
              resolve(true);
            },
          );
        },
      ),
      sleep(
        2_500,
      ).then(
        () => false,
      ),
    ]);

  if (!exited) {
    try {
      process.kill(
        -child.pid,
        "SIGKILL",
      );
    } catch {
      // Metro already stopped between the timeout and the kill.
    }
  }
}

function openSimulatorUrl(
  udid,
  url,
) {
  run(
    "xcrun",
    [
      "simctl",
      "openurl",
      udid,
      url,
    ],
  );
}

function captureScreenshot(
  udid,
  destination,
) {
  run(
    "xcrun",
    [
      "simctl",
      "io",
      udid,
      "screenshot",
      destination,
    ],
  );
}

function recognizeScreenshots(
  root,
  screenshotPaths,
) {
  const helper =
    path.join(
      root,
      "script",
      "release_ballot_smoke_ocr.swift",
    );

  return JSON.parse(
    run(
      "xcrun",
      [
        "swift",
        helper,
        ...screenshotPaths,
      ],
      {
        cwd: root,
        timeout:
          120_000,
      },
    ),
  );
}

function terminateApp(
  udid,
) {
  const result =
    spawnSync(
      "xcrun",
      [
        "simctl",
        "terminate",
        udid,
        APP_BUNDLE_ID,
      ],
      {
        encoding:
          "utf8",
      },
    );

  if (
    result.error
  ) {
    throw result.error;
  }

  if (
    result.status !== 0 &&
    !String(
      result.stderr,
    ).includes(
      "found nothing to terminate",
    )
  ) {
    throw new Error(
      result.stderr ||
        "Could not terminate the simulator app.",
    );
  }
}

function sha256File(
  filePath,
) {
  return crypto
    .createHash(
      "sha256",
    )
    .update(
      fs.readFileSync(
        filePath,
      ),
    )
    .digest("hex");
}

function repositoryIdentity(
  root,
) {
  return {
    branch: run(
      "git",
      [
        "branch",
        "--show-current",
      ],
      {
        cwd: root,
      },
    ),
    commit: run(
      "git",
      [
        "rev-parse",
        "HEAD",
      ],
      {
        cwd: root,
      },
    ),
  };
}

function writeEvidence(
  artifactDirectory,
  evidence,
) {
  const evidencePath =
    path.join(
      artifactDirectory,
      "evidence.json",
    );

  fs.writeFileSync(
    evidencePath,
    `${JSON.stringify(
      evidence,
      null,
      2,
    )}\n`,
  );

  return evidencePath;
}

async function waitForFirstScenario(
  root,
  udid,
  scenario,
  artifactDirectory,
  timeoutMs,
) {
  const probePath =
    path.join(
      artifactDirectory,
      "launch-probe.png",
    );

  const started =
    Date.now();

  while (
    Date.now() -
      started <
    timeoutMs
  ) {
    captureScreenshot(
      udid,
      probePath,
    );

    const [
      probe,
    ] =
      recognizeScreenshots(
        root,
        [
          probePath,
        ],
      );

    if (
      missingExpectedText(
        probe.text,
        expectedScenarioText(
          scenario,
        ).slice(
          0,
          3,
        ),
      ).length === 0
    ) {
      return;
    }

    await sleep(1_000);
  }

  throw new Error(
    `The first smoke scenario did not render within ${timeoutMs}ms.`,
  );
}

async function main() {
  const root =
    projectRoot();

  const options =
    parseArguments(
      process.argv.slice(
        2,
      ),
    );

  if (
    process.platform !==
      "darwin"
  ) {
    throw new Error(
      "Release Ballot simulator smoke requires macOS and an iOS Simulator.",
    );
  }

  const cases =
    readSmokeCases(
      root,
    );

  const worktreeStatus =
    assertCleanTree(
      root,
      options.allowDirty,
    );

  const artifactDirectory =
    ensureExternalArtifacts(
      root,
      options.artifactDirectory,
    );

  const simulator =
    resolveBootedSimulator(
      options.udid,
    );

  assertInstalledDevClient(
    simulator.udid,
  );

  await assertPortAvailable(
    options.port,
  );

  const {
    child,
    logPath,
  } =
    startMetro(
      root,
      options.port,
      artifactDirectory,
    );

  const bundleUrl =
    `http://127.0.0.1:${options.port}`;

  const devClientUrl =
    `${DEV_CLIENT_SCHEME}://expo-development-client/?url=${encodeURIComponent(
      bundleUrl,
    )}`;

  const screenshots =
    [];

  try {
    await waitForMetro(
      options.port,
      options.timeoutMs,
      child,
    );

    openSimulatorUrl(
      simulator.udid,
      devClientUrl,
    );

    await sleep(1_500);

    const firstCase =
      cases[0];

    openSimulatorUrl(
      simulator.udid,
      `${APP_SCHEME}:///auth/release-ballot-smoke?scenario=${encodeURIComponent(
        firstCase.id,
      )}`,
    );

    await waitForFirstScenario(
      root,
      simulator.udid,
      firstCase,
      artifactDirectory,
      options.timeoutMs,
    );

    for (
      const scenario of
        cases
    ) {
      if (
        scenario.relaunch
      ) {
        terminateApp(
          simulator.udid,
        );

        openSimulatorUrl(
          simulator.udid,
          devClientUrl,
        );

        await sleep(1_500);
      }

      openSimulatorUrl(
        simulator.udid,
        `${APP_SCHEME}:///auth/release-ballot-smoke?scenario=${encodeURIComponent(
          scenario.id,
        )}`,
      );

      await sleep(1_000);

      const screenshotPath =
        path.join(
          artifactDirectory,
          `${scenario.id}.png`,
        );

      captureScreenshot(
        simulator.udid,
        screenshotPath,
      );

      screenshots.push({
        scenario,
        screenshotPath,
      });
    }

    const recognized =
      recognizeScreenshots(
        root,
        screenshots.map(
          ({
            screenshotPath,
          }) =>
            screenshotPath,
        ),
      );

    const recognizedByPath =
      new Map(
        recognized.map(
          (item) => [
            item.path,
            item.text,
          ],
        ),
      );

    const results =
      screenshots.map(
        ({
          scenario,
          screenshotPath,
        }) => {
          const text =
            recognizedByPath.get(
              screenshotPath,
            ) ?? "";

          const expectedText =
            expectedScenarioText(
              scenario,
            );

          return {
            id:
              scenario.id,
            expectedText:
              expectedText,
            missingText:
              missingExpectedText(
                text,
                expectedText,
              ),
            recognizedText:
              text,
            screenshot:
              screenshotPath,
            screenshotSha256:
              sha256File(
                screenshotPath,
              ),
          };
        },
      );

    const failed =
      results.filter(
        (result) =>
          result
            .missingText
            .length > 0,
      );

    const screenshotHashes =
      results.map(
        (result) =>
          result
            .screenshotSha256,
      );

    const screenshotHashesUnique =
      new Set(
        screenshotHashes,
      ).size ===
      screenshotHashes.length;

    const evidence = {
      createdAt:
        new Date().toISOString(),
      repository:
        repositoryIdentity(
          root,
        ),
      worktreeDirty:
        Boolean(
          worktreeStatus,
        ),
      simulator,
      appBundleId:
        APP_BUNDLE_ID,
      isolatedFixture: true,
      networkCredentialsLoaded:
        false,
      productionDataMutated:
        false,
      metroLog:
        logPath,
      verifiedScreenshotCount:
        results.length,
      screenshotHashesUnique,
      results,
      passed:
        failed.length ===
          0 &&
        screenshotHashesUnique,
    };

    const evidencePath =
      writeEvidence(
        artifactDirectory,
        evidence,
      );

    if (
      failed.length > 0 ||
      !screenshotHashesUnique
    ) {
      const summary =
        failed
          .map(
            (result) =>
              `${result.id}: missing ${result.missingText.join(", ")}`,
          )
          .join("\n");

      throw new Error(
        `Release Ballot smoke failed.\n${summary}${screenshotHashesUnique ? "" : "\nScreenshot hashes were not unique."}\nEvidence: ${evidencePath}`,
      );
    }

    console.log(
      `Release Ballot simulator smoke passed ${results.length}/${results.length} scenarios.`,
    );
    console.log(
      `Evidence: ${evidencePath}`,
    );
  } finally {
    await stopMetro(
      child,
    );
  }
}

module.exports = {
  createMetroEnvironment,
  expectedScenarioText,
  missingExpectedText,
  normalizeRecognizedText,
  parseArguments,
  readSmokeCases,
};

if (
  require.main ===
  module
) {
  main().catch(
    (error) => {
      console.error(
        error instanceof
          Error
          ? error.message
          : error,
      );
      process.exitCode = 1;
    },
  );
}
