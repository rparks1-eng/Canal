#!/usr/bin/env node

const path =
  require("node:path");

const {
  parseProjectEnv,
} = require("@expo/env");

const projectRoot =
  path.resolve(
    process.argv[2] ??
      process.cwd(),
  );

const parsed =
  parseProjectEnv(
    projectRoot,
    {
      mode:
        process.env.NODE_ENV ??
        "development",

      silent: true,

      systemEnv:
        process.env,
    },
  );

function readValue(name) {
  return (
    process.env[name] ??
    parsed.env[name] ??
    ""
  ).trim();
}

const errors = [];

const supabaseUrl =
  readValue(
    "EXPO_PUBLIC_SUPABASE_URL",
  );

if (
  !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(
    supabaseUrl,
  )
) {
  errors.push(
    "Set EXPO_PUBLIC_SUPABASE_URL to the Canal project's https://…supabase.co URL.",
  );
}

const shareBaseUrl =
  readValue(
    "EXPO_PUBLIC_CANAL_SHARE_BASE_URL",
  );

let validShareBaseUrl =
  false;

try {
  const parsedShareBaseUrl =
    new URL(
      shareBaseUrl,
    );

  const normalizedPath =
    parsedShareBaseUrl.pathname.replace(
      /\/+$/,
      "",
    );

  const canonicalShareBaseUrl =
    `${parsedShareBaseUrl.protocol}//` +
    parsedShareBaseUrl.host.toLowerCase() +
    (
      normalizedPath ===
        "/"
        ? ""
        : normalizedPath
    );

  validShareBaseUrl =
    parsedShareBaseUrl.protocol ===
      "https:" &&
    !parsedShareBaseUrl.username &&
    !parsedShareBaseUrl.password &&
    !parsedShareBaseUrl.search &&
    !parsedShareBaseUrl.hash &&
    !shareBaseUrl.includes(
      "?",
    ) &&
    !shareBaseUrl.includes(
      "#",
    ) &&
    shareBaseUrl ===
      canonicalShareBaseUrl;
} catch {
  validShareBaseUrl =
    false;
}

if (!validShareBaseUrl) {
  errors.push(
    "Set EXPO_PUBLIC_CANAL_SHARE_BASE_URL to Canal's canonical HTTPS share base without credentials, a query, a fragment, or a trailing slash.",
  );
}

const supabaseKey =
  readValue(
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );

let jwtRole =
  "";
let validLegacyJwtShape =
  false;

if (
  supabaseKey.startsWith(
    "eyJ",
  )
) {
  try {
    const segments =
      supabaseKey.split(
        ".",
      );

    if (
      segments.length !== 3 ||
      segments.some(
        (segment) =>
          !segment ||
          !/^[a-z0-9_-]+$/i.test(
            segment,
          ),
      )
    ) {
      throw new Error(
        "Invalid legacy JWT shape.",
      );
    }

    const payload =
      JSON.parse(
        Buffer.from(
          segments[1],
          "base64url",
        ).toString(
          "utf8",
        ),
      );

    validLegacyJwtShape =
      typeof payload ===
        "object" &&
      payload !== null;

    jwtRole =
      validLegacyJwtShape &&
      typeof payload.role ===
        "string"
        ? payload.role
        : "";
  } catch {
    jwtRole =
      "invalid";
  }
}

if (
  !(
    supabaseKey.startsWith(
      "sb_publishable_",
    ) ||
    (
      supabaseKey.startsWith(
        "eyJ",
      ) &&
      validLegacyJwtShape &&
      jwtRole ===
        "anon"
    )
  ) ||
  supabaseKey.startsWith(
    "sb_secret_",
  )
) {
  errors.push(
    "Set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to a publishable or legacy anon key.",
  );
}

const spotifyClientId =
  readValue(
    "EXPO_PUBLIC_SPOTIFY_CLIENT_ID",
  );

if (
  !/^[a-z0-9]{16,128}$/i.test(
    spotifyClientId,
  ) ||
  /^(your|replace|spotify)/i.test(
    spotifyClientId,
  )
) {
  errors.push(
    "Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID to Canal's public Spotify application client ID.",
  );
}

const webRedirect =
  readValue(
    "EXPO_PUBLIC_SPOTIFY_REDIRECT_URI",
  );

if (
  webRedirect &&
  !webRedirect.startsWith(
    "https://",
  )
) {
  errors.push(
    "EXPO_PUBLIC_SPOTIFY_REDIRECT_URI is optional for native testing; when set, it must be the deployed HTTPS web callback.",
  );
}

if (errors.length > 0) {
  console.error(
    "Canal configuration is incomplete.",
  );

  for (const error of errors) {
    console.error(
      `- ${error}`,
    );
  }

  console.error(
    `Update ${path.join(
      projectRoot,
      ".env.local",
    )}.`,
  );

  console.error(
    "- Spotify's native dashboard redirect must be com.raishawnparks.canal.spotify://callback.",
  );

  process.exit(1);
}

console.log(
  "Canal public configuration is ready.",
);

console.log(
  "- Supabase URL: configured",
);

console.log(
  "- Supabase publishable key: configured",
);

console.log(
  "- Canal share base URL: configured",
);

console.log(
  "- Spotify client ID: configured",
);

console.log(
  "- Spotify native redirect: com.raishawnparks.canal.spotify://callback",
);
