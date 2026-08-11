import fs from "node:fs";
import path from "node:path";

const homeSource = fs.readFileSync(
  path.join(process.cwd(), "app/(tabs)/index.tsx"),
  "utf8",
);
const exploreSource = fs.readFileSync(
  path.join(process.cwd(), "app/(tabs)/explore.tsx"),
  "utf8",
);

describe("Home and Explore Scene layout", () => {
  it("renders Recent Scenes as a horizontal grid-card rail", () => {
    const recentHeading = homeSource.indexOf("Recent Scenes");
    const recentRail = homeSource.indexOf('accessibilityLabel="Recent Scenes"', recentHeading);
    const railEnd = homeSource.indexOf("</ScrollView>", recentRail);
    const rail = homeSource.slice(recentRail, railEnd);

    expect(recentRail).toBeGreaterThan(recentHeading);
    expect(rail).toContain("horizontal");
    expect(rail).toContain("styles.horizontalScenes");
    expect(rail).toContain("compact");
    expect(rail).toContain("recentScenes.length > 0");
  });

  it("does not dump every public Scene below the default Explore directory", () => {
    expect(exploreSource).toContain(
      'activeContent === "scenes" && !query.trim() ? null',
    );
    expect(exploreSource).toContain("filteredScenes.map");
    expect(exploreSource.indexOf('activeContent === "scenes" && !query.trim() ? null')).toBeLessThan(
      exploreSource.indexOf("filteredScenes.map"),
    );
  });
});
