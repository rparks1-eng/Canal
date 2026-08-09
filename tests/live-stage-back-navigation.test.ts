import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Live Stage back navigation", () => {
  const source = readFileSync(
    resolve(process.cwd(), "app/live-stage/[stageId].tsx"),
    "utf8",
  );

  it("uses one accessible header action in every Stage state", () => {
    expect(source).toContain('accessibilityLabel="Back from Stage"');
    expect(source).toContain('name="chevron-back"');
    expect(source.match(/headerLeft:\s*stageHeaderLeft/g)).toHaveLength(3);
    expect(source.match(/headerBackVisible:\s*false/g)).toHaveLength(3);
    expect(source).toMatch(/headerBack:[\s\S]*height:\s*48,[\s\S]*width:\s*48,/);
    expect(source).toMatch(/headerBackIcon:[\s\S]*translateX:\s*-1/u);
  });

  it("returns through history and safely falls back to the Stages view", () => {
    expect(source).toMatch(/if \(router\.canGoBack\(\)\) \{\s*router\.back\(\);\s*\} else \{\s*router\.replace\("\/\(tabs\)\/live"\);/);
  });
});
