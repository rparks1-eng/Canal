import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

const PROJECT_ROOT = resolve(__dirname, "..");

const PATHS = {
  contract: "lib/genius-context-contract.ts",
  functionHelpers: "supabase/functions/genius-context/helpers.ts",
  functionIndex: "supabase/functions/genius-context/index.ts",
} as const;

const CLIENT_ROOTS = [
  "app",
  "components",
  "lib",
] as const;

const ALLOWED_RESPONSE_KEYS = new Set([
  "provider",
  "attribution",
  "song",
  "fetchedAt",
  "id",
  "title",
  "artist",
  "album",
  "releaseDate",
  "artworkUrl",
  "geniusUrl",
  "description",
  "genres",
  "matchConfidence",
  "credits",
  "annotations",
  "popularity",
  "media",
  "links",
  "label",
  "commercialUseRequiresLicense",
  "names",
  "body",
  "verified",
  "votesTotal",
  "url",
  "type",
  "pageviews",
  "error",
  "code",
  "message",
  "retryAfterSeconds",
]);

function read(relativePath: string): string {
  return readFileSync(resolve(PROJECT_ROOT, relativePath), "utf8");
}

function listSourceFiles(relativeRoot: string): string[] {
  const absoluteRoot = resolve(PROJECT_ROOT, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const visit = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) return visit(absolute);
      return /\.(?:ts|tsx|js|jsx)$/u.test(entry.name) ? [absolute] : [];
    });
  return visit(absoluteRoot);
}

describe("Genius context security contract", () => {
  it("keeps the provider credential exclusively in the server function", () => {
    for (const relativePath of Object.values(PATHS)) {
      expect(existsSync(resolve(PROJECT_ROOT, relativePath))).toBe(true);
    }

    const clientSources = CLIENT_ROOTS.flatMap(listSourceFiles)
      .map((absolutePath) => readFileSync(absolutePath, "utf8"))
      .join("\n");

    expect(clientSources).not.toMatch(/EXPO_PUBLIC_[A-Z0-9_]*GENIUS/iu);
    expect(clientSources).not.toMatch(/process\.env\.[A-Z0-9_]*GENIUS/iu);
    expect(clientSources).not.toMatch(/Deno\.env\.get\(["'][A-Z0-9_]*GENIUS/iu);

    const serverSource = `${read(PATHS.functionHelpers)}\n${read(PATHS.functionIndex)}`;
    expect(serverSource).toMatch(/getRequiredEnvironment\(["']GENIUS_ACCESS_TOKEN["']\)/u);
    expect(serverSource).toMatch(/Deno\.env\.get\(name\)/u);
    expect(serverSource).toMatch(/authorization/iu);
    expect(serverSource).toMatch(/Bearer/u);
    expect(serverSource).not.toMatch(/access_token\s*[:=]/iu);
    expect(serverSource).not.toMatch(/console\.(?:log|info|warn|error)\([^\n]*(?:token|authorization)/iu);
  });

  it("requires an authenticated caller and bounds every provider lookup input", () => {
    const source = `${read(PATHS.functionHelpers)}\n${read(PATHS.functionIndex)}`;

    expect(source).toMatch(/(?:getUser|getClaims|auth:\s*["']user["']|verify_jwt|requireAuthenticatedUser|\/auth\/v1\/user)/u);
    expect(source).toMatch(/title/u);
    expect(source).toMatch(/artist/u);
    expect(source).toMatch(/(?:max|MAX|length)/u);
    expect(source).toMatch(/geniusSongId/u);
    expect(source).toMatch(/Number\.isSafeInteger|safe integer|positive integer/iu);
    expect(source).toMatch(/content-type/iu);
    expect(source).toMatch(/application\/json/iu);
    expect(source).toMatch(/request\.method\s*===\s*["']OPTIONS["']/u);
    expect(source).toMatch(/access-control-allow-origin/iu);
    expect(source).toMatch(/access-control-allow-headers/iu);
    expect(source).toMatch(/x-client-info/iu);
    expect(source).toMatch(/x-retry-count/iu);
  });

  it("publishes an explicit allowlist and excludes lyrics or referent fragments", () => {
    const contract = read(PATHS.contract);
    const serverSource = `${read(PATHS.functionHelpers)}\n${read(PATHS.functionIndex)}`;
    const production = `${contract}\n${serverSource}`;

    for (const key of [
      "provider",
      "attribution",
      "song",
      "fetchedAt",
      "geniusUrl",
      "description",
      "credits",
      "annotations",
      "media",
      "links",
    ]) {
      expect(production).toContain(key);
      expect(ALLOWED_RESPONSE_KEYS.has(key)).toBe(true);
    }

    expect(contract).not.toMatch(/\b(?:lyrics|lyricsHtml|lyricsBody|referentFragment|fragment)\s*[?:]/iu);
    expect(serverSource).not.toMatch(/genius\.com\/[^"'`]*fetch/iu);
    expect(serverSource).not.toMatch(/text_format=(?:html|dom)/iu);
  });

  it("keeps Genius context ephemeral and account-scoped on the client", () => {
    const geniusClientSources = CLIENT_ROOTS.flatMap(listSourceFiles)
      .filter((path) => /genius|liner[-_ ]?notes|song[-_ ]?context/iu.test(path))
      .map((absolutePath) => readFileSync(absolutePath, "utf8"))
      .join("\n");

    expect(geniusClientSources).not.toMatch(/(?:AsyncStorage|SecureStore)\s*\.\s*(?:setItem|multiSet)/iu);
    expect(geniusClientSources).not.toMatch(/from\s+["'][^"']*(?:async-storage|secure-store)/iu);
  });
});
