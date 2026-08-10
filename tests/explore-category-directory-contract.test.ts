import fs from "node:fs";
import path from "node:path";

describe("Explore curated category directory", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "explore-category-directory.tsx"), "utf8");
  const explore = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "explore.tsx"), "utf8");
  const layout = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "_layout.tsx"), "utf8");

  it("opens a complete Canal-curated directory from every Explore heading", () => {
    expect(explore).toContain('accessibilityLabel={`View all ${props.title.toLowerCase()}`}');
    expect(explore).toContain('pathname: "/explore-category-directory"');
    expect(layout).toContain('name="explore-category-directory"');
    expect(route).toContain("SCENE_ACTIVITY_OPTIONS");
    expect(route).toContain("SCENE_MOOD_OPTIONS");
    expect(route).toContain("SCENE_GENRE_OPTIONS");
  });

  it("uses assigned palettes, search, a two-column grid, and working category links", () => {
    expect(route).toContain("scenePresentation({");
    expect(route).toContain("exploreCategoryIcon(kind, item.value)");
    expect(route).toContain('accessibilityLabel={`Search all ${heading.toLowerCase()}`}');
    expect(route).toContain('width: "48.6%"');
    expect(route).toContain('pathname: "/explore-category"');
    expect(route).toContain("value: item.value, label: item.label");
    expect(route).toContain('accessibilityLabel="Back to Explore"');
  });
});
