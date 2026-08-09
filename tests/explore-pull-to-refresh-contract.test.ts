import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Explore pull-to-refresh", () => {
  const source = readFileSync(
    resolve(process.cwd(), "app/(tabs)/explore.tsx"),
    "utf8",
  );

  it("uses the native discreet refresh control without a visible button", () => {
    expect(source).toContain("<RefreshControl");
    expect(source).toContain('void load("refresh")');
    expect(source).toContain("refreshing={refreshing}");
    expect(source).not.toContain('accessibilityLabel="Refresh Explore"');
    expect(source).not.toContain("styles.refreshButton");
  });

  it("keeps the full loading card out of pull refreshes", () => {
    expect(source).toContain('const isPullRefresh = mode === "refresh"');
    expect(source).toMatch(/if \(!isPullRefresh\) \{\s*setLoading\(true\);/);
    expect(source).toMatch(/setRefreshing\(\s*false,?\s*\);/);
  });
});
