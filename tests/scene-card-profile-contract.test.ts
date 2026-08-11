import fs from "node:fs";
import path from "node:path";

const component = fs.readFileSync(path.join(process.cwd(), "components/canal-ui/scene-card-profile.tsx"), "utf8");
const surfaces = [
  "app/(tabs)/library.tsx",
  "app/(tabs)/explore.tsx",
  "app/(tabs)/explore-category.tsx",
  "app/(tabs)/index.tsx",
].map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8"));

describe("shared Scene card profile", () => {
  it("owns the simple vibrant visual identity stack", () => {
    expect(component).toContain("SceneEnergySignature");
    expect(component).toContain("sceneCardDescriptors");
    expect(component).toContain("styles.descriptorText");
    expect(component).toContain("styles.descriptorDot");
    expect(component).not.toContain("styles.categoryChip");
    expect(component).not.toContain("SceneMoodBreakdown");
    expect(component).not.toContain("SceneGenreBreakdown");
    expect(component).not.toContain("MOOD MIX");
    expect(component).not.toContain("GENRE DNA");
    expect(component).toContain("SceneCardProfileVariant");
  });

  it("drives every primary Scene discovery surface", () => {
    for (const source of surfaces) expect(source).toContain("<SceneCardProfile");
  });
});
