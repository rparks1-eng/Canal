import fs from "node:fs";
import path from "node:path";

describe("Explore category route", () => {
  const categorySource = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "explore-category.tsx"), "utf8");
  const exploreSource = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "explore.tsx"), "utf8");
  const layoutSource = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "_layout.tsx"), "utf8");
  const socialSource = fs.readFileSync(path.join(process.cwd(), "lib", "social.ts"), "utf8");

  it("routes every designed category icon into a hidden tab detail screen", () => {
    expect(exploreSource).toContain('pathname: "/explore-category"');
    expect(exploreSource).toContain("Open ${value} ${props.kind} Scenes");
    expect(exploreSource).toContain("exploreCategoryIcon(props.kind, value)");
    expect(layoutSource).toContain('name="explore-category"');
    expect(layoutSource).toMatch(/name="explore-category"[\s\S]*?href: null/u);
  });

  it("populates matching public Scenes with an explicit verified filter", () => {
    expect(categorySource).toContain("loadExploreScenes({ force: refresh })");
    expect(categorySource).toContain("filterExploreCategoryScenes");
    expect(categorySource).toContain('option === "public" ? "Show all public Scenes" : "Show verified Scenes"');
    expect(categorySource).toContain('accessibilityRole="radiogroup"');
    expect(categorySource).toContain('pathname: "/public-scene"');
    expect(socialSource).toContain('"payload->>visibility"');
    expect(socialSource).toContain("await assertSceneCacheOwner(sceneCacheOwner)");
    expect(socialSource).toContain("exploreSceneCache.generation === sceneCacheOwner.generation");
  });

  it("has safe back, loading, error, retry, empty, search, and 48pt controls", () => {
    expect(categorySource).toContain('accessibilityLabel="Back to Explore"');
    expect(categorySource).toContain('router.replace("/(tabs)/explore")');
    expect(categorySource).toContain('accessibilityLabel="Retry category"');
    expect(categorySource).toContain("No matching Scenes");
    expect(categorySource).toContain("width: 48, height: 48");
    expect(categorySource).toContain("minHeight: 48");
  });
});
