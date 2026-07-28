#!/usr/bin/env node

const fs =
  require("node:fs");
const {
  Buffer,
} = require("node:buffer");
const os =
  require("node:os");
const path =
  require("node:path");

const {
  parseProjectEnv,
} = require("@expo/env");

const targetRoot =
  path.resolve(
    process.argv[2] ??
      process.cwd(),
  );

const suppliedCandidates =
  process.argv.slice(
    3,
  );

const candidateRoots =
  (
    suppliedCandidates.length >
    0
      ? suppliedCandidates
      : [
          path.join(
            os.homedir(),
            "canal",
          ),
          path.join(
            os.homedir(),
            "Canal",
          ),
          path.join(
            os.homedir(),
            "Desktop",
            "canal",
          ),
          path.join(
            os.homedir(),
            "Desktop",
            "Canal",
          ),
          path.join(
            os.homedir(),
            "Documents",
            "canal",
          ),
          path.join(
            os.homedir(),
            "Documents",
            "Canal",
          ),
        ]
  )
    .map(
      (candidate) =>
        path.resolve(
          candidate,
        ),
    )
    .filter(
      (
        candidate,
        index,
        all,
      ) =>
        candidate !==
          targetRoot &&
        all.indexOf(
          candidate,
        ) ===
          index,
    );

function readClientId(
  projectRoot,
) {
  if (
    !fs.existsSync(
      projectRoot,
    )
  ) {
    return "";
  }

  try {
    const parsed =
      parseProjectEnv(
        projectRoot,
        {
          mode:
            "development",
          silent: true,
          systemEnv: {},
        },
      );

    return (
      parsed.env
        .EXPO_PUBLIC_SPOTIFY_CLIENT_ID ??
      ""
    ).trim();
  } catch {
    return "";
  }
}

function isValidClientId(
  value,
) {
  return /^[a-z0-9]{16,128}$/i.test(
    value,
  );
}

const existingClientId =
  readClientId(
    targetRoot,
  );

if (
  isValidClientId(
    existingClientId,
  )
) {
  console.log(
    "Canal already has a Spotify client ID in .env.local.",
  );

  process.exit(0);
}

let recoveredClientId =
  "";

let recoveredFrom =
  "";

for (
  const candidateRoot of
  candidateRoots
) {
  const candidateClientId =
    readClientId(
      candidateRoot,
    );

  if (
    isValidClientId(
      candidateClientId,
    )
  ) {
    recoveredClientId =
      candidateClientId;

    recoveredFrom =
      candidateRoot;

    break;
  }
}

if (!recoveredClientId) {
  console.error(
    "No previous Canal Spotify client ID was found in the known local Canal folders.",
  );

  console.error(
    "Open https://developer.spotify.com/dashboard, select Canal, and copy its public Client ID into EXPO_PUBLIC_SPOTIFY_CLIENT_ID in .env.local.",
  );

  process.exit(1);
}

const targetFile =
  path.join(
    targetRoot,
    ".env.local",
  );

const targetFlags =
  fs.constants.O_RDWR |
  fs.constants.O_CREAT |
  (
    fs.constants
      .O_NOFOLLOW ??
    0
  );

let targetDescriptor;

try {
  targetDescriptor =
    fs.openSync(
      targetFile,
      targetFlags,
      0o600,
    );
} catch (error) {
  if (
    error &&
    typeof error ===
      "object" &&
    error.code ===
      "ELOOP"
  ) {
    console.error(
      "Refusing to recover Spotify configuration through a symbolic .env.local link.",
    );

    process.exit(1);
  }

  throw error;
}

try {
  const targetStats =
    fs.fstatSync(
      targetDescriptor,
    );

  if (
    !targetStats.isFile()
  ) {
    throw new Error(
      "Canal's .env.local path must be a regular file.",
    );
  }

  fs.fchmodSync(
    targetDescriptor,
    0o600,
  );

  const currentContents =
    fs.readFileSync(
      targetDescriptor,
      "utf8",
    );

  const clientIdLine =
    `EXPO_PUBLIC_SPOTIFY_CLIENT_ID=${recoveredClientId}`;

  const updatedContents =
    /^EXPO_PUBLIC_SPOTIFY_CLIENT_ID\s*=.*$/m.test(
      currentContents,
    )
      ? currentContents.replace(
          /^EXPO_PUBLIC_SPOTIFY_CLIENT_ID\s*=.*$/m,
          clientIdLine,
        )
      : `${
          currentContents.replace(
            /\s*$/,
            "",
          )
        }\n${clientIdLine}\n`;

  const updatedBuffer =
    Buffer.from(
      updatedContents,
      "utf8",
    );

  let bytesWritten =
    0;

  while (
    bytesWritten <
    updatedBuffer.length
  ) {
    const nextWrite =
      fs.writeSync(
        targetDescriptor,
        updatedBuffer,
        bytesWritten,
        updatedBuffer.length -
          bytesWritten,
        bytesWritten,
      );

    if (
      nextWrite ===
      0
    ) {
      throw new Error(
        "Canal could not finish writing .env.local.",
      );
    }

    bytesWritten +=
      nextWrite;
  }

  fs.ftruncateSync(
    targetDescriptor,
    updatedBuffer.length,
  );

  fs.fsyncSync(
    targetDescriptor,
  );
} finally {
  fs.closeSync(
    targetDescriptor,
  );
}

console.log(
  `Recovered Canal's Spotify client ID from ${recoveredFrom}.`,
);

console.log(
  "The client ID was written to the current .env.local without printing its value.",
);
