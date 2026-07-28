#!/usr/bin/env node

const assert =
  require("node:assert/strict");
const fs =
  require("node:fs");
const os =
  require("node:os");
const path =
  require("node:path");
const {
  spawnSync,
} = require("node:child_process");

const validator =
  path.join(
    __dirname,
    "validate_public_env.cjs",
  );

const recoveryScript =
  path.join(
    __dirname,
    "recover_spotify_client_id.cjs",
  );

const baseEnvironment = {
  ...process.env,
};

for (const key of [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SPOTIFY_CLIENT_ID",
  "EXPO_PUBLIC_SPOTIFY_REDIRECT_URI",
]) {
  delete baseEnvironment[key];
}

function runValidator(
  envContents,
  localContents,
) {
  const projectRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "canal-config-test-",
      ),
    );

  if (envContents) {
    fs.writeFileSync(
      path.join(
        projectRoot,
        ".env",
      ),
      envContents,
    );
  }

  if (localContents) {
    fs.writeFileSync(
      path.join(
        projectRoot,
        ".env.local",
      ),
      localContents,
    );
  }

  return spawnSync(
    process.execPath,
    [
      validator,
      projectRoot,
    ],
    {
      encoding: "utf8",
      env: baseEnvironment,
    },
  );
}

const validConfiguration = [
  "EXPO_PUBLIC_SUPABASE_URL=https://canal.supabase.co",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_public_value",
  "EXPO_PUBLIC_SPOTIFY_CLIENT_ID=1234567890abcdef1234567890abcdef",
  "",
].join(
  "\n",
);

const validResult =
  runValidator(
    validConfiguration,
  );

assert.equal(
  validResult.status,
  0,
  validResult.stderr,
);

assert.match(
  validResult.stdout,
  /Spotify client ID: configured/,
);

const missingSpotify =
  runValidator(
    validConfiguration.replace(
      /EXPO_PUBLIC_SPOTIFY_CLIENT_ID=.*\n/,
      "",
    ),
  );

assert.equal(
  missingSpotify.status,
  1,
);

assert.match(
  missingSpotify.stderr,
  /EXPO_PUBLIC_SPOTIFY_CLIENT_ID/,
);

const localOverride =
  runValidator(
    validConfiguration,
    [
      "EXPO_PUBLIC_SPOTIFY_CLIENT_ID=\"abcdef1234567890abcdef1234567890\"",
      "",
    ].join(
      "\r\n",
    ),
  );

assert.equal(
  localOverride.status,
  0,
  localOverride.stderr,
);

const sentinel =
  "sentinel-client-id-must-not-leak";

const invalidResult =
  runValidator(
    validConfiguration.replace(
      /EXPO_PUBLIC_SPOTIFY_CLIENT_ID=.*/,
      `EXPO_PUBLIC_SPOTIFY_CLIENT_ID=${sentinel}`,
    ),
  );

assert.equal(
  invalidResult.status,
  1,
);

assert.equal(
  `${invalidResult.stdout}${invalidResult.stderr}`.includes(
    sentinel,
  ),
  false,
);

const recoverySource =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "canal-config-source-",
    ),
  );

const recoveryTarget =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "canal-config-target-",
    ),
  );

const recoveredClientId =
  "abcdef1234567890abcdef1234567890";

fs.writeFileSync(
  path.join(
    recoverySource,
    ".env.local",
  ),
  `EXPO_PUBLIC_SPOTIFY_CLIENT_ID=${recoveredClientId}\n`,
);

fs.writeFileSync(
  path.join(
    recoveryTarget,
    ".env.local",
  ),
  validConfiguration.replace(
    /EXPO_PUBLIC_SPOTIFY_CLIENT_ID=.*\n/,
    "",
  ),
);

const recoveryResult =
  spawnSync(
    process.execPath,
    [
      recoveryScript,
      recoveryTarget,
      recoverySource,
    ],
    {
      encoding: "utf8",
      env: baseEnvironment,
    },
  );

assert.equal(
  recoveryResult.status,
  0,
  recoveryResult.stderr,
);

assert.equal(
  `${recoveryResult.stdout}${recoveryResult.stderr}`.includes(
    recoveredClientId,
  ),
  false,
);

assert.match(
  fs.readFileSync(
    path.join(
      recoveryTarget,
      ".env.local",
    ),
    "utf8",
  ),
  /EXPO_PUBLIC_SPOTIFY_CLIENT_ID=abcdef1234567890abcdef1234567890/,
);

assert.equal(
  fs.statSync(
    path.join(
      recoveryTarget,
      ".env.local",
    ),
  ).mode &
    0o777,
  0o600,
);

const recoveryReplacementTarget =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "canal-config-replacement-target-",
    ),
  );

fs.writeFileSync(
  path.join(
    recoveryReplacementTarget,
    ".env.local",
  ),
  [
    "KEEP_EXISTING_CONFIGURATION=true",
    "EXPO_PUBLIC_SPOTIFY_CLIENT_ID=invalid-client-id-with-a-long-stale-tail",
    "KEEP_TRAILING_CONFIGURATION=true",
    "",
  ].join(
    "\n",
  ),
  {
    mode: 0o666,
  },
);

const recoveryReplacementResult =
  spawnSync(
    process.execPath,
    [
      recoveryScript,
      recoveryReplacementTarget,
      recoverySource,
    ],
    {
      encoding: "utf8",
      env: baseEnvironment,
    },
  );

assert.equal(
  recoveryReplacementResult.status,
  0,
  recoveryReplacementResult.stderr,
);

assert.equal(
  fs.readFileSync(
    path.join(
      recoveryReplacementTarget,
      ".env.local",
    ),
    "utf8",
  ),
  [
    "KEEP_EXISTING_CONFIGURATION=true",
    `EXPO_PUBLIC_SPOTIFY_CLIENT_ID=${recoveredClientId}`,
    "KEEP_TRAILING_CONFIGURATION=true",
    "",
  ].join(
    "\n",
  ),
);

assert.equal(
  fs.statSync(
    path.join(
      recoveryReplacementTarget,
      ".env.local",
    ),
  ).mode &
    0o777,
  0o600,
);

assert.equal(
  `${recoveryReplacementResult.stdout}${recoveryReplacementResult.stderr}`.includes(
    recoveredClientId,
  ),
  false,
);

const symlinkTarget =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "canal-config-symlink-target-",
    ),
  );

const symlinkVictim =
  path.join(
    symlinkTarget,
    "shared-environment",
  );

const symlinkSentinel =
  "KEEP_EXISTING_CONFIGURATION=true\n";

fs.writeFileSync(
  symlinkVictim,
  symlinkSentinel,
);

fs.symlinkSync(
  symlinkVictim,
  path.join(
    symlinkTarget,
    ".env.local",
  ),
);

const symlinkRecoveryResult =
  spawnSync(
    process.execPath,
    [
      recoveryScript,
      symlinkTarget,
      recoverySource,
    ],
    {
      encoding: "utf8",
      env: baseEnvironment,
    },
  );

assert.notEqual(
  symlinkRecoveryResult.status,
  0,
);

assert.match(
  symlinkRecoveryResult.stderr,
  /symbolic .env.local link/,
);

assert.equal(
  fs.readFileSync(
    symlinkVictim,
    "utf8",
  ),
  symlinkSentinel,
);

assert.equal(
  `${symlinkRecoveryResult.stdout}${symlinkRecoveryResult.stderr}`.includes(
    recoveredClientId,
  ),
  false,
);

const recoveryCreationTarget =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "canal-config-creation-target-",
    ),
  );

const recoveryCreationResult =
  spawnSync(
    process.execPath,
    [
      recoveryScript,
      recoveryCreationTarget,
      recoverySource,
    ],
    {
      encoding: "utf8",
      env: baseEnvironment,
    },
  );

assert.equal(
  recoveryCreationResult.status,
  0,
  recoveryCreationResult.stderr,
);

assert.equal(
  fs.readFileSync(
    path.join(
      recoveryCreationTarget,
      ".env.local",
    ),
    "utf8",
  ).match(
    /^EXPO_PUBLIC_SPOTIFY_CLIENT_ID=/gm,
  )?.length,
  1,
);

assert.equal(
  `${recoveryCreationResult.stdout}${recoveryCreationResult.stderr}`.includes(
    recoveredClientId,
  ),
  false,
);

console.log(
  "Canal configuration preflight tests passed.",
);
