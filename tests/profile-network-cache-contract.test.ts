import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "app", "(tabs)", "profile.tsx"),
  "utf8",
);

describe("Profile network cache contract", () => {
  it("keeps recent account-scoped network data visible while refreshing", () => {
    expect(source).toContain("PROFILE_NETWORK_CACHE_TTL_MS");
    expect(source).toContain("profileNetworkCache.get(userId)");
    expect(source).toContain("profileNetworkCache.delete(userId)");
    expect(source).toContain("setConnectionSummary(cachedNetwork?.summary ?? null)");
    expect(source).toContain("setPlaylistExports(cachedNetwork?.exports ?? [])");
    expect(source).toContain("setSocialDataResolved(\n              Boolean(cachedNetwork)");
  });

  it("refreshes the cache only with the current identity's resolved data", () => {
    expect(source).toContain("if (!isCurrent())");
    expect(source).toContain("profileNetworkCache.set(identityKey");
    expect(source).toContain("cachedAt: Date.now()");
  });
});
